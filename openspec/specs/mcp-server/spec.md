# MCP server

## Purpose

Expose OpenSCAD validation, export, screenshot and analysis tools over the Model Context Protocol, plus a read-only browser file surface, without a native OpenSCAD installation.

Source: [mcp/src](../../../mcp/src), [mcp/test](../../../mcp/test). Checks: unit and HTTP tests, the image smoke test in [build.yml](../../../.github/workflows/build.yml).

## Requirements

### Requirement: MCP transports
The server SHALL expose Streamable HTTP on `/mcp` and an optional stdio entry point, while keeping server construction separate from transport wiring.

#### Scenario: HTTP tool listing
- **GIVEN** a running server on port 3333
- **WHEN** a client sends `tools/list` to `/mcp`
- **THEN** the four OpenSCAD tools and four workspace tools are returned
- **AND** the response is valid JSON-RPC

#### Scenario: Stdio entry point
- **WHEN** `mcp/dist/stdio.js` starts with a valid workspace
- **THEN** it serves the same tool surface over stdio without opening an HTTP port

### Requirement: Authentication boundary
The server SHALL require `Authorization: Bearer <token>` on `/mcp` only when `MCP_AUTH_TOKEN` is set.

#### Scenario: Protected MCP
- **GIVEN** `MCP_AUTH_TOKEN` is configured
- **WHEN** a request reaches `/mcp` without the matching bearer header
- **THEN** the request is rejected with 401
- **AND** `/healthz`, `/api/files`, `/models/*` and `/` remain reachable

#### Scenario: Unprotected deployment
- **GIVEN** `MCP_AUTH_TOKEN` is unset or blank
- **WHEN** a client calls `/mcp`
- **THEN** the tool surface is available without an authorization header

### Requirement: OpenSCAD tool set
The server SHALL provide `openscad_validate`, `openscad_export_model`, `openscad_screenshot` and `openscad_analyze_model`, accepting either a workspace `path` or inline `scad`.

#### Scenario: Workspace source with siblings
- **GIVEN** a workspace SCAD file that includes or imports sibling files
- **WHEN** a tool is called with `path`
- **THEN** the source directory is staged beside the virtual main source
- **AND** relative includes and imports resolve inside the workspace

#### Scenario: Screenshot output
- **WHEN** `openscad_screenshot` is called with valid source
- **THEN** a PNG or WebP image is returned inline
- **AND** no file is written unless `outputPath` is supplied

### Requirement: Workspace safety
The server SHALL reject absolute paths, traversal, URL-like paths, null bytes, backslashes, symlink escapes and paths outside `WORKSPACE_DIR`.

#### Scenario: Traversal attempt
- **WHEN** a tool receives a path such as `../secret.scad`
- **THEN** the request fails with a validation error
- **AND** no file outside the workspace is read or written

#### Scenario: Symlink escape
- **GIVEN** a workspace path that resolves through a symlink outside the workspace
- **WHEN** the path is requested
- **THEN** it is rejected before the runner or filesystem write is called

### Requirement: Execution limits and cancellation
The server SHALL enforce input, output, timeout and concurrency limits, and SHALL terminate active work when the request is cancelled or disconnected.

#### Scenario: Render timeout
- **GIVEN** a render exceeding `MAX_RENDER_MS`
- **WHEN** the worker exceeds the deadline
- **THEN** the worker is terminated
- **AND** the tool returns a failed result instead of leaving the request pending

#### Scenario: Queued cancellation
- **GIVEN** `MAX_PARALLEL_JOBS` work permits are occupied
- **WHEN** a queued request is cancelled
- **THEN** it is removed from the queue and never starts

### Requirement: Browser and model routes
The server SHALL serve the built browser from `WEB_DIR`, a recursive workspace file index from `/api/files`, and read-only model assets from `/models/*`.

#### Scenario: File index
- **WHEN** `/api/files` is requested
- **THEN** the workspace tree is returned as nested directory and file entries
- **AND** excluded directories and symlinks are not exposed

#### Scenario: Model asset
- **GIVEN** an allowed file inside the workspace
- **WHEN** `/models/<path>` is requested
- **THEN** the file is served with `no-store`, `nosniff` and a sandbox CSP
- **AND** disallowed extensions and symlinked components are rejected

#### Scenario: Health
- **WHEN** `/healthz` is requested
- **THEN** it returns `{"ok":true,"name":"openscad"}` while the workspace is readable
- **AND** it returns 503 when the workspace is unavailable
