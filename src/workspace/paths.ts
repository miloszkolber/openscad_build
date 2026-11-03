import path from 'node:path';

export interface WorkspacePaths {
  workspaceDir: string;
}

export function toPosixPath(input: string): string {
  return input.split(path.sep).join('/');
}

export function relativePosixPath(from: string, to: string): string {
  return toPosixPath(path.relative(from, to));
}
