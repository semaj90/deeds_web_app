import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRepresentationDescriptorV1,
  registerRepresentationDescriptorsV1,
  representationLogicalKeyV1,
  representationRegistryChecksumV1,
} from '../dist/core/representation-descriptor-v1.js';

const chunk = {
  schema: 'atlas.canonical-chunk.v1',
  descriptorId: 'chunk-desc:fixture',
  namespace: 'OPENSPEC',
  sourceRef: 'openspec/changes/example/tasks.md',
  sourceRevision: 'sha256:' + '1'.repeat(64),
  workspaceRevision: 'sha256:' + '2'.repeat(64),
  startByte: 0,
  endByte: 42,
  textChecksum: 'sha256:' + '3'.repeat(64),
  chunkerRevision: 'markdown-byte-sections:test:v1',
  identityAuthority: 'SOURCE_GROUNDED_DESCRIPTOR',
  headingPath: ['Tasks'],
};

function descriptor(overrides = {}) {
  return buildRepresentationDescriptorV1({
    chunk,
    kind: 'LEXICAL_FTS',
    representationRevision: 'postgres-fts:test:v1',
    producerId: 'postgres-fts-owner',
    producerRevision: 'producer:test:v1',
    checksum: 'sha256:' + '4'.repeat(64),
    projectionRefs: [{
      projectionKind: 'POSTGRES',
      locator: 'codebase_chunk_index:fixture',
      projectionRevision: 'projection:test:v1',
      canonicalAuthority: false,
    }],
    ...overrides,
  });
}

test('descriptor binds source-grounded chunk and mandatory revision dependencies', () => {
  const value = descriptor();
  assert.equal(value.chunkDescriptorId, chunk.descriptorId);
  assert.equal(value.sourceRevision, chunk.sourceRevision);
  assert.equal(value.workspaceRevision, chunk.workspaceRevision);
  assert.equal(value.canonicalAuthority, false);
  assert.deepEqual(value.dependencies.map((d) => d.dependencyKind), [
    'CHUNKER_REVISION', 'PRODUCER_REVISION', 'SOURCE_REVISION', 'WORKSPACE_REVISION',
  ]);
});

test('projection references remain explicitly noncanonical', () => {
  const value = descriptor();
  assert.equal(value.projectionRefs.length, 1);
  assert.equal(value.projectionRefs[0].canonicalAuthority, false);
});

test('logical idempotency ignores projection storage as identity', () => {
  const a = descriptor();
  const b = descriptor({ projectionRefs: [] });
  assert.equal(representationLogicalKeyV1(a), representationLogicalKeyV1(b));
  assert.notEqual(a.descriptorId, b.descriptorId);
});

test('identical replay collapses to one logical registry entry', () => {
  const a = descriptor();
  const registry = registerRepresentationDescriptorsV1([a, a]);
  assert.equal(registry.size, 1);
});

test('same logical owner with different output fails closed', () => {
  const a = descriptor();
  const b = descriptor({ checksum: 'sha256:' + '5'.repeat(64) });
  assert.throws(() => registerRepresentationDescriptorsV1([a, b]), /REPRESENTATION_LOGICAL_OWNER_CONFLICT/);
});

test('dependency and projection input order does not change descriptor identity', () => {
  const deps = [
    { dependencyKind: 'MODEL_REVISION', dependencyId: 'embedding-model', revision: 'model:v1' },
    { dependencyKind: 'POLICY_REVISION', dependencyId: 'semantic-policy', revision: 'policy:v1' },
  ];
  const refs = [
    { projectionKind: 'QDRANT', locator: 'codebase_chunks_768:p1', canonicalAuthority: false },
    { projectionKind: 'ARTIFACT', locator: 'semantic-artifact:r1', canonicalAuthority: false },
  ];
  const a = descriptor({ kind: 'SEMANTIC_768', dependencies: deps, projectionRefs: refs });
  const b = descriptor({ kind: 'SEMANTIC_768', dependencies: [...deps].reverse(), projectionRefs: [...refs].reverse() });
  assert.equal(a.descriptorId, b.descriptorId);
  assert.deepEqual(a, b);
});

test('registry checksum is deterministic across enumeration order', () => {
  const lexical = descriptor();
  const semantic = descriptor({
    kind: 'SEMANTIC_768',
    representationRevision: 'semantic_768:test:v1',
    producerId: 'semantic-owner',
    producerRevision: 'semantic-producer:test:v1',
    checksum: 'sha256:' + '6'.repeat(64),
    projectionRefs: [],
  });
  assert.equal(
    representationRegistryChecksumV1([lexical, semantic]),
    representationRegistryChecksumV1([semantic, lexical]),
  );
});
