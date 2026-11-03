import { createHash } from 'node:crypto';
import path from 'node:path';
import * as z from 'zod/v4';
import { assertWithinBytes } from '../security/limits.js';
import { formatCamera } from '../render/camera.js';
import type { ImageFormat } from '../render/StlImageRenderer.js';
import { renderImageInWorker } from '../render/renderImageInWorker.js';
import { resolveSafePath } from '../workspace/safePaths.js';
import type { OutputMetadata, ScreenshotToolResult } from '../types/toolResults.js';
import type { ToolDependencies } from './index.js';
import { refineSingleSource, sourceFields } from './modelInput.js';
import { errorRunResult } from './toolResponse.js';

const imageFormatSchema = z.enum(['png', 'webp']);

const cameraSchema = z.string().refine(
  (value) => {
    try {
      formatCamera(value);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'Camera must contain 6 or 7 comma-separated finite numbers.'
  }
);

export const screenshotInputSchema = z
  .object({
    ...sourceFields,
    width: z.number().int().positive().max(4096).optional(),
    height: z.number().int().positive().max(4096).optional(),
    camera: cameraSchema.optional(),
    viewAll: z.boolean().optional(),
    autoCenter: z.boolean().optional(),
    projection: z.enum(['orthogonal', 'perspective']).optional(),
    format: imageFormatSchema.optional(),
    outputPath: z
      .string()
      .min(1)
      .optional()
      .describe('Optional workspace-relative image file to write in addition to the inline image.')
  })
  .superRefine(refineSingleSource);

export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  png: 'image/png',
  webp: 'image/webp'
};

export async function handleScreenshot(
  rawInput: unknown,
  deps: ToolDependencies
): Promise<ScreenshotToolResult> {
  const started = performance.now();
  try {
    const input = screenshotInputSchema.parse(rawInput);
    const format = input.format ?? 'png';
    if (input.outputPath) {
      const extension = `.${format}`;
      if (path.extname(input.outputPath).toLowerCase() !== extension)
        throw new Error(`outputPath must end with ${extension} for ${format} images.`);
      await resolveSafePath(deps.config.paths.workspaceDir, input.outputPath, {
        allowedExtensions: new Set([extension])
      });
    }
    const source = await deps.workspace.resolveModelInput({
      path: input.path,
      scad: input.scad,
      files: input.files,
      maxInputBytes: deps.config.limits.maxInputBytes
    });

    return await deps.semaphore.run(async () => {
      const executionStarted = performance.now();
      const timeoutMs = Math.min(
        input.timeoutMs ?? deps.config.limits.maxRenderMs,
        deps.config.limits.maxRenderMs
      );
      const result = await deps.runner.export(
        {
          sourcePath: source.sourcePath,
          scad: source.scad,
          files: source.files,
          format: 'stl',
          defines: input.defines,
          enableManifold: input.enableManifold,
          timeoutMs
        },
        deps.signal
      );

      if (!result.ok) {
        return {
          ...result,
          summary: {}
        };
      }

      assertWithinBytes(
        'Screenshot STL',
        result.data.byteLength,
        deps.config.limits.maxOutputBytes
      );
      deps.signal?.throwIfAborted();
      const image = await renderImageInWorker(
        result.data,
        {
          width: input.width,
          height: input.height,
          camera: input.camera,
          viewAll: input.viewAll,
          autoCenter: input.autoCenter,
          projection: input.projection,
          format
        },
        timeoutMs - (performance.now() - executionStarted),
        deps.config.limits.maxOutputBytes,
        deps.signal
      );

      assertWithinBytes(
        'Screenshot image',
        image.data.byteLength,
        deps.config.limits.maxOutputBytes
      );
      deps.signal?.throwIfAborted();
      let output: OutputMetadata | undefined;
      if (input.outputPath) {
        const extension = `.${format}`;
        const saved = await deps.workspace.writeWorkspaceBinary({
          path: input.outputPath,
          data: image.data,
          maxBytes: deps.config.limits.maxOutputBytes,
          allowedExtensions: new Set([extension])
        });
        output = {
          path: saved.path,
          filename: path.basename(saved.path),
          format,
          mimeType: IMAGE_MIME_TYPES[format],
          sizeBytes: saved.sizeBytes,
          sha256: createHash('sha256').update(image.data).digest('hex')
        };
      }

      return {
        ok: true,
        summary: image.summary,
        image: {
          format,
          width: image.width,
          height: image.height,
          mimeType: IMAGE_MIME_TYPES[format],
          sizeBytes: image.data.byteLength,
          sha256: createHash('sha256').update(image.data).digest('hex')
        },
        imageData: image.data,
        output,
        diagnostics: result.diagnostics,
        stdout: result.stdout,
        stderr: result.stderr,
        elapsedMs: Math.round(performance.now() - executionStarted)
      };
    }, deps.signal);
  } catch (error) {
    return {
      ...errorRunResult(error, Math.round(performance.now() - started)),
      summary: {}
    };
  }
}
