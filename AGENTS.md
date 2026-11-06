# AGENTS.md

Development notes for agents working on `openscad_build`.

## Project Contract

This project is an OpenSCAD MCP server plus a browser UI. The server uses the `openscad-wasm` npm package and the browser uses a checksum-pinned web WASM build. Do not add a native OpenSCAD binary dependency, do not use browser UI automation as the model execution backend, and do not expose arbitrary shell commands or raw OpenSCAD CLI args. Browser interaction checks use the provided Chromium tools.

The service must remain runnable through Docker Compose with:

```bash
docker compose up --build
```

The default MCP transport is Streamable HTTP on `/mcp`, port `3333`. The browser UI is served from `/` on the same port. Keep server creation separate from transport wiring so stdio can be added later.

There are no temporary preview links, artifact stores, job directories, or cleanup scripts. Agents work on SCAD files in the mounted workspace. Explicit export and screenshot paths are the only files the server writes.

## Builds and Releases

`.github/workflows/build.yml` runs the typecheck, lint, test and build checks on pushes, pull requests and a weekly schedule, then builds and smoke-tests the image once. Only default-branch runs publish `ghcr.io/miloszkolber/openscad-mcp:latest` and `ghcr.io/miloszkolber/openscad-mcp:sha-<commit>`.

`.github/dependabot.yml` owns weekly npm, Docker base-image and GitHub Actions updates. Keep it aligned with the actual package manifests, Dockerfile and workflow files. Update the lockfile with npm inside the development sandbox and verify with the commands below before merging dependency changes.

`docker-compose_prebuilt.yml` and `site/docker-compose.yml` must stay byte-identical and default to the published image. `OPENSCAD_IMAGE` overrides it for a locally built image.

## Development Commands

```bash
npm install
npm run prepare:assets
npm run build
npm test
npm run lint
```

Use the mock backend for local development that should not depend on real WASM behavior:

```bash
OPENSCAD_BACKEND=mock npm run dev
```

Before handing off code changes, run at least:

```bash
npm test
npm run typecheck
npm run build
```

Run `npm run lint` when touching TypeScript, config, or formatting-sensitive files. Use container tooling for builds and tests. No host runtime installation is needed.

## Runtime Configuration

Environment defaults are documented in `.env.example`:

- `PORT=3333`
- `HOST=0.0.0.0`
- `WORKSPACE_DIR=/workspace`
- `WEB_DIR=<cwd>/dist/web`
- `MAX_RENDER_MS=30000`
- `MAX_OUTPUT_MB=50`
- `MAX_INPUT_MB=50`
- `MAX_PARALLEL_JOBS=2`
- `OPENSCAD_BACKEND=wasm|mock`
- `MCP_AUTH_TOKEN` (optional; when set, `/mcp` requires `Authorization: Bearer <token>`)

Docker Compose binds only `127.0.0.1:3333:3333` and uses a read-only root filesystem, `/tmp` tmpfs, `cap_drop: ALL`, and `no-new-privileges`.

## Architecture Map

- `src/index.ts`: process entry point; loads config, creates dependencies, starts HTTP transport.
- `src/config.ts`: env parsing and runtime limits.
- `src/server/createMcpServer.ts`: MCP server construction and tool registration.
- `src/server/transport.ts`: Streamable HTTP wiring and MCP auth.
- `src/server/webRoutes.ts`: browser UI static assets, `/api/files`, `/models/*`, and `/healthz`.
- `src/tools/`: zod schemas and MCP tool handlers.
- `src/render/`: cancellable STL mesh image child process, renderer and camera validation. Screenshot image processing holds the same job permit and execution deadline as its WASM export. The child exits after each render so the OS reclaims its heap.
- `src/openscad/OpenScadRunner.ts`: runner interface and shared runner result types.
- `src/openscad/OpenScadWasmRunner.ts`: real server-side `openscad-wasm` integration boundary.
- `src/openscad/MockOpenScadRunner.ts`: deterministic runner for tests and development.
- `src/openscad/args.ts`: allowlisted OpenSCAD CLI-compatible args builder.
- `src/workspace/`: workspace file access, model source staging, and path safety.
- `src/security/`: size limits, semaphore, and sanitization helpers.
- `web/`: browser UI source, assets, and build configuration.
- `test/`: vitest coverage for safety, formats, diagnostics, workspace, HTTP, and mock tool flows.

