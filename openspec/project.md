# Project context

## Scope

`openscad_build` publishes one container image with an OpenSCAD MCP server and a browser UI. OpenSCAD runs through `openscad-wasm`; no native OpenSCAD binary is installed. The published package is `ghcr.io/miloszkolber/openscad`.

| Deliverable | Source | Artifact |
| --- | --- | --- |
| MCP runtime | `mcp/` | `/mcp` and stdio server inside the image |
| Browser UI | `web/` | Static browser bundle served at `/` |
| Image | `docker/openscad.Dockerfile` | `ghcr.io/miloszkolber/openscad:latest` and `sha-<commit>` |
| Deployment example | `compose/docker-compose.yaml`, `compose/.env.example` | Remote-image Compose template |
| Documentation and planning | `openspec/` | Contracts, history, backlog and maintenance state |

The runtime is a distroless `cc-debian12` image carrying Node 26 and `libatomic`, running as UID 1000. The browser and model routes are public on the HTTP port; `/mcp` optionally requires a bearer token. Exact dependency versions live in manifests, lockfiles, the Dockerfile and workflows, not a second inventory here. Mutable base tags and npm resolutions mean builds are **not bit-reproducible**.

## Goals and boundaries

- Publish one minimal image that serves both the MCP transport and the browser.
- Keep OpenSCAD execution behind `OpenScadRunner` and validate every user input.
- Keep the workspace the only model source and the only place exports are written.
- Keep configuration environment-driven and the repository host-neutral.
- Make future changes reviewable through requirements, scenarios and evidence.

The browser and model routes expose the mounted workspace. Treat the mount as a data boundary, not an authentication boundary. Host deployment, credentials, rollback digests and the weekly OpenChamber maintenance task belong to the host, outside this repository. Publication does not itself deploy.

## Owners

| Subject | Owner |
| --- | --- |
| Implemented behavior | `openspec/specs/<capability>/spec.md` alongside source |
| Proposed behavior, tasks and evidence | One scoped folder in `openspec/changes/` |
| Build, install and configuration commands | Root README plus `mcp/`, `web/` and `compose/` |
| Host deployment, credentials and recovery | Local deployment docs, outside this repository |
| Weekly dependency review | The OpenChamber maintenance task and `maintenance-state.md` |
| OpenSCAD WASM upstream | `openscad-wasm` and `suapapa/openscad-wasm-mcp`, not this build repository |

## Layout

```text
mcp/                              # MCP runtime, tools, tests and scripts
web/                              # React browser UI, webpack and tests
docker/openscad.Dockerfile        # multi-stage build, distroless runtime
compose/docker-compose.yaml       # published-image example
compose/.env.example              # deployment settings
openspec/                         # sole documentation and planning tree
scripts/check-docs.mjs            # local documentation structure check
.github/workflows/build.yml       # checks, image build, smoke, publication
.github/workflows/docs.yml        # OpenSpec and documentation validation
```

## Non-goals

- No GitHub Pages site, generated landing page or duplicate `docs/` tree.
- No native OpenSCAD binary, shell execution or raw CLI argument passthrough.
- No artifact store, job directory, preview token or cleanup service.
- No multi-architecture image until a tested build and smoke path exists.
- No host-specific values, credentials or deployment identities in this repository.
