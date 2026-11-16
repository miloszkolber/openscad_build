# Maintenance state

## Baseline 2026-11-06

- Repository: `openscad_build`, published package `ghcr.io/miloszkolber/openscad`.
- Image: Node 26 on distroless `cc-debian12`, UID 1000, linux/amd64.
- Current digest: `sha256:2c79e4ba21d9546d9892864cd63372c75712e819569e82130e2097e04ec7ac33`.
- Host deployment: healthy at the same digest; previous GHCR digests `sha256:24f367f7...` and `sha256:bb38aade...` and local `core/openscad-mcp:lean-65e38dc` retained for rollback.
- Runtime dependencies: `@modelcontextprotocol/sdk`, `express`, `mime-types`, `openscad-wasm`, `sharp`, `zod`; production audit 0.
- Web dependencies: React 19.3.1, monaco-editor 0.57.0, `@gltf-transform` 4.5.1; `dompurify` override `^3.4.17`; audit 0.
- Tooling: TypeScript 7.0.2 via `typescript7` for typecheck and MCP builds; TypeScript 6.0.3 for ESLint and ts-loader; Vitest 5.1.0.
- Browser 3D interaction was operator-confirmed on 2026-11-06; the sandbox Obscura `importScripts` limit is an engine restriction, not an application defect.
- Open items are tracked in [backlog.md](backlog.md).

The weekly OpenChamber maintenance task owns later entries: run date, local revision, reviewed dependency versions and advisories, published digest, host rollout and verification, and any blocker. Do not record host credentials or unrelated project state here.

## Run 2026-11-09

- Local revision: `f37b26a6c1d51a6824302220ef902142e526fa8e`, clean and tracking `origin/main`. `f37b26a` and `78bff9e` touch only `openspec/**`, so the build workflow's `paths-ignore` correctly skipped a rebuild.
- Dependencies and advisories: zero open PRs. Last merges remain vitest 5.1.0, `@types/node` 26.6.6 and ESLint 10.14.0 (2026-11-06). Dependabot alert 1 (minimatch medium) is `fixed`. The `typescript >= 7` ignore stays intentional for the TypeScript 7 typecheck / TypeScript 6 lint split.
- Sandbox checks: `npm ci` (0 vulnerabilities), `prepare:assets`, `typecheck`, `lint`, `npm test` (73 passed), `npm run build`, `check:docs`, `test:docs` (8 passed) and `validate:openspec` (3 specs passed). No image-input changes, so no local `docker build` was needed.
- Published: `ghcr.io/miloszkolber/openscad:latest` and `sha-940e00c05bae` both resolve to `sha256:2c79e4ba21d9546d9892864cd63372c75712e819569e82130e2097e04ec7ac33`. The package is public and an anonymous `docker pull` succeeds. No new publication was needed.
- Host: digest `sha256:2c79e4ba21d9546d9892864cd63372c75712e819569e82130e2097e04ec7ac33`, container healthy for 2 days, `docker compose config --quiet` passes. Verified `/healthz`, MCP `tools/list`, browser index 200 with model route 200, one `openscad_screenshot` PNG and one workspace write/read/delete round trip. No redeploy was needed. Rollback images retained: `sha256:24f367f7...`, `sha256:bb38aade...` and local `core/openscad-mcp:lean-65e38dc`.
- Blocker: none. Follow-up review: the Monday 04:00 Europe/Warsaw scheduled `Build image` run 42605446661 succeeded on `f94991d` (`check` plus `image` jobs: build, smoke test, publish). Unchanged inputs reproduced the same digest, now also tagged `sha-f94991df3959`. The review re-ran the full sandbox suite green (73 tests) and verified the TypeScript 7 lint split is still upstream-blocked (latest `typescript-eslint` peers `typescript < 6.1.0`).

## Run 2026-11-16

- Local revision: `df2f6b6` (squash-merge of Dependabot PR #14), clean and tracking `origin/main`.
- Dependencies and advisories: reviewed the one open Dependabot PR #14 (`typescript-eslint` 8.72.1 to 8.72.2 patch, `puppeteer-core` 25.16.0 to 25.17.0 minor; additive feature only, used solely by the optional CDP check). PR `check` and `image` jobs passed, merge state clean, so merged with `--squash`. Zero open PRs remain. Dependabot alert 1 (minimatch medium) stays `fixed`. The `typescript >= 7` ignore stays intentional for the TypeScript 7 typecheck / TypeScript 6 lint split.
- Sandbox checks on the merged tree: `npm ci`, `prepare:assets`, `typecheck`, `lint`, `npm test` (10 files, 73 passed), `npm run build`, `check:docs`, `test:docs` (8 passed) and `validate:openspec` (3 specs passed); production audit 0 vulnerabilities. No image-input changes beyond the dependency bump, so no separate local `docker build` was needed.
- Published: post-merge `Build image` run 43807534076 green (`check` plus `image` jobs). `ghcr.io/miloszkolber/openscad:latest` and `sha-df2f6b605a34` both resolve to `sha256:48c6fa8b923ee43786a3a56aa4d323d5c8580849fede3fa46e71a397063c20eb`. The package is public (anonymous manifest inspect succeeds).
- Host: outgoing digest `sha256:2c79e4ba...` recorded, then `config --quiet`, `pull` and `up -d --wait` in the idle window. New digest `sha256:48c6fa8b...` healthy; verified `/healthz`, MCP `tools/list` (all 8 tools), browser index 200 with `index.js`, `model-viewer.min.js` and `favicon.ico` 200, one `openscad_screenshot` PNG and one workspace write/read/delete round trip. Host README updated. Rollback images retained: `sha256:2c79e4ba...`, `sha256:24f367f7...`, `sha256:bb38aade...` and local `core/openscad-mcp:lean-65e38dc`.
- Blocker: none.
