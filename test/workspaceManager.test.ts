import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceManager } from '../src/workspace/WorkspaceManager.js';

let tempDir: string;
let manager: WorkspaceManager;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'openscad-workspace-'));
  manager = new WorkspaceManager({
    workspaceDir: path.join(tempDir, 'workspace')
  });
  await manager.init();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('WorkspaceManager', () => {
  it('writes, reads, lists, and deletes workspace files', async () => {
    const written = await manager.writeWorkspaceFile({
      path: 'models/cube.scad',
      content: 'cube(10);',
      maxInputBytes: 1024
    });
    expect(written.path).toBe('models/cube.scad');

    const read = await manager.readWorkspaceFile('models/cube.scad');
    expect(read.content).toBe('cube(10);');

    const files = await manager.listFiles('.');
    expect(files.map((file) => file.path)).toContain('models/cube.scad');

    await expect(manager.deleteWorkspaceFile('models/cube.scad')).resolves.toEqual({
      deleted: true
    });
    await expect(manager.readWorkspaceFile('models/cube.scad')).rejects.toThrow();
  });

  it('rejects workspace path traversal', async () => {
    await expect(
      manager.writeWorkspaceFile({
        path: '../escape.scad',
        content: 'cube(1);',
        maxInputBytes: 1024
      })
    ).rejects.toThrow(/traversal/i);
  });

  it('resolves a workspace source and stages its sibling files', async () => {
    const workspace = manager['paths'].workspaceDir;
    await manager.writeWorkspaceFile({
      path: 'model/main.scad',
      content: 'include "lib/shape.scad"\nshape(2);',
      maxInputBytes: 1024
    });
    await manager.writeWorkspaceFile({
      path: 'model/lib/shape.scad',
      content: 'module shape(size) cube(size);',
      maxInputBytes: 1024
    });
    await manager.writeWorkspaceBinary({
      path: 'model/lib/part.stl',
      data: Buffer.from('solid part\nendsolid part\n'),
      maxBytes: 1024
    });

    const resolved = await manager.resolveModelInput({
      path: 'model/main.scad',
      maxInputBytes: 1024
    });

    expect(resolved.sourcePath).toBe('model/main.scad');
    expect(resolved.scad).toContain('include "lib/shape.scad"');
    expect(resolved.files['model/lib/shape.scad']).toBe('module shape(size) cube(size);');
    expect(resolved.files['model/lib/part.stl']).toEqual({
      contentBase64: Buffer.from('solid part\nendsolid part\n').toString('base64')
    });
    expect(workspace).toBeTruthy();
  });

  it('writes explicit binary outputs', async () => {
    const output = await manager.writeWorkspaceBinary({
      path: 'model/out.stl',
      data: Buffer.from('solid out\nendsolid out\n'),
      maxBytes: 1024
    });
    expect(output.path).toBe('model/out.stl');
    expect(await readFile(path.join(manager['paths'].workspaceDir, 'model/out.stl'))).toEqual(
      Buffer.from('solid out\nendsolid out\n')
    );
  });

  it('rejects inline and path sources together', async () => {
    await expect(
      manager.resolveModelInput({
        path: 'model/main.scad',
        scad: 'cube(1);',
        maxInputBytes: 1024
      })
    ).rejects.toThrow(/either path or scad/i);
  });

  it('ignores excluded directories in listings', async () => {
    const workspace = manager['paths'].workspaceDir;
    await writeFile(path.join(workspace, 'visible.scad'), 'cube(1);');
    await manager.writeWorkspaceFile({
      path: '.tmp/ignored.scad',
      content: 'cube(2);',
      maxInputBytes: 1024
    });

    const files = await manager.listFiles('.');
    expect(files.map((file) => file.path)).toEqual(['visible.scad']);
  });
});
