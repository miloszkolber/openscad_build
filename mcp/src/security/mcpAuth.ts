import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';

function tokensEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  return match?.[1] ?? null;
}

function sendUnauthorized(res: Response): void {
  res.setHeader('WWW-Authenticate', 'Bearer realm="openscad"');
  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Unauthorized. Provide a valid Bearer token.'
    },
    id: null
  });
}

export function createMcpAuthMiddleware(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.mcpAuthToken) {
      next();
      return;
    }

    const token = parseBearerToken(req.headers.authorization);
    if (!token || !tokensEqual(token, config.mcpAuthToken)) {
      sendUnauthorized(res);
      return;
    }

    next();
  };
}
