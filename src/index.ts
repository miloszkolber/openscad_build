import { createToolDependencies } from './app.js';
import { loadConfig } from './config.js';
import { startStreamableHttpServer } from './server/transport.js';

const config = loadConfig();
const deps = await createToolDependencies(config);
const server = await startStreamableHttpServer(config, deps);

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

console.log(
  `openscad-wasm-mcp listening on http://${config.host}:${config.port}/mcp using ${config.backend} backend`
);
console.log(`OpenSCAD browser UI: http://${config.host}:${config.port}/`);
