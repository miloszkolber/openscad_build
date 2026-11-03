import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, type ToolDependencies } from '../tools/index.js';

export function createMcpServer(deps: ToolDependencies): McpServer {
  const server = new McpServer(
    {
      name: 'openscad-wasm-mcp',
      version: '0.2.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  registerTools(server, deps);
  return server;
}
