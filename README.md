# openscad_build

OpenSCAD Model Context Protocol (MCP) server and browser UI, maintained here as `openscad_build` and published weekly as a container image. The server uses the `openscad-wasm` npm package and the browser uses a checksum-pinned web WASM build, so no native OpenSCAD installation is required.

The service has two surfaces on one port:

- `/mcp` exposes agent tools for validating, exporting, screenshotting, analyzing, and editing SCAD files in a mounted model workspace.
- `/` serves a browser UI for browsing the same workspace, reading SCAD sources, changing Customizer properties, rendering in browser WebAssembly, pasting code, and downloading STL files.

There are no temporary preview links, artifact stores, job directories, or cleanup scripts. The workspace is the model repository itself.

## Quick Start

```bash
docker compose up --build
```

- Browser UI: `http://127.0.0.1:3333/`
- MCP endpoint: `http://127.0.0.1:3333/mcp`

By default the container mounts `./workspace` at `/workspace`. Point `WORKSPACE_DIR` and the Compose volume at your model repository, for example:

```yaml
volumes:
  - /path/to/models:/workspace:rw
```

`docker-compose_prebuilt.yml` pulls `ghcr.io/miloszkolber/openscad-mcp:latest`, the image published from this repository. To build and use a local image without a registry instead:

```sh
docker build -t openscad-mcp:local .
OPENSCAD_IMAGE=openscad-mcp:local docker compose -f docker-compose_prebuilt.yml up -d
```

## Builds and Releases

The `Build image` workflow runs on every push to `main`, on pull requests, manually, and every Monday at 04:00 Europe/Warsaw. It typechecks, lints, tests and builds the project, then builds the container once and smoke-tests its health endpoint, MCP `tools/list` surface and workspace file index before publishing the tested image.

Published images:

- `ghcr.io/miloszkolber/openscad-mcp:latest` tracks the default branch.
- `ghcr.io/miloszkolber/openscad-mcp:sha-<commit>` identifies the source commit.

Dependabot checks npm packages, the Docker base image and GitHub Actions weekly. Routine updates are merged only after the same checks pass. A scheduled weekly build uses the default branch, so dependency pull requests must land before that run to be included.

This repository is based on the MIT-licensed [upstream project](https://github.com/suapapa/openscad-wasm-mcp). The runtime package and MCP server identifiers keep the upstream `openscad-wasm-mcp` name; `openscad_build` names this build repository and its image release process.

## MCP Tools

### OpenSCAD tools

- `openscad_validate`: Validate a workspace SCAD file or inline source and return diagnostics.
- `openscad_export_model`: Export to `stl`, `3mf`, `off`, `csg`, `dxf`, or `svg`. Writes the output to a workspace path.
- `openscad_screenshot`: Render a shaded PNG or WebP image of the model and return it inline. Optionally also write it to a workspace path.
- `openscad_analyze_model`: Compute the bounding box and triangle count.

All OpenSCAD tools accept either `path` (workspace-relative SCAD file) or `scad` (inline source). When `path` is used, files beside the source are staged automatically for relative `include` and `import` statements. Extra files can be supplied with `files`.

Input limits apply to source and decoded helper files. A job accepts up to 200 helpers and a combined input size of eight times `MAX_INPUT_MB` or 128 MiB, whichever is smaller. Staging fails explicitly on overflow. Helpers cannot replace the main source. HTTP payloads above the SDK's default 100 KiB are supported within a finite body limit.

`openscad_export_model` defaults the output path to the source path with the format extension. Inline source exports require an explicit `outputPath`.

### Workspace tools

- `workspace_list_files`: List files in the model workspace.
- `workspace_read_file`: Read an allowed file.
- `workspace_write_file`: Write an allowed text file.
- `workspace_delete_file`: Delete an allowed file.

Paths are relative to the workspace root. The server never exposes shell execution or raw OpenSCAD CLI arguments.

## Browser UI

The browser lists SCAD files recursively from the mounted workspace. Select a file to read its source, adjust Customizer properties, and render it with the OpenSCAD WebAssembly engine in the browser. Download STL exports client-side.

- Mounted sources are read-only.
- `Paste code` opens an in-memory editor for SCAD that is never written to the workspace.
- Relative includes and imported assets resolve from the mounted workspace.
- Temporary staging, Git metadata, symlinks, and `job-*` files are not exposed.

## Configuration

Copy `.env.example` to `.env` and adjust the values.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3333` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `WORKSPACE_DIR` | `/workspace` | Mounted model repository |
| `WEB_DIR` | `<cwd>/dist/web` | Built browser assets |
| `MAX_RENDER_MS` | `30000` | WASM execution ceiling |
| `MAX_OUTPUT_MB` | `50` | Export and image output limit |
| `MAX_INPUT_MB` | `50` | Per-file input limit |
| `MAX_PARALLEL_JOBS` | `2` | Concurrent WASM jobs |
| `OPENSCAD_BACKEND` | `wasm` | `wasm` or `mock` |
| `MCP_AUTH_TOKEN` | unset | Require `Authorization: Bearer <token>` on `/mcp` |

`MAX_RENDER_MS` is both the default and maximum WASM execution time. A tool's `timeoutMs` may shorten that limit but cannot extend it. Screenshots share this execution budget and concurrency permit across WASM export and mesh-image processing, which run in a cancellable WASM worker and a short-lived image child process. Disconnecting an HTTP tool request or cancelling it through the MCP request signal terminates active work. Queue waiting time is not included in the execution timeout.

The browser UI and model files are public on the HTTP port. Protect them at a reverse proxy if the model repository is not public.

## Development

```bash
npm install
npm run prepare:assets
npm run build
npm test
npm run lint
```

`npm run prepare:assets` downloads checksum-verified OpenSCAD WebAssembly and Liberation fonts for the browser UI. `npm run build` compiles the server and the browser bundle into `dist/`.

Use the mock backend for local development that should not depend on real WASM behavior:

```bash
OPENSCAD_BACKEND=mock npm run dev
```

Build the server worker and image-process entry points first with `npm run build:server` when running from TypeScript source. Tests build them automatically.

Run the optional browser check against an already authorized CDP endpoint:

```bash
APP_URL=http://127.0.0.1:3333 BROWSER_URL=http://127.0.0.1:9222 npm run test:browser
```

The runner never launches a browser. It expects a mounted `browser-check/main.scad` fixture with `width = 18; // [1:1:50]` followed by `cube([width, 7, 9]);`.

## Known Limitations

- **Performance**: Complex models can be slow or memory-intensive inside WebAssembly.
- **Visuals**: Screenshots are shaded mesh previews. They do not preserve OpenSCAD colors, GUI helpers, or 2D camera perspectives. Meshes above 500,000 triangles are rejected.
- **Assets and libraries**: Fonts and external libraries are not bundled for the MCP engine. Put required files in the workspace beside the source.
- **Format support**: `3mf` is advertised by OpenSCAD but fails in the pinned server-side WASM build. The tool returns a clear error.

## Licensing

The MCP server is MIT licensed. The browser UI is derived from OpenSCAD Playground and is distributed under GPLv2 or later; its dependencies and attribution are documented in [web/LICENSE.md](web/LICENSE.md). Runtime dependencies carry their own licenses.
