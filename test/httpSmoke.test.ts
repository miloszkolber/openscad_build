import { mkdtemp, readdir, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { MockOpenScadRunner } from '../src/openscad/MockOpenScadRunner.js';
import { Semaphore } from '../src/security/limits.js';
import { startStreamableHttpServer } from '../src/server/transport.js';
import type { ToolDependencies } from '../src/tools/index.js';
import { ArtifactStore } from '../src/workspace/artifactStore.js';
import { PreviewTokenStore } from '../src/preview/PreviewTokenStore.js';
import { WorkspaceManager } from '../src/workspace/WorkspaceManager.js';

let tempDir: string;
let server: Server;
let url: string;
let dependencies: ToolDependencies;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'openscad-http-smoke-'));
  const config: AppConfig = {
    port: 0,
    host: '127.0.0.1',
    backend: 'mock',
    paths: {
      workspaceDir: path.join(tempDir, 'workspace'),
      artifactDir: path.join(tempDir, 'workspace', 'artifacts'),
      jobTmpDir: path.join(tempDir, 'jobs')
    },
    limits: {
      maxRenderMs: 1000,
      maxOutputBytes: 1024 * 1024,
      maxInputBytes: 1024 * 1024,
      maxParallelJobs: 2,
      cleanupJobs: true
    },
    preview: {
      enabled: true,
      publicBaseUrl: 'http://127.0.0.1:3333',
      ttlSeconds: 3600
    }
  };
  const workspace = new WorkspaceManager(config.paths);
  await workspace.init();
  const deps: ToolDependencies = {
    config,
    runner: new MockOpenScadRunner(),
    workspace,
    artifacts: new ArtifactStore(config.paths.artifactDir, config.limits.maxOutputBytes),
    previewTokens: new PreviewTokenStore(config.preview.ttlSeconds),
    semaphore: new Semaphore(config.limits.maxParallelJobs)
  };
  dependencies = deps;

  server = await startStreamableHttpServer(config, deps);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected test HTTP server to listen on a TCP port.');
  }
  url = `http://127.0.0.1:${address.port}/mcp`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(tempDir, { recursive: true, force: true });
});

describe('Streamable HTTP MCP smoke', () => {
  it('forwards HTTP disconnects to running work and cleans the job', async () => {
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
    await vi.waitFor(async () =>
      expect(await readdir(dependencies.config.paths.jobTmpDir)).toEqual([])
    );
  });

  it('removes disconnected queued work and allows a later request to finish', async () => {
    const seen: string[] = [];
    let release!: () => void;
    const mock = new MockOpenScadRunner();
    dependencies.semaphore = new Semaphore(1);
    dependencies.runner.export = async (input) => {
      seen.push(input.scad);
      if (input.scad === 'slow') {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return mock.export(input);
    };
    const first = exportRequest('slow');
    await vi.waitFor(() => expect(seen).toEqual(['slow']));
    const controller = new AbortController();
    const second = exportRequest('cancelled', controller.signal);
    const rejection = expect(second).rejects.toThrow();
    await vi.waitFor(async () =>
      expect(await readdir(dependencies.config.paths.jobTmpDir)).toHaveLength(2)
    );
    controller.abort();
    await rejection;
    await vi.waitFor(async () =>
      expect(await readdir(dependencies.config.paths.jobTmpDir)).toHaveLength(1)
    );
    const third = exportRequest('later');
    release();
    expect((await first).status).toBe(200);
    expect((await third).status).toBe(200);
    expect(seen).toEqual(['slow', 'later']);
    await vi.waitFor(async () =>
      expect(await readdir(dependencies.config.paths.jobTmpDir)).toEqual([])
    );
  });

  it('lists tools and calls validate through /mcp', async () => {
    const tools = await postJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });

    expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toContain(
      'openscad_validate'
    );
    expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toContain(
      'openscad_create_preview_link'
    );

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

  it('rejects /mcp without bearer token when MCP_AUTH_TOKEN is configured', async () => {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'openscad-http-auth-'));
    const config: AppConfig = {
      port: 0,
      host: '127.0.0.1',
      backend: 'mock',
      mcpAuthToken: 'test-secret',
      paths: {
        workspaceDir: path.join(tempDir, 'workspace'),
        artifactDir: path.join(tempDir, 'workspace', 'artifacts'),
        jobTmpDir: path.join(tempDir, 'jobs')
      },
      limits: {
        maxRenderMs: 1000,
        maxOutputBytes: 1024 * 1024,
        maxInputBytes: 1024 * 1024,
        maxParallelJobs: 2,
        cleanupJobs: true
      },
      preview: {
        enabled: true,
        publicBaseUrl: 'http://127.0.0.1:3333',
        ttlSeconds: 3600
      }
    };
    const workspace = new WorkspaceManager(config.paths);
    await workspace.init();
    const deps: ToolDependencies = {
      config,
      runner: new MockOpenScadRunner(),
      workspace,
      artifacts: new ArtifactStore(config.paths.artifactDir, config.limits.maxOutputBytes),
      previewTokens: new PreviewTokenStore(config.preview.ttlSeconds),
      semaphore: new Semaphore(config.limits.maxParallelJobs)
    };

    server = await startStreamableHttpServer(config, deps);
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected test HTTP server to listen on a TCP port.');
    }
    url = `http://127.0.0.1:${address.port}/mcp`;

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

async function exportRequest(scad: string, signal?: AbortSignal) {
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
        arguments: { scad, format: 'stl' }
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
