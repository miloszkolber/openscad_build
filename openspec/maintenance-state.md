# Maintenance state

## Baseline 2026-11-06

- Repository: `openscad_build`, published package `ghcr.io/miloszkolber/openscad`.
- Image: Node 26 on distroless `cc-debian12`, UID 1000, linux/amd64.
- Current digest: `sha256:2c79e4ba21d9546d9892864cd63372c75712e819569e82130e2097e04ec7ac33`.
- Host deployment: healthy at the same digest; previous GHCR digests `sha256:24f367f7...` and `sha256:bb38aade...` and local `core/openscad-mcp:lean-65e38dc` retained for rollback.
- Runtime dependencies: `@modelcontextprotocol/sdk`, `express`, `mime-types`, `openscad-wasm`, `sharp`, `zod`; production audit 0.
- Web dependencies: React 19.3.1, monaco-editor 0.57.0, `@gltf-transform` 4.5.1; `dompurify` override `^3.4.17`; audit 0.
- Tooling: TypeScript 7.0.2 via `typescript7` for typecheck and MCP builds; TypeScript 6.0.3 for ESLint and ts-loader; Vitest 5.1.0.
- Open items are tracked in [backlog.md](backlog.md).

The weekly OpenChamber maintenance task owns later entries: run date, local revision, reviewed dependency versions and advisories, published digest, host rollout and verification, and any blocker. Do not record host credentials or unrelated project state here.
