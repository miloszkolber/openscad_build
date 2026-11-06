# MCP runtime

The Node.js server behind `/mcp`, `/api/files`, `/models/*` and the browser static files.

| Path | Purpose |
| --- | --- |
| `src/openscad/` | OpenSCAD runner boundary, WASM worker and diagnostics |
| `src/tools/` | MCP tool handlers and schemas |
| `src/workspace/` | Workspace path safety and source staging |
| `src/render/` | STL mesh screenshots in a short-lived child process |
| `src/server/` | MCP transport, auth and web routes |
| `test/` | Unit and HTTP regressions |

Build with `npm run build -w mcp`. The runtime entry point is `dist/index.js`; stdio is `dist/stdio.js`. The default browser directory is `../web/dist`, overridable with `WEB_DIR`.

OpenSCAD execution stays behind `OpenScadRunner`. Keep `openscad-wasm` imports in `OpenScadWasmRunner.ts` and its worker, and validate every user input with zod. Do not expose shell execution or raw OpenSCAD CLI arguments.
