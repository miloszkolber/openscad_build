import * as z from 'zod/v4';

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

export const sourceFields = {
  path: z
    .string()
    .min(1)
    .optional()
    .describe('Workspace-relative SCAD source path. Files beside the source are staged automatically.'),
  scad: z.string().min(1).optional().describe('Inline SCAD source instead of a workspace path.'),
  files: filesSchema.optional().describe('Additional workspace-relative files for include/import.'),
  defines: definesSchema.optional(),
  enableManifold: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional()
};

export function refineSingleSource(
  value: { path?: string; scad?: string },
  ctx: z.RefinementCtx
): void {
  if (value.path && value.scad !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide either path or scad, not both.'
    });
  }
  if (!value.path && value.scad === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide a workspace path or inline scad source.'
    });
  }
}
