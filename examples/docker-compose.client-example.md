# Docker Compose Client Example

Start the server:

```bash
cp .env.example .env
docker compose up --build
```

Streamable HTTP endpoint:

```text
http://127.0.0.1:3333/mcp
```

Browser UI:

```text
http://127.0.0.1:3333/
```

List tools:

```bash
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

Export STL:

```bash
curl -s http://127.0.0.1:3333/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "openscad_export_model",
      "arguments": {
        "scad": "cube([10, 20, 5]);",
        "format": "stl",
        "outputPath": "cube.stl"
      }
    }
  }'
```

During early integration, use the mock backend:

```bash
OPENSCAD_BACKEND=mock npm run dev
```
