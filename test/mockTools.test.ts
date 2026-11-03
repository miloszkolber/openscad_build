import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { MockOpenScadRunner } from '../src/openscad/MockOpenScadRunner.js';
import type { OpenScadRunner } from '../src/openscad/OpenScadRunner.js';
import { Semaphore } from '../src/security/limits.js';
import {
  geometryFromOpenScadSummary,
  handleAnalyzeModel,
  parseStlGeometry
} from '../src/tools/analyzeModel.js';
import { handleExportModel } from '../src/tools/exportModel.js';
import { handleScreenshot } from '../src/tools/screenshot.js';
import { handleValidate } from '../src/tools/validate.js';
import type { ToolDependencies } from '../src/tools/index.js';
import { WorkspaceManager } from '../src/workspace/WorkspaceManager.js';

let tempDir: string;
let deps: ToolDependencies;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'openscad-tools-'));
  const config: AppConfig = {
    port: 3333,
    host: '127.0.0.1',
    backend: 'mock',
    paths: {
      workspaceDir: path.join(tempDir, 'workspace')
    },
    limits: {
      maxRenderMs: 1000,
      maxOutputBytes: 1024 * 1024,
      maxInputBytes: 1024 * 1024,
      maxParallelJobs: 2
    },
    webDir: path.join(tempDir, 'web')
  };
  const workspace = new WorkspaceManager(config.paths);
  await workspace.init();
  deps = {
    config,
    runner: new MockOpenScadRunner(),
    workspace,
    semaphore: new Semaphore(config.limits.maxParallelJobs)
  };
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('mock tool handlers', () => {
  it('validates SCAD with the mock runner', async () => {
    const result = await handleValidate({ scad: 'cube(1);' }, deps);
    expect(result.ok).toBe(true);
    expect(result.stderr).toBe('');
  });

  it('exports inline SCAD to an explicit workspace path', async () => {
    const result = await handleExportModel(
      { scad: 'cube(1);', format: 'stl', outputPath: 'models/cube.stl' },
      deps
    );
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      path: 'models/cube.stl',
      format: 'stl',
      mimeType: 'model/stl'
    });
    expect(result.output?.sha256).toHaveLength(64);
    const data = await readFile(path.join(deps.config.paths.workspaceDir, 'models/cube.stl'));
    expect(data.toString('utf8')).toContain('solid mock');
  });

  it('defaults the output path beside a workspace source', async () => {
    await deps.workspace.writeWorkspaceFile({
      path: 'models/part.scad',
      content: 'cube(2);',
      maxInputBytes: 1024
    });

    const result = await handleExportModel({ path: 'models/part.scad', format: 'off' }, deps);
    expect(result.ok).toBe(true);
    expect(result.output?.path).toBe('models/part.off');
  });

  it('requires an output path for inline SCAD exports', async () => {
    const result = await handleExportModel({ scad: 'cube(1);', format: 'stl' }, deps);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('outputPath is required');
  });

  it('passes workspace sources and staged files to the runner', async () => {
    await deps.workspace.writeWorkspaceFile({
      path: 'models/main.scad',
      content: 'include "lib.scad"\ncube(size);',
      maxInputBytes: 1024
    });
    await deps.workspace.writeWorkspaceFile({
      path: 'models/lib.scad',
      content: 'size = 3;',
      maxInputBytes: 1024
    });

    let seen: { sourcePath?: string; files?: Record<string, unknown> } = {};
    const mock = new MockOpenScadRunner();
    deps.runner = {
      validate: (input) => mock.validate(input),
      export: async (input) => {
        seen = { sourcePath: input.sourcePath, files: input.files };
        return mock.export(input);
      }
    } satisfies OpenScadRunner;

    const result = await handleExportModel({ path: 'models/main.scad', format: 'stl' }, deps);
    expect(result.ok).toBe(true);
    expect(seen.sourcePath).toBe('models/main.scad');
    expect(seen.files).toMatchObject({ 'models/lib.scad': 'size = 3;' });
  });

  it('renders an inline PNG screenshot', async () => {
    const result = await handleScreenshot(
      { scad: 'cube(1);', width: 320, height: 240 },
      deps
    );
    expect(result.ok).toBe(true);
    expect(result.image).toMatchObject({
      format: 'png',
      width: 320,
      height: 240,
      mimeType: 'image/png'
    });
    expect(result.imageData?.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    const stats = await sharp(result.imageData).stats();
    expect(stats.channels.some((channel) => channel.stdev > 0)).toBe(true);
  });

  it('writes a WebP screenshot when requested', async () => {
    const result = await handleScreenshot(
      {
        scad: 'cube(1);',
        format: 'webp',
        width: 320,
        height: 240,
        outputPath: 'models/preview.webp'
      },
      deps
    );
    expect(result.ok).toBe(true);
    expect(result.output?.path).toBe('models/preview.webp');
    expect(result.image?.mimeType).toBe('image/webp');

    const data = await readFile(path.join(deps.config.paths.workspaceDir, 'models/preview.webp'));
    expect(data.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(data.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('analyzes STL triangle count and bounding box through mock export', async () => {
    const result = await handleAnalyzeModel({ scad: 'cube(1);' }, deps);
    expect(result.ok).toBe(true);
    expect(result.summary.triangleCount).toBe(2);
    expect(result.summary.boundingBox).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
  });
});

describe('parseStlGeometry', () => {
  it('handles empty STL data', () => {
    expect(parseStlGeometry(Buffer.alloc(0))).toEqual({
      triangleCount: 0,
      boundingBox: undefined
    });
  });

  it('falls back safely when binary STL length is malformed', () => {
    const buffer = Buffer.alloc(84);
    buffer.writeUInt32LE(2, 80);

    expect(parseStlGeometry(buffer)).toEqual({
      triangleCount: 0,
      boundingBox: undefined
    });
  });

  it('parses binary STL bbox and triangle count', () => {
    const buffer = Buffer.alloc(84 + 50);
    buffer.writeUInt32LE(1, 80);
    let offset = 84 + 12;
    for (const vertex of [
      [0, 0, 0],
      [2, 0, 0],
      [0, 3, 1]
    ]) {
      buffer.writeFloatLE(vertex[0], offset);
      buffer.writeFloatLE(vertex[1], offset + 4);
      buffer.writeFloatLE(vertex[2], offset + 8);
      offset += 12;
    }

    expect(parseStlGeometry(buffer)).toEqual({
      triangleCount: 1,
      boundingBox: { min: [0, 0, 0], max: [2, 3, 1] }
    });
  });

  it('parses ASCII STL negative coordinates and scientific notation', () => {
    const stl = `solid ascii
      facet normal 0 0 1
        outer loop
          vertex -1.5 0 2e1
          vertex 1.25 -3.5e-1 0
          vertex 0 4.0 -2
        endloop
      endfacet
    endsolid ascii`;

    expect(parseStlGeometry(Buffer.from(stl, 'utf8'))).toEqual({
      triangleCount: 1,
      boundingBox: { min: [-1.5, -0.35, -2], max: [1.25, 4, 20] }
    });
  });
});

describe('geometryFromOpenScadSummary', () => {
  it('extracts bounding box and triangular facet counts', () => {
    expect(
      geometryFromOpenScadSummary({
        geometry: {
          bounding_box: {
            min: [-1, -2, -3],
            max: [4, 5, 6]
          },
          facets: 12,
          triangular: true
        }
      })
    ).toEqual({
      boundingBox: { min: [-1, -2, -3], max: [4, 5, 6] },
      triangleCount: 12
    });
  });

  it('does not treat non-triangular facet count as triangle count', () => {
    expect(
      geometryFromOpenScadSummary({
        geometry: {
          bounding_box: {
            min: [0, 0, 0],
            max: [1, 1, 1]
          },
          facets: 6,
          triangular: false
        }
      })
    ).toEqual({
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      triangleCount: undefined
    });
  });
});
