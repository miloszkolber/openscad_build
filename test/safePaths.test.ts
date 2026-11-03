import { access, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSafePath } from '../src/workspace/safePaths.js';

let root: string;
let tempParent: string;

beforeEach(async () => {
  tempParent = await mkdtemp(path.join(os.tmpdir(), 'openscad-safe-paths-'));
  root = path.join(tempParent, 'workspace');
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(tempParent, { recursive: true, force: true });
});

describe('resolveSafePath', () => {
  it('rejects path traversal and absolute paths', async () => {
    await expect(resolveSafePath(root, '../secret.scad')).rejects.toThrow(/traversal/i);
    await expect(resolveSafePath(root, '/tmp/secret.scad')).rejects.toThrow(/absolute/i);
    await expect(resolveSafePath(root, 'file:///tmp/secret.scad')).rejects.toThrow(/URL-like/i);
    await expect(resolveSafePath(root, 'bad\u0000.scad')).rejects.toThrow(/null/i);
  });

  it('rejects unsupported file extensions', async () => {
    await expect(resolveSafePath(root, 'script.sh')).rejects.toThrow(/not allowed/i);
  });

  it('allows safe nested files', async () => {
    const resolved = await resolveSafePath(root, 'models/cube.scad', { createParent: true });
    expect(resolved).toBe(path.join(await realpath(root), 'models', 'cube.scad'));
  });

  it('prevents symlink escape', async () => {
    const outside = path.join(tempParent, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    await symlink(outside, path.join(root, 'link'));

    await expect(resolveSafePath(root, 'link/secret.txt', { mustExist: true })).rejects.toThrow(
      /escapes/i
    );
  });

  it('does not create directories outside the root before rejecting a symlink', async () => {
    const outside = path.join(tempParent, 'outside');
    await mkdir(outside);
    await symlink(outside, path.join(root, 'link'));
    await expect(
      resolveSafePath(root, 'link/new/file.scad', { createParent: true })
    ).rejects.toThrow(/symlink|escapes/i);
    await expect(access(path.join(outside, 'new'))).rejects.toThrow();
  });

  it('checks the resolved extension for existing aliases', async () => {
    await writeFile(path.join(root, 'secret.sh'), 'secret');
    await symlink('secret.sh', path.join(root, 'alias.scad'));
    await expect(resolveSafePath(root, 'alias.scad', { mustExist: true })).rejects.toThrow();
  });
});
