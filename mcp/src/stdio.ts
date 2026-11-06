import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createToolDependencies } from './app.js';
import { loadConfig } from './config.js';
import { createMcpServer } from './server/createMcpServer.js';

const config = loadConfig();
const deps = await createToolDependencies(config);
const mcpServer = createMcpServer(deps);
const transport = new StdioServerTransport();

await mcpServer.connect(transport);

process.on('SIGINT', async () => {
  await mcpServer.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mcpServer.close();
  process.exit(0);
});

console.error(`openscad stdio server using ${config.backend} backend`);
