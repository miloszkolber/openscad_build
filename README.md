# openscad

OpenSCAD Model Context Protocol server and browser UI. OpenSCAD runs in WebAssembly, so the service needs no native OpenSCAD installation.

## Run

```sh
docker compose -f compose/docker-compose.yaml up -d
```

- Browser: `http://127.0.0.1:3333/`
- MCP: `http://127.0.0.1:3333/mcp`
- Workspace: `${WORKSPACE_PATH:-./workspace}` from the Compose directory, mounted at `/workspace`

The Compose example pulls `ghcr.io/miloszkolber/openscad:latest` for `linux/amd64`. To use a local build instead:

```sh
docker build -f docker/openscad.Dockerfile -t openscad:local .
OPENSCAD_IMAGE=openscad:local docker compose -f compose/docker-compose.yaml up -d
```

`MCP_AUTH_TOKEN` protects `/mcp`. `WORKSPACE_DIR`, `MAX_RENDER_MS`, `MAX_OUTPUT_MB`, `MAX_INPUT_MB` and `MAX_PARALLEL_JOBS` are documented in [compose/.env.example](compose/.env.example). The browser and model routes stay public; use a reverse proxy for private repositories.

## Tools

- `openscad_validate`: validate a workspace SCAD file or inline source.
- `openscad_export_model`: export to STL, 3MF, OFF, CSG, DXF or SVG.
- `openscad_screenshot`: return a shaded PNG or WebP image, optionally written to the workspace.
- `openscad_analyze_model`: compute the bounding box and triangle count.
- `workspace_list_files`, `workspace_read_file`, `workspace_write_file`, `workspace_delete_file`: manage workspace files.

All OpenSCAD tools accept `path` or `scad`. A workspace `path` stages sibling files for relative `include` and `import` statements. Client setup and raw JSON examples are in [openspec/references/mcp-clients.md](openspec/references/mcp-clients.md).

## Build and release

The `Build image` workflow runs on pushes, pull requests, manual dispatch and every Monday at 04:00 Europe/Warsaw. It runs typecheck, lint, the full test suite and the build, then builds and smoke-tests one `linux/amd64` image before publishing:

- `ghcr.io/miloszkolber/openscad:latest`
- `ghcr.io/miloszkolber/openscad:sha-<commit>`

Dependabot checks npm packages, Docker base images and GitHub Actions weekly. The runtime image uses Node 26 on a distroless base; TypeScript 7 performs typechecking while TypeScript 6 remains the ESLint and ts-loader API.

## Development

```sh
npm ci
npm run prepare:assets
npm run build
npm test
npm run lint
npm run typecheck
npm run check:docs
```

`mcp/` contains the MCP runtime, `web/` the browser UI, `docker/` the image recipe and `compose/` the deployment example. The mock backend is available with `OPENSCAD_BACKEND=mock npm run dev`. The browser check accepts an already authorized CDP endpoint: `APP_URL=http://127.0.0.1:3333 BROWSER_URL=http://127.0.0.1:9222 npm run test:browser`.

## Documentation

[`openspec/`](openspec/README.md) is the single documentation and planning tree: implemented [contracts](openspec/specs/), scoped [changes](openspec/changes/) and the [deferred backlog](openspec/backlog.md).

## Licensing

The MCP server is MIT licensed. The browser UI is derived from OpenSCAD Playground and is GPLv2 or later; its notices are in [web/LICENSE.md](web/LICENSE.md). This repository builds on the MIT-licensed [upstream project](https://github.com/suapapa/openscad-wasm-mcp).
