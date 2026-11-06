# Change history

## 2026-11-06 repository reorganization

- Split the runtime into `mcp/` and `web/` npm workspaces while keeping one image.
- Moved the image recipe to `docker/openscad.Dockerfile` and the deployment example to `compose/`.
- Replaced the Node runtime with a distroless `cc-debian12` image carrying Node 26, `libatomic` and production dependencies only, running as UID 1000.
- Renamed the published package to `ghcr.io/miloszkolber/openscad`.
- Upgraded React 19, monaco-editor 0.57, `@gltf-transform` 4.5 and Vitest 5; added TypeScript 7 as a side-by-side `typescript7` alias for typecheck and MCP builds.
- Removed the GitHub Pages site and the duplicate `docs/` tree; OpenSpec is now the documentation and planning owner.
- Deployed the image on the host and created the weekly OpenChamber maintenance task.

Evidence: Build image workflow run `42244981193`, published digest `sha256:2c79e4ba...`, host health, MCP `tools/list`, screenshot, workspace write/read/delete and static asset checks on 2026-11-06. The operator confirmed 3D browser interaction works on 2026-11-06; the earlier Obscura `importScripts` limit was an engine restriction, not an application defect.
