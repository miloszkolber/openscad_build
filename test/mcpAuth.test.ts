import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { createMcpAuthMiddleware } from '../src/security/mcpAuth.js';

function baseConfig(mcpAuthToken?: string): AppConfig {
  return {
    port: 3333,
    host: '127.0.0.1',
    backend: 'mock',
    mcpAuthToken,
    paths: {
      workspaceDir: '/workspace'
    },
    limits: {
      maxRenderMs: 1000,
      maxOutputBytes: 1024,
      maxInputBytes: 1024,
      maxParallelJobs: 1
    },
    webDir: '/app/dist/web'
  };
}

function createMockResponse(): Response & {
  statusCode?: number;
  headers: Record<string, string>;
  body?: unknown;
} {
  const res = {
    statusCode: undefined as number | undefined,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };

  return res as Response & typeof res;
}

describe('createMcpAuthMiddleware', () => {
  it('allows requests when MCP_AUTH_TOKEN is unset', () => {
    const middleware = createMcpAuthMiddleware(baseConfig());
    const next = vi.fn();
    const res = createMockResponse();

    middleware({ headers: {} } as any, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it('rejects missing bearer token when MCP_AUTH_TOKEN is set', () => {
    const middleware = createMcpAuthMiddleware(baseConfig('secret-token'));
    const next = vi.fn();
    const res = createMockResponse();

    middleware({ headers: {} } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toBe('Bearer realm="openscad-wasm-mcp"');
    expect(res.body).toMatchObject({
      error: { message: expect.stringContaining('Unauthorized') }
    });
  });

  it('rejects invalid bearer token when MCP_AUTH_TOKEN is set', () => {
    const middleware = createMcpAuthMiddleware(baseConfig('secret-token'));
    const next = vi.fn();
    const res = createMockResponse();

    middleware({ headers: { authorization: 'Bearer wrong-token' } } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('accepts a matching bearer token', () => {
    const middleware = createMcpAuthMiddleware(baseConfig('secret-token'));
    const next = vi.fn();
    const res = createMockResponse();

    middleware({ headers: { authorization: 'Bearer secret-token' } } as any, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });
});
