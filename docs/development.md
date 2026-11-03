# Development and MCP Client Setup

Notes for local development, MCP client configuration, and example tool payloads.

## Development

Contributor and agent handoff notes live in [AGENTS.md](../AGENTS.md). That file covers project contracts, architecture, security invariants, and test expectations.

Common local commands:

```bash
npm install
npm run prepare:assets
npm run build
npm test
npm run lint
```

`npm test` builds worker entry points and runs unit/HTTP regressions, including decoded input bounds, source collisions, symlink writes, screenshot limits/cancellation and browser debounce lifetime. The full build reports expected bundle-size warnings for Monaco and WASM.

For real WASM worker cancellation, run `scripts/cancellation-smoke.mjs` only inside an otherwise idle disposable server container, configured with `MAX_PARALLEL_JOBS=1` and `MAX_RENDER_MS=4000`. It checks export geometry, inline screenshots, timeout ceilings, active/queued cancellation and permit reuse. For example, after building and starting that disposable server:

```sh
docker exec -i test-openscad node --input-type=module < scripts/cancellation-smoke.mjs
```

The browser check can also be exercised with the provided MCP Chromium: mount the documented cube fixture, confirm mounted source is read-only, change width to 21 and inspect the downloaded STL bounds, then exercise paste edits, a relative include, invalid source and recovery. Do not launch a second browser to run QA.

Use the mock backend when you do not need real WASM behavior:

```bash
OPENSCAD_BACKEND=mock npm run dev
```

Docker Compose remains the primary runtime path:

```bash
docker compose up --build
```

## MCP Client Connection

### Streamable HTTP

The default transport is Streamable HTTP on `/mcp`, port `3333`.

```json
{
  "mcpServers": {
    "openscad-wasm": {
      "url": "http://127.0.0.1:3333/mcp"
    }
  }
}
```

When `MCP_AUTH_TOKEN` is set, every `/mcp` request must include:

```http
Authorization: Bearer <token>
```

`/healthz`, the browser UI, and read-only model routes stay open unless you protect them separately at a reverse proxy.

### Hermes Agent

Add the server to `~/.hermes/config.yaml` (or your Hermes config file):

```yaml
mcp_servers:
  openscad-wasm:
    url: "http://127.0.0.1:3333/mcp"
    headers:
      Authorization: "Bearer ${OPENS_SCAD_MCP_TOKEN}"
```

Put the same secret in your Hermes environment or `.env`:

```bash
OPENS_SCAD_MCP_TOKEN=change-me-to-a-long-random-secret
```

On the MCP server side, set the matching value in `.env`:

```bash
MCP_AUTH_TOKEN=change-me-to-a-long-random-secret
```

If you run the server with Docker Compose, add `MCP_AUTH_TOKEN` to the project `.env` before `docker compose up --build`.

Without `MCP_AUTH_TOKEN`, Hermes can connect with only the `url` field.

### MCP Inspector

Shortcut commands:

```bash
npm run mcp:inspector
make mcp-inspector
```

Both default to `http://127.0.0.1:3333/mcp`. Override the URL when needed:

```bash
npm run mcp:inspector -- http://127.0.0.1:3333/mcp
make mcp-inspector MCP_ADDR=http://127.0.0.1:3333/mcp
```

The shortcut passes `--transport http --server-url <url>` to `@modelcontextprotocol/inspector`, which is the Inspector CLI form for Streamable HTTP.

### Stdio Transport

Use stdio transport for local process-spawned clients:

```json
{
  "mcpServers": {
    "openscad-wasm": {
      "command": "node",
      "args": ["dist/src/stdio.js"],
      "env": {
        "OPENSCAD_BACKEND": "mock"
      }
    }
  }
}
```

Build first with `npm run build`, or use `npm run dev:stdio` while developing.

### Raw JSON-RPC Example

Export a workspace source next to the source file:

```bash
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "openscad_export_model",
      "arguments": {
        "path": "models/cube.scad",
        "format": "stl"
      }
    }
  }'
```

Export inline source to an explicit path:

```bash
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "openscad_export_model",
      "arguments": {
        "scad": "cube([10, 20, 5]);",
        "format": "stl",
        "outputPath": "models/cube.stl"
      }
    }
  }'
```

When `MCP_AUTH_TOKEN` is set, add the bearer header:

```bash
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer change-me-to-a-long-random-secret' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "openscad_screenshot",
      "arguments": {
        "path": "models/cube.scad",
        "width": 800,
        "height": 600
      }
    }
  }'
```

## Tool Payload Examples

Example validation, export, screenshot, or analysis payload with helper files and defines:

```json
{
  "path": "models/hinge.scad",
  "files": {
    "models/parts/hinge.scad": "// helper file"
  },
  "defines": {
    "box_width": 30,
    "debug": false,
    "label": "demo"
  },
  "enableManifold": true,
  "timeoutMs": 30000
}
```

When `path` is used, files beside the source are staged automatically. The explicit `files` map adds or overrides files under the same virtual workspace. Inline `scad` input works the same way and uses `input.scad` as the virtual source path.

Screenshot-only options:

```json
{
  "path": "models/hinge.scad",
  "width": 800,
  "height": 600,
  "camera": "100,-100,80,0,0,0",
  "projection": "perspective",
  "viewAll": true,
  "autoCenter": true,
  "format": "png",
  "outputPath": "models/hinge.png"
}
```

`outputPath` is optional. Without it, the image is returned inline and no file is written.
