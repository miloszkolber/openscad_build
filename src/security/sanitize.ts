import path from 'node:path';

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const URL_LIKE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export function assertSafeIdentifier(name: string): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Unsafe OpenSCAD define name "${name}". Use identifiers like width or box_height.`);
  }
}

export function isUrlLikePath(input: string): boolean {
  return URL_LIKE.test(input);
}

export function assertSafeRelativePath(input: string): void {
  if (input.length === 0) {
    throw new Error('Path must not be empty.');
  }
  if (input.includes('\0')) {
    throw new Error('Path must not contain null bytes.');
  }
  if (input.includes('\\')) {
    throw new Error('Path must use forward slashes, not backslashes.');
  }
  if (isUrlLikePath(input)) {
    throw new Error('URL-like paths are not allowed.');
  }
  if (path.isAbsolute(input) || input.startsWith('/')) {
    throw new Error('Absolute paths are not allowed.');
  }

  const normalized = path.posix.normalize(input);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Path traversal is not allowed.');
  }
}
