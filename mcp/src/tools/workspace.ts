import * as z from 'zod/v4';
import type { ToolDependencies } from './index.js';

export const workspaceListFilesInputSchema = z.object({
  path: z.string().optional()
});

export const workspaceReadFileInputSchema = z.object({
  path: z.string().min(1)
});

export const workspaceWriteFileInputSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export const workspaceDeleteFileInputSchema = z.object({
  path: z.string().min(1)
});

export async function handleWorkspaceListFiles(rawInput: unknown, deps: ToolDependencies) {
  const input = workspaceListFilesInputSchema.parse(rawInput ?? {});
  const files = await deps.workspace.listFiles(input.path ?? '.');
  return { ok: true, files };
}

export async function handleWorkspaceReadFile(rawInput: unknown, deps: ToolDependencies) {
  const input = workspaceReadFileInputSchema.parse(rawInput);
  const file = await deps.workspace.readWorkspaceFile(input.path);
  return { ok: true, path: input.path, ...file };
}

export async function handleWorkspaceWriteFile(rawInput: unknown, deps: ToolDependencies) {
  const input = workspaceWriteFileInputSchema.parse(rawInput);
  const file = await deps.workspace.writeWorkspaceFile({
    path: input.path,
    content: input.content,
    maxInputBytes: deps.config.limits.maxInputBytes
  });
  return { ok: true, file };
}

export async function handleWorkspaceDeleteFile(rawInput: unknown, deps: ToolDependencies) {
  const input = workspaceDeleteFileInputSchema.parse(rawInput);
  const result = await deps.workspace.deleteWorkspaceFile(input.path);
  return { ok: true, ...result };
}
