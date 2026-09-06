import assert from 'node:assert/strict';
import { REPRESENTATION_KINDS, assertNoDuplicateActiveRepresentationsV1, buildRepresentationDescriptorV1, representationInvalidationKeyV1 } from './lib/representation-descriptor-v1.mjs';

assert.deepEqual(REPRESENTATION_KINDS, ['lexical', 'sparse', 'semantic', 'ast', 'nlp', 'ontology', 'graph', 'summary', 'lod', 'openspec_task']);
const input = { chunkId: 'chunk:one', sourceRevision: 'sha256:' + 'a'.repeat(64), kind: 'semantic', producerRevision: 'embeddinggemma:runtime:r1', dependencyRevisions: ['workspace:r1', 'source:r1'], projectionRefs: [{ system: 'qdrant', id: 'point:one' }, { system: 'valkey', id: 'key:one' }] };
const first = buildRepresentationDescriptorV1(input);
const second = buildRepresentationDescriptorV1({ ...input, dependencyRevisions: ['source:r1', 'workspace:r1'], projectionRefs: [...input.projectionRefs].reverse() });
assert.deepEqual(first, second);
assert.equal(first.canonicalAuthority, false);
assert.ok(first.projectionRefs.every((ref) => ref.canonicalAuthority === false));
assert.equal(representationInvalidationKeyV1(first), 'chunk:one:sha256:' + 'a'.repeat(64) + ':semantic:embeddinggemma:runtime:r1');
assert.throws(() => assertNoDuplicateActiveRepresentationsV1([first, second]), /REPRESENTATION_DUPLICATE_ACTIVE_OWNER/);
assertNoDuplicateActiveRepresentationsV1([first, { ...second, status: 'SUPERSEDED' }]);
assert.throws(() => buildRepresentationDescriptorV1({ ...input, kind: 'unknown' }), /REPRESENTATION_KIND_UNSUPPORTED/);
assert.throws(() => buildRepresentationDescriptorV1({ ...input, producerRevision: '' }), /REPRESENTATION_PRODUCERREVISION_REQUIRED/);

console.log(JSON.stringify({ schema: 'atlas.dir-index-03-representation-descriptor-proof.v1', status: 'DIR_REPRESENTATION_DESCRIPTOR_PASS', kindCount: REPRESENTATION_KINDS.length, idempotency: true, duplicateActiveRejection: true, projectionRefsNonCanonical: true, revisionScopedInvalidation: true, canonicalWrites: false, datastoreWrites: false, modelCalls: false }, null, 2));
