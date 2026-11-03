import { createHash } from 'node:crypto';
import path from 'node:path';
import * as z from 'zod/v4';
import { EXPORT_FORMATS, extensionForFormat, mimeTypeForFormat } from '../openscad/formats.js';
import type { ExportToolResult } from '../types/toolResults.js';
import type { ToolDependencies } from './index.js';
import { refineSingleSource, sourceFields } from './modelInput.js';
import { errorRunResult } from './toolResponse.js';

export const exportModelInputSchema = z
  .object({
    ...sourceFields,
    format: z.enum(EXPORT_FORMATS),
    outputPath: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Workspace-relative output file. Defaults to the source path with the format extension.'
      )
  })
  .superRefine(refineSingleSource);

export type ExportModelInput = z.infer<typeof exportModelInputSchema>;

export async function handleExportModel(
  rawInput: unknown,
  deps: ToolDependencies
): Promise<ExportToolResult> {
  const started = performance.now();
  try {
    const input = exportModelInputSchema.parse(rawInput);
    const source = await deps.workspace.resolveModelInput({
      path: input.path,
      scad: input.scad,
      files: input.files,
      maxInputBytes: deps.config.limits.maxInputBytes
    });

    const result = await deps.semaphore.run(
      () =>
        deps.runner.export(
          {
            sourcePath: source.sourcePath,
            scad: source.scad,
            files: source.files,
            format: input.format,
            defines: input.defines,
            enableManifold: input.enableManifold,
            timeoutMs: input.timeoutMs ?? deps.config.limits.maxRenderMs
          },
          deps.signal
        ),
      deps.signal
    );

    if (!result.ok) {
      return result;
    }

    const outputPath = resolveOutputPath(input, source.sourcePath);
    const extension = extensionForFormat(input.format);
    if (path.extname(outputPath).toLowerCase() !== extension) {
      throw new Error(`Output path must end with ${extension} for ${input.format} exports.`);
    }
    if (input.path && outputPath === input.path) {
      throw new Error('Output path must not overwrite the SCAD source.');
    }

    const output = await deps.workspace.writeWorkspaceBinary({
      path: outputPath,
      data: result.data,
      maxBytes: deps.config.limits.maxOutputBytes,
      allowedExtensions: new Set([extension])
    });

    return {
      ok: true,
      output: {
        path: output.path,
        filename: path.basename(output.path),
        format: input.format,
        mimeType: mimeTypeForFormat(input.format),
        sizeBytes: output.sizeBytes,
        sha256: createHash('sha256').update(result.data).digest('hex')
      },
      diagnostics: result.diagnostics,
      stdout: result.stdout,
      stderr: result.stderr,
      elapsedMs: result.elapsedMs
    };
  } catch (error) {
    return errorRunResult(error, Math.round(performance.now() - started));
  }
}

function resolveOutputPath(
  input: z.infer<typeof exportModelInputSchema>,
  sourcePath: string
): string {
  if (input.outputPath) {
    return input.outputPath;
  }
  if (!input.path) {
    throw new Error('outputPath is required when exporting inline scad.');
  }
  const extension = extensionForFormat(input.format);
  return sourcePath.slice(0, -path.extname(sourcePath).length) + extension;
}
