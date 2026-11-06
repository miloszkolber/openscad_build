# Browser UI

## Purpose

Provide a browser workspace for reading SCAD sources, adjusting Customizer properties, rendering models in WebAssembly and exporting STL without writing temporary files to the server.

Source: [web/src](../../../web/src), [web/tests](../../../web/tests). Checks: typecheck, webpack build and the optional CDP browser check.

## Requirements

### Requirement: Read-only workspace browsing
The browser SHALL list allowed SCAD and model assets recursively from the mounted workspace and SHALL present mounted sources as read-only.

#### Scenario: Select a mounted source
- **GIVEN** a workspace containing SCAD and model files
- **WHEN** the browser loads `/`
- **THEN** the files appear in the file list
- **AND** selecting one opens its source in a read-only editor

#### Scenario: Relative assets
- **GIVEN** a SCAD source that includes or imports a sibling file
- **WHEN** the source is rendered in the browser
- **THEN** the sibling asset is read from the mounted workspace

### Requirement: Client-side rendering and export
The browser SHALL render OpenSCAD in client-side WebAssembly and SHALL export STL in the browser without a server render request.

#### Scenario: Model selection
- **WHEN** a valid SCAD source is selected
- **THEN** the viewer renders the model
- **AND** the export control becomes enabled after rendering completes

#### Scenario: STL export
- **WHEN** the user exports the current model
- **THEN** a binary STL is produced in the browser
- **AND** its dimensions match the rendered Customizer values

### Requirement: Paste mode is memory-only
The browser SHALL provide a paste editor whose source is never written to the workspace.

#### Scenario: Paste and render
- **WHEN** the user opens `Paste code` and enters SCAD
- **THEN** the editor becomes writable and the model renders from memory
- **AND** a later `/api/files` request does not list a pasted file

### Requirement: Customizer properties
The browser SHALL expose declared Customizer parameters and re-render or re-export with their current values.

#### Scenario: Numeric parameter
- **GIVEN** a source with a `// [1:1:50]` parameter
- **WHEN** the value changes from 18 to 21
- **THEN** the preview updates to the new value
- **AND** the exported STL reflects the new dimension

### Requirement: Checksum-pinned assets
The browser build SHALL download and verify the OpenSCAD WebAssembly engine and bundled fonts by SHA-256 before building.

#### Scenario: Asset preparation
- **WHEN** `npm run prepare:assets` runs
- **THEN** the engine and font archives match their recorded checksums
- **AND** a mismatch fails the build instead of serving an unverified engine
