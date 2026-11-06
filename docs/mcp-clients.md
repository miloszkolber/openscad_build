# MCP client setup

The server exposes Streamable HTTP on `/mcp` and stdio from the compiled runtime.

## Streamable HTTP

```sh
docker compose -f docker-compose_prebuilt.yml up -d
```

```json
{
  "mcpServers": {
    "openscad": {
      "url": "http://127.0.0.1:3333/mcp"
    }
  }
}
```

When `MCP_AUTH_TOKEN` is set, every `/mcp` request needs the bearer header:

```http
Authorization: Bearer <token>
```

`/healthz`, the browser UI and read-only model routes stay open unless a reverse proxy protects them.

## Hermes Agent

Use the example at [examples/hermes-agent-mcp.yaml](../examples/hermes-agent-mcp.yaml). Put the same value in the server `.env` as `MCP_AUTH_TOKEN` and in the Hermes environment as `OPENS_SCAD_MCP_TOKEN`.

## Stdio

```json
{
  "mcpServers": {
    "openscad": {
      "command": "node",
      "args": ["mcp/dist/stdio.js"],
      "env": {
        "OPENSCAD_BACKEND": "mock"
      }
    }
  }
}
```

Run `npm run build` first, or use `npm run dev:stdio` while developing.

## Inspector

```sh
npm run mcp:inspector
npm run mcp:inspector -- http://127.0.0.1:3333/mcp
```

The script passes `--transport http --server-url <url>` to `@modelcontextprotocol/inspector`.

## Raw requests

List tools:

```sh
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Export a workspace file beside its source:

```sh
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"openscad_export_model","arguments":{"path":"models/cube.scad","format":"stl"}}}'
```

Render inline source:

```sh
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"openscad_screenshot","arguments":{"scad":"cube([10,20,5]);","width":800,"height":600}}}'
```

Add the bearer header when authentication is enabled.
