# TODO Checklist

This checklist tracks the work left after the initial scaffold. The current project builds and tests with the mock runner; these items are about hardening the real `openscad-wasm` backend and expanding runtime behavior.

## openscad-wasm Integration

- [x] Confirm the correct import path for the pinned `openscad-wasm` package.
  - Notes: the runtime import is `import { createOpenSCAD } from "openscad-wasm"` inside the WASM worker. The local declaration remains only because package metadata points `types` at JS.
- [x] Confirm `createOpenSCAD()` initialization options for Node.js 22.
  - Notes: `noInitialRun`, `noExitRuntime`, `print`, and `printErr` work locally; the package embeds the WASM payload in `openscad.js`.
- [x] Verify `callMain(["input.scad", "-o", "output.ext"])` for every allowed export format.
  - Notes: `stl`, `off`, `csg`, `dxf`, and `svg` succeed with fresh instances. `3mf` is advertised by OpenSCAD but fails in this build with `null function or function signature mismatch`; the runner returns a clear failed tool result. See `docs/openscad-wasm-integration.md`.
- [x] Capture stdout/stderr consistently from the WASM module.
  - Notes: worker initialization wires `print` and `printErr`; diagnostics parsing receives captured output.

## Runtime Safety

- [x] Propagate HTTP disconnect and MCP cancellation signals through queued and executing WASM jobs, awaiting worker termination before returning the concurrency permit.
- [x] Enforce `MAX_RENDER_MS` as an execution ceiling while allowing shorter client timeouts, with cancellation, queue-cleanup and worker-lifetime regression tests.
- [x] Replace the cooperative timeout wrapper with a worker-thread based hard timeout if `callMain` blocks the event loop.
  - Notes: `OpenScadWasmRunner` now executes WASM work in a worker thread and terminates the worker on timeout.
- [x] Add memory and output-size behavior notes for complex models.
  - Notes: README and integration notes document input/output limits, worker failures, and WASM memory behavior.
- [x] Confirm Docker read-only filesystem behavior with the real WASM backend.
  - Notes: Compose keeps root read-only; Node writes job files under `/tmp`, artifacts under `/workspace/artifacts`, and OpenSCAD inputs inside the in-memory Emscripten FS. `docker compose config` now works without a local `.env`.

## Preview Rendering

- [x] Determine whether the selected WASM build supports PNG export.
  - Notes: the pinned build advertises `png` but exits with code `1` and produces no artifact in Node.js. Preview rendering no longer depends on OpenSCAD PNG export.
- [x] Render previews as WebP by exporting STL through `openscad-wasm` and rendering the mesh server-side.
  - Notes: `openscad_render_preview` exports STL, projects and shades STL triangles in Node.js, and encodes `output.webp`.
- [x] Add safe preview options for width, height, camera, projection, view-all, and auto-center.
  - Notes: camera is restricted to 6 or 7 finite numeric values. The server-side renderer approximates these camera options instead of passing raw OpenSCAD CLI args.
- [x] Add preview tests for WebP artifact metadata.
  - Notes: mock tests assert `image/webp` metadata and RIFF/WEBP output bytes without depending on real WASM rendering behavior.

## Validation and Analysis

- [x] Decide whether validation should emit CSG, AST, or use a future summary-only mode.
  - Notes: validation uses an internal CSG export in the worker FS and does not persist artifacts.
- [x] Add support for OpenSCAD `--summary-file` if the WASM build supports it.
  - Notes: `openscad_analyze_model` requests summary JSON and prefers summary bounding boxes, falling back to STL parsing.
- [x] Expand STL parser edge-case coverage.
  - Notes: tests cover empty STL, malformed binary STL, negative coordinates, and scientific notation.

## Include, Import, and Fonts

- [x] Confirm WASM filesystem layout for `include`, `use`, and `import()`.
  - Notes: helper `.scad` files and imported STL assets resolve under the virtual job root.
- [x] Document font handling constraints.
  - Notes: README and integration notes explain that host fonts are not installed or mounted.
- [x] Decide whether common OpenSCAD libraries should be bundled.
  - Notes: common libraries are not bundled; callers provide required libraries via MCP files or workspace tools.

## MCP and Developer Experience

- [x] Add stdio transport entry point.
  - Notes: `src/stdio.ts` shares dependency/server creation and wires only `StdioServerTransport`.
- [x] Add an MCP smoke test against the `/mcp` Streamable HTTP endpoint.
  - Notes: `test/httpSmoke.test.ts` covers `tools/list` and `openscad_validate` with the mock backend.
- [x] Add Docker smoke instructions for mock backend.
  - Notes: README includes `OPENSCAD_BACKEND=mock docker compose up --build` and `/healthz` smoke instructions.
