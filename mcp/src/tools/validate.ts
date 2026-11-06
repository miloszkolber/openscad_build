import * as z from 'zod/v4';
import type { ToolDependencies } from './index.js';
import { errorRunResult } from './toolResponse.js';
import { refineSingleSource, sourceFields } from './modelInput.js';
import type { ToolRunResult } from '../types/toolResults.js';

export const validateInputSchema = z
  .object(sourceFields)
  .superRefine(refineSingleSource);

export type ValidateInput = z.infer<typeof validateInputSchema>;

export async function handleValidate(
  rawInput: unknown,
  deps: ToolDependencies
): Promise<ToolRunResult> {
  const started = performance.now();
  try {
    const input = validateInputSchema.parse(rawInput);
    const source = await deps.workspace.resolveModelInput({
      path: input.path,
      scad: input.scad,
      files: input.files,
      maxInputBytes: deps.config.limits.maxInputBytes
    });

    return await deps.semaphore.run(
      () =>
        deps.runner.validate(
          {
            sourcePath: source.sourcePath,
            scad: source.scad,
            files: source.files,
            defines: input.defines,
            enableManifold: input.enableManifold,
            timeoutMs: input.timeoutMs ?? deps.config.limits.maxRenderMs
          },
          deps.signal
        ),
      deps.signal
    );
  } catch (error) {
    return errorRunResult(error, Math.round(performance.now() - started));
  }
}
