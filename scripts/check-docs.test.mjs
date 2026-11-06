import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkDocumentation } from './check-docs.mjs';

const spec = '# Example\n\n## Purpose\nA concrete capability contract for this validation fixture.\n\n## Requirements\n\n### Requirement: Valid result\nThe fixture SHALL produce a valid result.\n\n#### Scenario: Success\n- **WHEN** a request arrives\n- **THEN** the result is valid\n';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'openscad-docs-test-'));
  try {
    mkdirSync(join(root, 'openspec/specs/example'), { recursive: true });
    mkdirSync(join(root, 'openspec/changes/review'), { recursive: true });
    writeFileSync(join(root, 'openspec/specs/example/spec.md'), spec);
    writeFileSync(join(root, 'openspec/README.md'), '[Example](specs/example/spec.md#purpose)\n');
    writeFileSync(join(root, 'openspec/changes/review/proposal.md'), '# Review\n');
    writeFileSync(join(root, 'openspec/changes/review/tasks.md'), '- [ ] 1.1 Review result and record evidence\n');
    writeFileSync(join(root, 'openspec/changes/review/.openspec.yaml'), 'schema: spec-driven\nskip_specs: true\n');
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('valid spec and explicit no-delta change pass', () => fixture(root => {
  assert.deepEqual(checkDocumentation(root).failures, []);
}));

test('broken paths and anchors are reported', () => fixture(root => {
  writeFileSync(join(root, 'openspec/README.md'), '[Missing](missing.md)\n[Wrong](specs/example/spec.md#absent)\n');
  const failures = checkDocumentation(root).failures;
  assert.equal(failures.some(item => item.includes('missing link')), true);
  assert.equal(failures.some(item => item.includes('missing anchor')), true);
}));

test('every requirement needs its own valid scenario', () => fixture(root => {
  writeFileSync(join(root, 'openspec/specs/example/spec.md'), `${spec}\n### Requirement: Missing case\nThe fixture SHALL reject this.\n`);
  assert.equal(checkDocumentation(root).failures.some(item => item.includes('Missing case has no scenarios')), true);
}));

test('implicit no-delta change and unnumbered tasks fail', () => fixture(root => {
  writeFileSync(join(root, 'openspec/changes/review/.openspec.yaml'), 'schema: spec-driven\n');
  writeFileSync(join(root, 'openspec/changes/review/tasks.md'), '- [ ] Review result\n');
  const failures = checkDocumentation(root).failures;
  assert.equal(failures.some(item => item.includes('requires deltas')), true);
  assert.equal(failures.some(item => item.includes('unnumbered/invalid task')), true);
}));

test('REMOVED deltas do not invent new requirements or scenarios', () => fixture(root => {
  mkdirSync(join(root, 'openspec/changes/review/specs/example'), { recursive: true });
  writeFileSync(join(root, 'openspec/changes/review/.openspec.yaml'), 'schema: spec-driven\n');
  writeFileSync(join(root, 'openspec/changes/review/specs/example/spec.md'),
    '# Delta\n\n## REMOVED Requirements\n\n### Requirement: Valid result\nReason: capability retired.\n');
  assert.deepEqual(checkDocumentation(root).failures, []);
}));

test('a duplicate documentation tree fails', () => fixture(root => {
  mkdirSync(join(root, 'docs'));
  assert.equal(checkDocumentation(root).failures.some(item => item.includes('only documentation tree')), true);
}));

test('a planning alias fails', () => fixture(root => {
  rmSync(join(root, 'openspec'), { recursive: true });
  mkdirSync(join(root, 'docs'));
  symlinkSync('docs', join(root, 'openspec'));
  assert.deepEqual(checkDocumentation(root).failures, ['openspec must be a real directory, not an alias']);
}));

test('a missing planning directory fails clearly', () => fixture(root => {
  rmSync(join(root, 'openspec'), { recursive: true });
  assert.deepEqual(checkDocumentation(root).failures, ['missing openspec directory']);
}));
