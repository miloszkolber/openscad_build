import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('resolves workspace, web, and limit settings', () => {
    const config = loadConfig({
      PORT: '4444',
      WORKSPACE_DIR: '/srv/models',
      WEB_DIR: '/srv/web',
      MAX_RENDER_MS: '5000',
      MAX_OUTPUT_MB: '2',
      MAX_INPUT_MB: '1',
      MAX_PARALLEL_JOBS: '3',
      OPENSCAD_BACKEND: 'mock',
      MCP_AUTH_TOKEN: '  secret  '
    });

    expect(config.port).toBe(4444);
    expect(config.backend).toBe('mock');
    expect(config.paths.workspaceDir).toBe(path.resolve('/srv/models'));
    expect(config.webDir).toBe(path.resolve('/srv/web'));
    expect(config.limits).toEqual({
      maxRenderMs: 5000,
      maxOutputBytes: 2 * 1024 * 1024,
      maxInputBytes: 1 * 1024 * 1024,
      maxParallelJobs: 3
    });
    expect(config.mcpAuthToken).toBe('secret');
  });

  it('defaults the web directory to the sibling web build', () => {
    const env = { ...process.env };
    delete env.WEB_DIR;
    const config = loadConfig(env);
    expect(config.webDir).toBe(path.resolve(import.meta.dirname, '../../web/dist'));
  });

  it('ignores a blank MCP auth token', () => {
    const config = loadConfig({ ...process.env, MCP_AUTH_TOKEN: '   ' });
    expect(config.mcpAuthToken).toBeUndefined();
  });
});
