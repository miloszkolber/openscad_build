# AGENTS.md

Development notes for agents working on `openscad_build`.

## Project contract

The repository publishes one OpenSCAD MCP server and browser image. The MCP runtime lives in `mcp/`; the browser UI lives in `web/`. OpenSCAD runs through `openscad-wasm`, never a native binary. Keep server creation separate from transport wiring.

The service must remain runnable through `docker compose -f compose/docker-compose.yaml up -d`. The default transport is Streamable HTTP on `/mcp`, port `3333`; the browser is served from `/` on the same port. There are no preview links, artifact stores, job directories or cleanup scripts. Only explicit export and screenshot paths are written.

Do not expose shell execution or raw OpenSCAD CLI arguments. Build arguments only through `mcp/src/openscad/args.ts`.

## Layout

| Path | Purpose |
| --- | --- |
| `mcp/src/` | MCP runtime, tools, workspace and renderer |
| `mcp/test/` | Server unit and HTTP regressions |
| `mcp/scripts/` | Cancellation smoke test and MCP Inspector shortcut |
| `web/src/` | Browser UI and OpenSCAD web worker |
| `web/test/` | Browser scheduling tests |
| `web/scripts/`, `web/tests/` | Asset preparation and optional CDP check |
| `docker/openscad.Dockerfile` | Multi-stage image recipe |
| `compose/` | Published-image Compose example and environment template |
| `openspec/` | Sole documentation and planning tree |
| `scripts/check-docs.mjs` | Local documentation structure check |

## Build and release

`package.json` is an npm workspace root. `npm ci` installs `mcp` and `web`; `npm run build` builds both. `mcp/` typechecks and builds with TypeScript 7. ESLint and ts-loader use TypeScript 6 because `typescript-eslint` does not support TypeScript 7 yet.

`docker/openscad.Dockerfile` uses Node 26 build stages and a distroless `cc-debian12:nonroot` runtime with Node 26, `libatomic` and production dependencies only. The runtime runs as UID 1000, reads `/app/web/dist` and writes only `/workspace` and `/tmp`.

`.github/workflows/build.yml` runs checks, builds one `linux/amd64` image, smoke-tests health, MCP `tools/list`, `/api/files` and a real screenshot, then publishes `ghcr.io/miloszkolber/openscad:latest` and `sha-<commit>` from the default branch. Scheduled runs are Monday at 04:00 Europe/Warsaw. Dependabot covers npm, Docker bases and Actions weekly.

`compose/docker-compose.yaml` defaults to the published image. `OPENSCAD_IMAGE` overrides it for a local build. Do not add a GitHub Pages site or a duplicate `docs/` tree.

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

Run the documentation checks with `npm run check:docs`, `npm run test:docs` and `npm run validate:openspec`.

## Documentation

Keep the README user-facing and short. `openspec/` is the only documentation and planning tree: put implemented contracts in `openspec/specs/`, scoped changes in `openspec/changes/`, client examples in `openspec/references/`, deferred work in `openspec/backlog.md` and the weekly review cursor in `openspec/maintenance-state.md`. Keep package READMEs for commands and implementation constraints. Do not add a duplicate `docs/` tree or GitHub Pages site. Keep repository documentation host-neutral.
