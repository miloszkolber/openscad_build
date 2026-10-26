import { createServer, type Server } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { AppConfig } from '../config.js';
import { createMcpAuthMiddleware } from '../security/mcpAuth.js';
import type { ToolDependencies } from '../tools/index.js';
import { createMcpServer } from './createMcpServer.js';
import { registerPreviewRoutes } from './previewRoutes.js';

export async function startStreamableHttpServer(
  config: AppConfig,
  deps: ToolDependencies
): Promise<Server> {
  const app = createMcpExpressApp({ host: config.host });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, name: 'openscad-wasm-mcp' });
  });

  registerPreviewRoutes(app, deps);

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
