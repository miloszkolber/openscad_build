import { createServer, type Server } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import express from 'express';
import { localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import type { AppConfig } from '../config.js';
import { createMcpAuthMiddleware } from '../security/mcpAuth.js';
import type { ToolDependencies } from '../tools/index.js';
import { createMcpServer } from './createMcpServer.js';
import { registerWebRoutes } from './webRoutes.js';

export async function startStreamableHttpServer(
  config: AppConfig,
  deps: ToolDependencies
): Promise<Server> {
  // The SDK's default JSON parser is limited to 100 KiB, below supported SCAD/mesh inputs.
  // Parse first with a finite ceiling covering aggregate input plus base64 overhead.
  const app = express();
  if (['127.0.0.1', 'localhost', '::1'].includes(config.host)) app.use(localhostHostValidation());
  const inputLimit = Math.min(config.limits.maxInputBytes * 8, 128 * 1024 * 1024);
  app.use(
    '/mcp',
    createMcpAuthMiddleware(config),
    express.json({ limit: Math.ceil(inputLimit * 1.5) + 1024 * 1024 })
  );
  app.use(createMcpExpressApp({ host: config.host }));

  registerWebRoutes(app, config);

  const requireMcpAuth = createMcpAuthMiddleware(config);

  app.post('/mcp', requireMcpAuth, async (req, res) => {
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    };
    res.once('close', onClose);
    const mcpServer = createMcpServer({ ...deps, signal: controller.signal });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent && !res.destroyed) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message
          },
          id: null
        });
      }
    } finally {
      res.off('close', onClose);
      await transport.close();
      await mcpServer.close();
    }
  });

  app.get('/mcp', requireMcpAuth, (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST for stateless MCP calls.' },
      id: null
    });
  });

  app.delete('/mcp', requireMcpAuth, (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed for stateless MCP.' },
      id: null
    });
  });

  const httpServer = createServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  return httpServer;
}
