# Release pipeline

## Purpose

Build, check and publish the OpenSCAD MCP and browser image, and keep the deployment example and dependency maintenance aligned with the published artifact.

Source: [docker/openscad.Dockerfile](../../../docker/openscad.Dockerfile), [.github/workflows/build.yml](../../../.github/workflows/build.yml), [compose/](../../../compose). Checks: workflow check job, image smoke test and published digest verification.

## Requirements

### Requirement: Checked image build
The workflow SHALL run `npm ci`, asset preparation, typecheck, lint, tests and the full build before building the image.

#### Scenario: Pull request
- **WHEN** a pull request changes build-relevant files
- **THEN** the check job runs
- **AND** the image is built and smoke-tested without publication

#### Scenario: Default-branch publication
- **WHEN** the check job succeeds on the default branch
- **THEN** exactly that tested image is published

### Requirement: Smoke-tested image
The image SHALL be tested after building and before publication.

#### Scenario: Container smoke
- **GIVEN** a built `linux/amd64` image
- **WHEN** it starts with a read-only root, no network and a tmpfs `/tmp`
- **THEN** `/healthz` returns `{"ok":true,"name":"openscad"}`
- **AND** MCP `tools/list` returns the OpenSCAD and workspace tools
- **AND** `/api/files` lists the mounted workspace
- **AND** workspace write, read and delete succeed
- **AND** `openscad_screenshot` returns a PNG

### Requirement: Distroless runtime
The runtime image SHALL contain Node 26 on a distroless base, run as UID 1000 and contain only production dependencies.

#### Scenario: Runtime contents
- **WHEN** the runtime image is inspected
- **THEN** it has no shell or package manager
- **AND** it carries the Node binary and `libatomic`
- **AND** it serves `/app/mcp/dist` and `/app/web/dist`
- **AND** it writes only to `/workspace` and `/tmp`

### Requirement: Published tags
A default-branch publication SHALL produce `ghcr.io/miloszkolber/openscad:latest` and `ghcr.io/miloszkolber/openscad:sha-<12>` for the same digest.

#### Scenario: Publication
- **WHEN** the tested image is published
- **THEN** both tags resolve to the tested digest
- **AND** the package is publicly pullable
- **AND** a later rebuild with unchanged inputs may reuse the same digest

### Requirement: Weekly and manual runs
The workflow SHALL run on a weekly schedule and on manual dispatch in addition to pushes and pull requests.

#### Scenario: Scheduled run
- **WHEN** the Monday 04:00 Europe/Warsaw schedule fires
- **THEN** the full check, build and publication path runs against the default branch

#### Scenario: Manual run
- **WHEN** an operator dispatches the workflow
- **THEN** it uses the selected branch and does not publish from a pull request ref

### Requirement: Dependency maintenance
Dependabot SHALL cover npm packages, the Docker base image and GitHub Actions weekly, and the repository SHALL keep deferred upgrades explicit.

#### Scenario: Routine update
- **WHEN** a compatible patch or minor update passes the same checks
- **THEN** it may be merged without a separate build-path change

#### Scenario: TypeScript split
- **WHEN** the dependency graph is resolved
- **THEN** `typescript7` provides TypeScript 7 for typecheck and MCP builds
- **AND** `typescript` stays on 6.x for ESLint and ts-loader while `typescript-eslint` lacks TypeScript 7 support

### Requirement: Deployment example
The Compose example SHALL pull the published image and expose the documented environment variables.

#### Scenario: Remote image
- **WHEN** `docker compose -f compose/docker-compose.yaml up -d` runs
- **THEN** it pulls `ghcr.io/miloszkolber/openscad:latest` unless `OPENSCAD_IMAGE` overrides it
- **AND** it mounts a writable workspace and uses a read-only root with a `/tmp` tmpfs
- **AND** its healthcheck uses the distroless Node path

### Requirement: Documentation validation
The documentation workflow SHALL validate OpenSpec structure, local links and the lightweight documentation contract checks for relevant changes.

#### Scenario: Documentation check
- **WHEN** `openspec/`, the root README, AGENTS.md, package READMEs or the documentation checker changes
- **THEN** `scripts/check-docs.mjs`, its tests and `openspec validate --all --strict` run
