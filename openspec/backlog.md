# Deferred work and ownership

These entries preserve useful direction without pretending a design has been approved. Start a change only when its scope and authority are settled.

| Area | State | Next evidence or decision |
| --- | --- | --- |
| Old GHCR package | Open | `ghcr.io/miloszkolber/openscad-mcp` remains because GitHub has no package rename and the available token lacks delete-package scope. Decide whether to retain it as history or delete it with broader authority |
| Multi-architecture image | Deferred | Publish `linux/arm64` only after an emulated or native build and the same smoke tests pass. The distroless runtime copies an amd64 `libatomic` path today |
| TypeScript 7 for lint | Deferred | `typescript-eslint` does not support the TypeScript 7 API. Keep TypeScript 6 for ESLint and ts-loader, and revisit when the parser supports the native API |
| Screenshot fidelity | Accepted limit | Screenshots are shaded STL mesh previews; they do not preserve OpenSCAD colors, preview modifiers or 2D camera output |