## OpenSCAD Runner Rules

Keep OpenSCAD execution behind `OpenScadRunner`.

- `OpenScadWasmRunner` owns `openscad-wasm` imports, Emscripten FS writes, `callMain` args, stdout/stderr capture, output reads, and timeout behavior.
- `MockOpenScadRunner` should stay fast, deterministic, and independent of `openscad-wasm`.
- Tool handlers should not know package-specific WASM details.
- If the `openscad-wasm` API changes, prefer editing `OpenScadWasmRunner.ts` and local type declarations instead of spreading compatibility code through tools.
- Each run uses a fresh worker thread and a fresh in-memory Emscripten filesystem. The main source is written at `/job/<sourcePath>` so relative includes and imports resolve beside it.

The real `openscad-wasm` backend is exercised by the deployed service. Keep the mock runner as the fast, deterministic test path; add real-backend checks when changing runner internals.

## Security Invariants

Preserve these constraints when adding tools or options:

- Validate all user input with zod.
- Reject path traversal, absolute paths, URL-like paths, null bytes, backslashes, and symlink escapes.
- Keep allowed workspace extensions limited unless there is a clear reason to expand them.
- Do not expose shell execution.
- Do not accept raw OpenSCAD CLI args.
- Build args only through `src/openscad/args.ts`.
- Keep `-D` define keys restricted to safe identifiers.
- Enforce input size, output size, timeout, and concurrency limits.
- Validate decoded helper sizes, aggregate size/count, safe relative paths and main-source collisions before calling the runner. Never silently omit dependencies on staging overflow.
- Do not write temporary job directories, artifacts, or preview tokens.
- Browser model routes must reject symlinks and excluded directories such as `.git`, `.tmp`, and `node_modules`.
- MCP auth applies only to `/mcp`. The browser UI and read-only model routes remain public; document that a reverse proxy is required for private repositories.

## Tool Behavior Expectations

- `openscad_validate`: returns `ok`, `diagnostics`, `stdout`, `stderr`, `elapsedMs`.
- `openscad_export_model`: returns `ok`, `output` metadata (`path`, `filename`, `format`, `mimeType`, `sizeBytes`, `sha256`), diagnostics, and elapsed time. Writes to `outputPath` or, for workspace sources, the source path with the format extension.
- `openscad_screenshot`: returns `ok`, inline PNG or WebP image content, `image` metadata, `summary` geometry, and optional `output` metadata. It never creates a file unless `outputPath` is provided.
- `openscad_analyze_model`: exports STL in memory, then computes bbox and triangle count from ASCII/binary STL or OpenSCAD summary data. It writes no file.
- Workspace tools must never read, write, list, or delete outside `WORKSPACE_DIR`.

MCP responses should include both text content and structured content when practical. Screenshot responses include an image content item plus text metadata.

## Browser UI

- The UI is a focused fork of OpenSCAD Playground. Preserve upstream licenses and attribution in `web/`.
- Mounted sources are read-only. Pasted code renders from memory and is never written to the workspace.
- Rendering and STL export happen in the browser. The server only lists and serves workspace files.
- Keep the compact file/source/preview/properties layout and the collapsed log panel unless the change explicitly targets them.
- The browser fetches `/api/files` and `/models/*`; keep those routes cache-safe and path-safe.

## Testing Guidance

Existing test focus:

- path traversal and symlink escape prevention
- format allowlist and define args builder behavior
- diagnostics parsing
- workspace read/write/list/delete and model source staging
- mock-runner tool behavior, including export output paths and screenshot bytes
- STL bbox and triangle count parsing
- HTTP MCP tools list, auth, cancellation, browser file index, and model serving

When changing shared security or workspace behavior, add tests before broadening behavior. When changing `OpenScadWasmRunner`, keep mock tests green and add integration notes or tests if real WASM behavior is available.

## Documentation

- Keep README focused on project purpose, Docker usage, MCP client usage, tools, browser usage, and user-facing limitations.
- Put agent/developer implementation notes in this file.
- Track remaining implementation work in `TODO.md`.
- Keep host-specific paths and deployment values out of the repository.
