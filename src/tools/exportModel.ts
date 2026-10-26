import * as z from 'zod/v4';
import { EXPORT_FORMATS } from '../openscad/formats.js';
import { attachStlPreviewLink } from '../preview/attachPreviewLink.js';
import type { ExportToolResult } from '../types/toolResults.js';
import type { ToolDependencies } from './index.js';
import { definesSchema, filesSchema } from './validate.js';
import { errorRunResult } from './toolResponse.js';

export const exportModelInputSchema = z.object({
  scad: z.string().min(1),
  format: z.enum(EXPORT_FORMATS),
  files: filesSchema.optional(),
  defines: definesSchema.optional(),
  enableManifold: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional()
});

export type ExportModelInput = z.infer<typeof exportModelInputSchema>;

export async function handleExportModel(
  rawInput: unknown,
  deps: ToolDependencies
): Promise<ExportToolResult> {
  const started = performance.now();
  try {
    const input = exportModelInputSchema.parse(rawInput);
    const job = await deps.workspace.createJob();
    try {
      await deps.workspace.writeJobInputs({
        job,
        scad: input.scad,
        files: input.files,
        maxInputBytes: deps.config.limits.maxInputBytes
      });

      const result = await deps.semaphore.run(
        () =>
          deps.runner.export(
            {
              ...input,
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

      const artifact = await deps.artifacts.saveArtifact({
        jobId: job.id,
        suffix: result.filename,
        format: result.format,
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
    } finally {
      await deps.workspace.cleanupJob(job, deps.config.limits.cleanupJobs);
    }
  } catch (error) {
    return errorRunResult(error, Math.round(performance.now() - started));
  }
}
