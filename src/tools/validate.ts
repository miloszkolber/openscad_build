import * as z from 'zod/v4';
import type { ToolDependencies } from './index.js';
import { errorRunResult } from './toolResponse.js';
import type { ToolRunResult } from '../types/toolResults.js';

const fileContentSchema = z.union([
  z.string(),
  z.object({ base64: z.string().min(1) }),
  z.object({ contentBase64: z.string().min(1) })
]);

export const definesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number().finite(), z.boolean()])
);

export const filesSchema = z.record(z.string(), fileContentSchema);

export const validateInputSchema = z.object({
  scad: z.string().min(1),
  files: filesSchema.optional(),
  defines: definesSchema.optional(),
  enableManifold: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional()
});

export type ValidateInput = z.infer<typeof validateInputSchema>;

export async function handleValidate(
  rawInput: unknown,
  deps: ToolDependencies
): Promise<ToolRunResult> {
  const started = performance.now();
  try {
    const input = validateInputSchema.parse(rawInput);
    const job = await deps.workspace.createJob();
    try {
      await deps.workspace.writeJobInputs({
        job,
        scad: input.scad,
        files: input.files,
        maxInputBytes: deps.config.limits.maxInputBytes
      });

      return await deps.semaphore.run(
        () =>
          deps.runner.validate(
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
    } finally {
      await deps.workspace.cleanupJob(job, deps.config.limits.cleanupJobs);
    }
  } catch (error) {
    return errorRunResult(error, Math.round(performance.now() - started));
  }
}
