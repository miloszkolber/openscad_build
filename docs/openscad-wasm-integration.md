# openscad-wasm Integration Notes

Verified on 2026-07-06 with the pinned `openscad-wasm@0.0.4` package.

## Package Boundary

- The runtime import path is the package ESM entry: `import { createOpenSCAD } from "openscad-wasm"`.
- The package embeds its WASM payload in `openscad.js`, so Node.js does not need extra `.wasm` or data files copied beside the app.
- The package `types` field points at `openscad.js`; the project keeps a local declaration file only to describe the package API at the runner boundary.
- Each render runs in a fresh worker thread and a fresh OpenSCAD instance. Reusing one instance for multiple `callMain()` calls can throw in this build.

## Node.js Initialization

The runner initializes the module with:

```ts
createOpenSCAD({
  noInitialRun: true,
  noExitRuntime: true,
  print,
  printErr
});
```

`print` and `printErr` consistently capture OpenSCAD stdout/stderr for diagnostics parsing.

## Export Format Checks

Fresh-instance checks with minimal models:

| Format | Result                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------- |
| `stl`  | Succeeds                                                                                                |
| `off`  | Succeeds                                                                                                |
| `csg`  | Succeeds                                                                                                |
| `dxf`  | Succeeds with a 2D model                                                                                |
| `svg`  | Succeeds with a 2D model                                                                                |
| `3mf`  | The build advertises the extension but throws `null function or function signature mismatch` in Node.js |
| `png`  | The build advertises the extension but exits with code `1` and produces no artifact                     |

The MCP runner keeps `3mf` in the public allowlist because OpenSCAD advertises it, but returns a clear failed tool result when this specific WASM build cannot export it. Screenshot rendering does not use OpenSCAD PNG export.

STL exports explicitly use `--export-format binstl` through the allowlisted args builder. This avoids ASCII expansion pushing imported meshes over the byte limit without decimating their geometry.

## Screenshot Rendering

`openscad_screenshot` exports STL through the normal `OpenScadRunner.export()` path, then renders the STL mesh to PNG or WebP inside Node.js with `sharp`. This keeps the OpenSCAD integration behind the same WASM runner boundary and avoids a native OpenSCAD binary, browser automation, or raw OpenSCAD CLI arguments.

The server-side renderer supports `width`, `height`, `camera`, `projection`, `viewAll`, and `autoCenter`. Camera values are validated as 6-value vector camera or 7-value gimbal camera tuples, but the rendered view is an approximation of OpenSCAD's GUI/PNG viewport.

Because the renderer starts from STL, screenshots are shaded mesh previews only. They do not preserve OpenSCAD colors, preview modifiers, GUI overlays, or 2D-only output. If the model cannot export to STL, screenshot rendering returns the STL export failure.

## Summary File

`--summary all --summary-file /job/summary.json` works in this build. `openscad_analyze_model` asks for summary data during STL export and prefers the summary bounding box. It uses summary facet counts as triangle counts only when the summary marks the geometry as triangular; otherwise it keeps the STL parser triangle count.

## Filesystem Layout

The runner writes the main source to `/job/<sourcePath>` in the Emscripten filesystem and copies MCP-provided helper files under the same virtual root. When a tool receives a workspace `path`, the source file's directory is staged beside it, preserving workspace-relative paths. Verified behavior:

- `include <lib.scad>` resolves helper files copied beside the source.
- `include <parts/lib.scad>` resolves helper files copied under the virtual root.
- `import("meshes/tiny.stl")` resolves imported assets copied under the virtual root.
- No job directory, artifact directory, or preview file is written to the host. Exports write to the named output or beside the source by default. Screenshots write only when the caller supplies `outputPath`.

The Docker image uses a read-only root filesystem. Required writes stay in the bind-mounted workspace or the in-memory Emscripten filesystem.

## Runtime Safety

WASM execution runs inside a Node.js worker thread. If the render timeout expires, the main MCP process terminates the worker and returns an error diagnostic instead of waiting for a blocked `callMain()`. Screenshot mesh projection/encoding runs in a short-lived child process, within the same semaphore permit and execution budget, so it cannot block HTTP or admit extra jobs. The process exits after each render so the OS reclaims the image heap.

Input size is enforced before files are written into the Emscripten filesystem, including decoded helper data. Combined source and helper inputs are limited to eight times the per-file limit or 128 MiB, whichever is smaller, with up to 200 helpers. Exceeding automatic staging limits fails explicitly rather than silently omitting files. Output limits apply to intermediate STL and inline images as well as saved files. Very complex models may still exhaust WASM memory inside the worker; those failures are returned as OpenSCAD diagnostics or worker errors instead of exposing shell/native process details.

## Libraries and Fonts

No common OpenSCAD libraries are bundled for the MCP engine. Callers must provide required `.scad`, mesh, JSON, text, or font-adjacent assets through MCP `files`, a workspace source path, or workspace tools.

Font-dependent models depend on the selected WASM build and files available in the job filesystem. This project does not install host fonts or mount system font directories into the container. The browser UI ships Liberation fonts for ordinary `text()` models.
