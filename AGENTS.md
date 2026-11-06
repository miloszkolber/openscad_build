# AGENTS.md

Development notes for agents working on `openscad_build`.

## Project contract

The repository publishes one OpenSCAD MCP server and browser image. The MCP runtime lives in `mcp/`; the browser UI lives in `web/`. OpenSCAD runs through `openscad-wasm`, never a native binary. Keep server creation separate from transport wiring.

The service must remain runnable through Docker Compose with `docker compose up --build`. The default transport is Streamable HTTP on `/mcp`, port `3333`; the browser is served from `/` on the same port. There are no preview links, artifact stores, job directories or cleanup scripts. Only explicit export and screenshot paths are written.

Do not expose shell execution or raw OpenSCAD CLI arguments. Build arguments only through `mcp/src/openscad/args.ts`.

## Layout

| Path | Purpose |
| --- | --- |
| `mcp/src/` | MCP runtime, tools, workspace and renderer |
| `mcp/test/` | Server unit and HTTP regressions |
| `mcp/scripts/` | Cancellation smoke test and MCP Inspector shortcut |
| `web/src/` | Browser UI and OpenSCAD web worker |
| `web/test/` | Browser scheduling and site contract tests |
| `web/scripts/`, `web/tests/` | Asset preparation and optional CDP check |
| `site/` | GitHub Pages landing page |
| `docs/mcp-clients.md` | Client configuration and raw request examples |

## Build and release

`package.json` is an npm workspace root. `npm ci` installs `mcp` and `web`; `npm run build` builds both. `mcp/` typechecks and builds with TypeScript 7. ESLint and ts-loader use TypeScript 6 because `typescript-eslint` does not support TypeScript 7 yet.

The Dockerfile uses Node 26 build stages and a distroless `cc-debian12:nonroot` runtime with Node 26, `libatomic` and production dependencies only. The runtime runs as UID 1000, reads `/app/web/dist` and writes only `/workspace` and `/tmp`.

`.github/workflows/build.yml` runs checks, builds one `linux/amd64` image, smoke-tests health, MCP `tools/list`, `/api/files` and a real screenshot, then publishes `ghcr.io/miloszkolber/openscad:latest` and `sha-<commit>` from the default branch. Scheduled runs are Monday at 04:00 Europe/Warsaw. Dependabot covers npm, Docker bases and Actions weekly.

`docker-compose_prebuilt.yml` and `site/docker-compose.yml` must stay byte-identical and default to the published image. `OPENSCAD_IMAGE` overrides it for a local build.

## Security invariants

- Validate all user input with zod and keep workspace paths relative, non-symlinked and inside `WORKSPACE_DIR`.
- Reject traversal, absolute paths, URL-like paths, null bytes, backslashes and symlink escapes.
- Keep the workspace extension allowlist narrow.
- Enforce input, output, timeout and concurrency limits before calling the runner.
- Validate decoded helper sizes, aggregate size and count, safe paths and main-source collisions before staging. Never silently omit dependencies.
- Keep browser model routes read-only and reject symlinks and excluded directories.
- MCP auth applies only to `/mcp`; the browser and model routes need a reverse proxy for private repositories.

## Testing

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Run Docker commands with host Docker from the development sandbox. The optional browser check expects an already authorized CDP endpoint and never launches a browser:

```sh
APP_URL=http://127.0.0.1:3333 BROWSER_URL=http://127.0.0.1:9222 npm run test:browser
```

For a real-WASM cancellation check, use an otherwise idle disposable server with `MAX_PARALLEL_JOBS=1` and `MAX_RENDER_MS=4000`, then follow `mcp/scripts/cancellation-smoke.mjs`.

## Documentation

Keep the README user-facing and short. Put MCP client examples in `docs/mcp-clients.md`, browser attribution in `web/README.md`, runtime architecture in `mcp/README.md` and implementation constraints here. Keep repository documentation host-neutral.
