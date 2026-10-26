# openscad-wasm-mcp

An OpenSCAD Model Context Protocol (MCP) server that runs OpenSCAD in Node.js/TypeScript using WebAssembly (`openscad-wasm`). No native OpenSCAD installation on the host is required.

## Quick Start

### 1. Run with Docker Compose

By default, the server runs in Docker with restricted privileges:

```bash
docker compose up --build
```

The MCP server listens on `http://127.0.0.1:3333/mcp`.

### 2. Configure MCP Client

Add the server to your MCP client configuration (e.g., `claude_desktop_config.json`):

**Using HTTP Transport (default):**
```json
{
  "mcpServers": {
    "openscad-wasm": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/client-cli", "http://127.0.0.1:3333/mcp"]
    }
  }
}
```

## Available Tools

### OpenSCAD Tools
- `openscad_validate`: Validates SCAD code and returns syntax/logical diagnostics.
- `openscad_export_model`: Exports model to `stl`, `3mf`, `off`, `csg`, `dxf`, or `svg`.
- `openscad_render_preview`: Generates a server-side WebP render or an interactive 3D preview link.
- `openscad_create_preview_link`: Generates a URL to open a browser-based interactive 3D viewer.
- `openscad_analyze_model`: Computes the model's bounding box and triangle count.

### Workspace Tools
- `workspace_list_files`: Lists files in the container workspace.
- `workspace_read_file`: Reads a file from the workspace.
- `workspace_write_file`: Writes a file to the workspace.
- `workspace_delete_file`: Deletes a file from the workspace.

## Artifacts

Renders and model exports are saved under `./workspace/artifacts` on the host. The MCP tool responses return metadata: `path`, `filename`, `format`, `mimeType`, `sizeBytes`, and `sha256`.

## Configuration

Customize runtime limits (memory, timeouts, directories) by copying `.env.example` to `.env` and editing the environment variables.

`MAX_RENDER_MS` is both the default and maximum WASM execution time. A tool's `timeoutMs` may shorten that limit but cannot extend it. Queue waiting time is not included in the execution timeout.

Disconnecting an HTTP tool request or cancelling it through the MCP request signal removes queued rendering work or terminates its running WASM worker. The concurrency permit is held until the worker exits, and job staging is cleaned up. Completed artifacts and preview tokens are not deleted by cancellation. These guarantees apply to the server's tool calls, not independent processes launched outside the server.

After building, `scripts/cancellation-smoke.mjs` exercises real WASM output, geometry, previews, timeout ceilings and active/queued HTTP cancellation. Pipe it to Node in an otherwise idle disposable server container with `MAX_PARALLEL_JOBS=1` and a short `MAX_RENDER_MS` (for example, 4000). It reads the container's server process and workspace to verify worker exit and staging cleanup. Do not run it against a shared production container.

## Known Limitations

- **Performance**: Complex models can be slow or memory-intensive inside WebAssembly.
- **Visuals**: WebP previews do not preserve OpenSCAD colors, GUI helpers, or 2D camera perspectives.
- **Assets & Libraries**: Fonts and external libraries are not bundled; you must upload necessary files to the workspace first.
- **Format Support**: Build-specific limits may affect exports (e.g., `3mf` is currently unsupported).

## License

MIT License. See [LICENSE](LICENSE) for details. Dependencies (`openscad-wasm`, `sharp`) carry their own respective licenses.
