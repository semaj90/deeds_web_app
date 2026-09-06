import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptSourceSelectionBindingV1,
  buildContentOwnedSourceArtifactV1,
  computeSourceArtifactInventoryChecksumV1,
  pathIsAdmittedByDirectoryInventoryPolicyV1,
  sortSourceArtifactsV1,
} from '../dist/core/source-artifact-v1.js';

const H_A = `sha256:${'a'.repeat(64)}`;
const H_B = `sha256:${'b'.repeat(64)}`;
const H_C = `sha256:${'c'.repeat(64)}`;

function existingArtifact(diagnosticMtime) {
  return adaptSourceSelectionBindingV1({
    binding: {
      sourceRef: 'repo://packages/parent-atlas/src/core/example.ts',
      codeSourceRevision: H_A,
      contentHash: H_B,
      byteLength: 12,
    },
    relativePath: 'packages\\parent-atlas\\src\\core\\example.ts',
    workspaceRevision: H_C,
    parserRevision: 'treesitter-contract:v1',
    producerRevision: 'directory-inventory:v1',
    language: 'typescript',
    diagnosticMtime,
  });
}

test('adapts the existing source-selection owner without changing its source revision', () => {
  const artifact = existingArtifact('2026-09-04T12:00:00.000Z');
  assert.equal(artifact.sourceRevision, H_A);
  assert.equal(artifact.contentHash, H_B);
  assert.equal(artifact.relativePath, 'packages/parent-atlas/src/core/example.ts');
  assert.equal(artifact.revisionAuthority, 'EXISTING_CANONICAL_OWNER');
});

test('content-owned document namespace derives sourceRevision only from immutable bytes', () => {
  const artifact = buildContentOwnedSourceArtifactV1({
    sourceRef: 'repo://docs/example.md',
    relativePath: './docs/example.md',
    bytes: new TextEncoder().encode('# Example\n'),
    workspaceRevision: H_C,
    parserRevision: 'markdown-section-parser:v1',
    producerRevision: 'directory-inventory:v1',
    diagnosticMtime: '2026-09-04T12:00:00.000Z',
  });
  assert.equal(artifact.sourceRevision, artifact.contentHash);
  assert.equal(artifact.revisionAuthority, 'CONTENT_SHA256');
  assert.equal(artifact.byteLength, 10);
});

test('mtime is diagnostic-only and cannot change inventory identity', () => {
  const first = existingArtifact('2026-09-04T12:00:00.000Z');
  const second = existingArtifact('2026-09-04T13:00:00.000Z');
  assert.equal(computeSourceArtifactInventoryChecksumV1([first]), computeSourceArtifactInventoryChecksumV1([second]));
});

test('inventory replay is deterministic regardless of input enumeration order', () => {
  const code = existingArtifact('2026-09-04T12:00:00.000Z');
  const doc = buildContentOwnedSourceArtifactV1({
    sourceRef: 'repo://docs/example.md',
    relativePath: 'docs/example.md',
    bytes: new TextEncoder().encode('# Example\n'),
    workspaceRevision: H_C,
    parserRevision: 'markdown-section-parser:v1',
    producerRevision: 'directory-inventory:v1',
  });

  const run1 = sortSourceArtifactsV1([code, doc]);
  const run2 = sortSourceArtifactsV1([doc, code]);
  assert.deepEqual(run1.map((x) => x.sourceRef), run2.map((x) => x.sourceRef));
  assert.equal(computeSourceArtifactInventoryChecksumV1(run1), computeSourceArtifactInventoryChecksumV1(run2));
});

test('default policy admits selected source/doc roots and rejects generated/vendor/model paths', () => {
  assert.equal(pathIsAdmittedByDirectoryInventoryPolicyV1('docs/architecture/example.md'), true);
  assert.equal(pathIsAdmittedByDirectoryInventoryPolicyV1('openspec/changes/example/tasks.md'), true);
  assert.equal(pathIsAdmittedByDirectoryInventoryPolicyV1('packages/parent-atlas/src/core/example.ts'), true);
  assert.equal(pathIsAdmittedByDirectoryInventoryPolicyV1('node_modules/example/index.js'), false);
  assert.equal(pathIsAdmittedByDirectoryInventoryPolicyV1('packages/parent-atlas/dist/core/example.js'), false);
  assert.equal(pathIsAdmittedByDirectoryInventoryPolicyV1('models/ornith/model.json'), false);
});

test('repository escape paths fail closed', () => {
  assert.throws(() => buildContentOwnedSourceArtifactV1({
    sourceRef: 'repo://escape',
    relativePath: '../outside.md',
    bytes: new Uint8Array(),
    workspaceRevision: H_C,
    parserRevision: 'markdown-section-parser:v1',
    producerRevision: 'directory-inventory:v1',
  }), /SOURCE_ARTIFACT_PATH_ESCAPES_REPOSITORY_ROOT/);
});
