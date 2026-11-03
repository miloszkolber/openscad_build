import { lstat, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_ALLOWED_EXTENSIONS } from '../security/limits.js';
import { assertSafeRelativePath } from '../security/sanitize.js';

export interface ResolveSafePathOptions {
  allowedExtensions?: Set<string>;
  allowDirectory?: boolean;
  mustExist?: boolean;
  createParent?: boolean;
}

export async function resolveSafePath(
  rootDir: string,
  requestedPath: string,
  options: ResolveSafePathOptions = {}
): Promise<string> {
  const normalizedInput = requestedPath || '.';
  if (normalizedInput !== '.') {
    assertSafeRelativePath(normalizedInput);
  }

  await mkdir(rootDir, { recursive: true });
  const rootReal = await realpath(rootDir);
  const normalized = path.posix.normalize(normalizedInput);
  const target = path.resolve(rootReal, normalized);

  assertInsideRoot(rootReal, target);

  const extension = path.extname(target).toLowerCase();
  const allowedExtensions = options.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;
  if (!options.allowDirectory && !allowedExtensions.has(extension)) {
    throw new Error(`Files with extension "${extension || '(none)'}" are not allowed.`);
  }

  // Check each existing component before mkdir: recursive mkdir follows symlinks.
  let current = rootReal;
  for (const part of normalized.split('/').filter((part) => part !== '.' && part !== '')) {
    current = path.join(current, part);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) {
        throw new Error(
          'Symlink path is not allowed: it may resolve to a path that escapes the workspace root.'
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      break;
    }
  }

  if (options.mustExist) {
    const targetReal = await realpath(target);
    assertInsideRoot(rootReal, targetReal);
    return targetReal;
  }

  try {
    const targetStats = await stat(target);
    if (targetStats.isDirectory()) {
      if (!options.allowDirectory) {
        throw new Error('Expected a file path, got a directory.');
      }
      const targetReal = await realpath(target);
      assertInsideRoot(rootReal, targetReal);
      return targetReal;
    }

    const targetReal = await realpath(target);
    assertInsideRoot(rootReal, targetReal);
    return targetReal;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (options.createParent) {
    await mkdir(path.dirname(target), { recursive: true });
  }
  // For read-only path validation the nearest existing ancestor is enough.
  let parent = path.dirname(target);
  while (true) {
    try {
      const parentReal = await realpath(parent);
      assertInsideRoot(rootReal, parentReal);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      parent = path.dirname(parent);
    }
  }
  return target;
}

export function assertInsideRoot(rootDir: string, targetPath: string): void {
  const relative = path.relative(rootDir, targetPath);
  if (relative === '') {
    return;
  }
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Resolved path escapes the workspace root.');
  }
}
