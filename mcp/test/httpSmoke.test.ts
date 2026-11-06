import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { MockOpenScadRunner } from '../src/openscad/MockOpenScadRunner.js';
import { Semaphore } from '../src/security/limits.js';
import { startStreamableHttpServer } from '../src/server/transport.js';
import type { ToolDependencies } from '../src/tools/index.js';
import { WorkspaceManager } from '../src/workspace/WorkspaceManager.js';

let tempDir: string;
let server: Server;
let baseUrl: string;
let url: string;
let dependencies: ToolDependencies;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'openscad-http-smoke-'));
  const webDir = path.join(tempDir, 'web');
  await mkdir(webDir, { recursive: true });
  await writeFile(path.join(webDir, 'index.html'), '<title>Test OpenSCAD browser</title>');
  const config: AppConfig = {
    port: 0,
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
    webDir
  };
  const workspace = new WorkspaceManager(config.paths);
  await workspace.init();
  const deps: ToolDependencies = {
    config,
    runner: new MockOpenScadRunner(),
    workspace,
    semaphore: new Semaphore(config.limits.maxParallelJobs)
  };
  dependencies = deps;

  server = await startStreamableHttpServer(config, deps);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected test HTTP server to listen on a TCP port.');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  url = `${baseUrl}/mcp`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(tempDir, { recursive: true, force: true });
});

describe('Streamable HTTP MCP smoke', () => {
  it('forwards HTTP disconnects to running work', async () => {
    let runningSignal: AbortSignal | undefined;
    dependencies.runner.export = async (_input, signal) => {
      runningSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    };
    const controller = new AbortController();
    const request = exportRequest('cube(1);', controller.signal);
    const rejection = expect(request).rejects.toThrow();
    await vi.waitFor(() => expect(runningSignal).toBeDefined());
    controller.abort();
    await rejection;
    await vi.waitFor(() => expect(runningSignal?.aborted).toBe(true));
  });

  it('removes disconnected queued work and allows a later request to finish', async () => {
    const seen: string[] = [];
    let release!: () => void;
    const mock = new MockOpenScadRunner();
    dependencies.semaphore = new Semaphore(1);
    dependencies.runner = {
      validate: (input) => mock.validate(input),
      export: async (input) => {
        seen.push(input.scad);
        if (input.scad === 'slow') {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return mock.export(input);
      }
    };
    const first = exportRequest('slow', undefined, 'slow.stl');
    await vi.waitFor(() => expect(seen).toEqual(['slow']));
    const controller = new AbortController();
    const second = exportRequest('cancelled', controller.signal, 'cancelled.stl');
    const rejection = expect(second).rejects.toThrow();
    controller.abort();
    await rejection;
    const third = exportRequest('later', undefined, 'later.stl');
    release();
    expect((await first).status).toBe(200);
    expect((await third).status).toBe(200);
    expect(seen).toEqual(['slow', 'later']);
  });

  it('lists tools and calls validate through /mcp', async () => {
    const tools = await postJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });
    const names = tools.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('openscad_validate');
    expect(names).toContain('openscad_export_model');
    expect(names).toContain('openscad_screenshot');
    expect(names).toContain('openscad_analyze_model');
    expect(names).not.toContain('openscad_create_preview_link');
    expect(names).not.toContain('openscad_render_preview');

    const validate = await postJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'openscad_validate',
        arguments: {
          scad: 'cube(1);'
        }
      }
    });

    expect(validate.result.structuredContent).toMatchObject({
      ok: true,
      stderr: ''
    });
  });

  it('returns an inline image from openscad_screenshot', async () => {
    const screenshot = await postJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'openscad_screenshot',
        arguments: { scad: 'cube(1);', width: 64, height: 64 }
      }
    });

    expect(screenshot.result.structuredContent).toMatchObject({
      ok: true,
      image: { format: 'png', width: 64, height: 64 }
    });
    const image = screenshot.result.content.find((item: { type: string }) => item.type === 'image');
    expect(image).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(image.data.length).toBeGreaterThan(0);
  });

  it('serves the browser UI, file index, and read-only model files', async () => {
    await dependencies.workspace.writeWorkspaceFile({
      path: 'models/cube.scad',
      content: 'cube(1);',
      maxInputBytes: 1024
    });

    const home = await fetch(`${baseUrl}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('Test OpenSCAD browser');

    const index = await fetch(`${baseUrl}/api/files`);
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toBe('no-store');
    expect(await index.json()).toEqual({ models: { 'cube.scad': null } });

    const model = await fetch(`${baseUrl}/models/models/cube.scad`);
    expect(model.status).toBe(200);
    expect(model.headers.get('content-type')).toContain('application/x-openscad');
    expect(await model.text()).toBe('cube(1);');
    expect(model.headers.get('content-security-policy')).toContain('sandbox');
    const post = await fetch(`${baseUrl}/models/models/cube.scad`, { method: 'POST' });
    expect(post.status).toBe(405);

    const traversal = await fetch(`${baseUrl}/models/%2e%2e/secret.scad`);
    expect(traversal.status).toBe(404);
  });

  it('accepts supported source payloads above the SDK default 100 KiB limit', async () => {
    const validate = await postJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'openscad_validate',
        arguments: { scad: '//'.padEnd(150_000, 'x') + '\ncube(1);' }
      }
    });
    expect(validate.result.structuredContent.ok).toBe(true);
  });

  it('rejects /mcp without bearer token when MCP_AUTH_TOKEN is configured', async () => {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'openscad-http-auth-'));
    const webDir = path.join(tempDir, 'web');
    await mkdir(webDir, { recursive: true });
    await writeFile(path.join(webDir, 'index.html'), '<title>Auth UI</title>');
    const config: AppConfig = {
      port: 0,
      host: '127.0.0.1',
      backend: 'mock',
      mcpAuthToken: 'test-secret',
      paths: {
        workspaceDir: path.join(tempDir, 'workspace')
      },
      limits: {
        maxRenderMs: 1000,
        maxOutputBytes: 1024 * 1024,
        maxInputBytes: 1024 * 1024,
        maxParallelJobs: 2
      },
      webDir
    };
    const workspace = new WorkspaceManager(config.paths);
    await workspace.init();
    const deps: ToolDependencies = {
      config,
      runner: new MockOpenScadRunner(),
      workspace,
      semaphore: new Semaphore(config.limits.maxParallelJobs)
    };

    server = await startStreamableHttpServer(config, deps);
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected test HTTP server to listen on a TCP port.');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    url = `${baseUrl}/mcp`;

    const unauthorized = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    });

    expect(unauthorized.status).toBe(401);

    const publicUi = await fetch(`${baseUrl}/`);
    expect(publicUi.status).toBe(200);

    const authorized = await postJsonRpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      },
      'test-secret'
    );

    expect(authorized.result.tools.map((tool: { name: string }) => tool.name)).toContain(
      'openscad_validate'
    );
  });
});

async function exportRequest(scad: string, signal?: AbortSignal, outputPath = 'output.stl') {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: scad,
      method: 'tools/call',
      params: {
        name: 'openscad_export_model',
        arguments: { scad, format: 'stl', outputPath }
      }
    })
  });
  return { status: response.status, text: await response.text() };
}

async function postJsonRpc(body: unknown, bearerToken?: string): Promise<Record<string, any>> {
  const headers: Record<string, string> = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json'
  };
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  expect(response.status).toBe(200);
  return parseSseJson(await response.text());
}

function parseSseJson(text: string): Record<string, any> {
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');

  if (!data) {
    throw new Error(`Expected SSE data line, got: ${text}`);
  }

  return JSON.parse(data);
}
