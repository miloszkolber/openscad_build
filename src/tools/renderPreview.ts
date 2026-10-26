import * as z from 'zod/v4';
import { formatPreviewCamera } from '../openscad/args.js';
import { attachStlPreviewLink } from '../preview/attachPreviewLink.js';
import { renderStlPreviewToWebp } from '../preview/StlPreviewRenderer.js';
import { assertWithinBytes } from '../security/limits.js';
import type { ExportToolResult } from '../types/toolResults.js';
import type { ToolDependencies } from './index.js';
import { definesSchema, filesSchema } from './validate.js';
import { errorRunResult } from './toolResponse.js';

const previewCameraSchema = z.string().refine(
  (value) => {
    try {
      formatPreviewCamera(value);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'Camera must contain 6 or 7 comma-separated finite numbers.'
  }
);

export const renderPreviewInputSchema = z.object({
  scad: z.string().min(1),
  width: z.number().int().positive().max(4096).optional(),
  height: z.number().int().positive().max(4096).optional(),
  camera: previewCameraSchema.optional(),
  viewAll: z.boolean().optional(),
  autoCenter: z.boolean().optional(),
  projection: z.enum(['orthogonal', 'perspective']).optional(),
  files: filesSchema.optional(),
  defines: definesSchema.optional(),
  timeoutMs: z.number().int().positive().optional()
});

export type RenderPreviewInput = z.infer<typeof renderPreviewInputSchema>;

export async function handleRenderPreview(
  rawInput: unknown,
  deps: ToolDependencies
): Promise<ExportToolResult> {
  const started = performance.now();
  try {
    const input = renderPreviewInputSchema.parse(rawInput);
    const job = await deps.workspace.createJob();
    try {
      await deps.workspace.writeJobInputs({
        job,
        scad: input.scad,
        files: input.files,
        maxInputBytes: deps.config.limits.maxInputBytes
      });

      const result = await deps.semaphore.run(
        async () =>
          deps.runner.export(
            {
              ...input,
              format: 'stl',
              jobId: job.id,
              jobDir: job.dir,
              timeoutMs: input.timeoutMs ?? deps.config.limits.maxRenderMs
            },
            deps.signal
          ),
        deps.signal
      );

      if (!result.ok) {
        return result;
      }

      assertWithinBytes(
        'Intermediate STL artifact',
        result.data.byteLength,
        deps.config.limits.maxOutputBytes
      );

      if (deps.config.preview.enabled) {
        const artifact = await deps.artifacts.saveArtifact({
          jobId: job.id,
          suffix: result.filename,
          format: 'stl',
          data: result.data
        });
        const preview = await attachStlPreviewLink(deps, artifact, {
          scad: input.scad,
          jobId: job.id
        });

        return {
          ok: true,
          artifact,
          ...preview,
          diagnostics: result.diagnostics,
          stdout: result.stdout,
          stderr: result.stderr,
          elapsedMs: result.elapsedMs
        };
      }

      const data = await renderStlPreviewToWebp(result.data, {
        width: input.width,
        height: input.height,
        camera: input.camera,
        viewAll: input.viewAll,
        autoCenter: input.autoCenter,
        projection: input.projection
      });

      const artifact = await deps.artifacts.saveArtifact({
        jobId: job.id,
        suffix: 'output.webp',
        format: 'webp',
        data
      });

      return {
        ok: true,
        artifact,
        diagnostics: result.diagnostics,
        stdout: result.stdout,
        stderr: result.stderr,
        elapsedMs: result.elapsedMs
      };
    } finally {
      await deps.workspace.cleanupJob(job, deps.config.limits.cleanupJobs);
    }
  } catch (error) {
    return errorRunResult(error, Math.round(performance.now() - started));
  }
}
