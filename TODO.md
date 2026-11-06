# TODO Checklist

This checklist tracks remaining work after the browser merge. The project builds and tests with the mock runner; real WASM behavior is covered by the pinned `openscad-wasm` backend.

## Merged Browser

- [x] Serve the browser UI, file index, and read-only model files from the MCP HTTP server.
- [x] Support browsing SCAD files under `WORKSPACE_DIR` and pasting code without writing files.
- [x] Keep browser rendering and STL export client-side.
- [x] Verify the browser UI in MCP Chromium against a mounted model repository.
- [x] Recheck mounted sources, Customizer-to-STL dimensions, paste mode, rapid edits, relative includes and invalid-source recovery through the provided MCP Chromium. The optional direct-CDP runner is repaired but was not used.

## Agent Tools

- [x] Replace temporary preview links with an inline screenshot tool.
- [x] Remove preview tokens, viewer routes, artifact storage, job directories, and cleanup settings.
- [x] Export models and screenshots only to explicit workspace paths.
- [x] Support workspace `path` inputs with automatic staging of sibling files.
- [x] Confirm real-WASM screenshot output on the deployed service.
- [x] Confirm `3mf` failure behavior remains clearly reported.

## Documentation and Deployment

- [x] Rename the repository and image release process to `openscad_build`.
- [x] Publish `ghcr.io/miloszkolber/openscad-mcp` from a weekly, push and manual image workflow.
- [x] Add weekly Dependabot updates for npm, the Docker base image, and GitHub Actions.
- [x] Point the prebuilt Compose files and landing page at the new repository and published image.
- [x] Update README, AGENTS.md, development notes, and WASM integration notes.
- [x] Update Compose files and `.env.example`.
- [x] Update the landing page copy and translations for the merged browser and screenshot tool.
- [x] Update the host deployment to run one merged service instead of separate MCP and browser containers.
- [x] Remove the host cleanup script and cron entry.
- [x] Remove stale `.tmp` and artifact directories from the model repository.

## Deferred dependency upgrades

- [ ] Upgrade the web UI to React 19 with `@monaco-editor/react` 4.7.0 and coordinated React type packages.
- [ ] Migrate the Monaco editor imports for monaco-editor 0.57 package exports.
- [ ] Migrate `@gltf-transform/core` and `@gltf-transform/extensions` to 4.5 and resolve the typed-array boundary.
- [ ] Evaluate TypeScript 7 and Vitest 5 after their ecosystem peers catch up.

## Merge review

- [x] Restore input/output limits, source fidelity, and side-effect-free path rejection with regressions.
- [x] Check screenshot cancellation/concurrency and browser paste/export recovery.
- [x] Repair verification scripts and stale workflow/deployment references.
- [x] Rebuild and verify the assembled service: 77 tests, typecheck, lint, full build, real-WASM timeout/cancellation smoke, browser interaction checks and inline screenshots for both repository models. The optional CDP runner and full physical model verification suite were not run.
