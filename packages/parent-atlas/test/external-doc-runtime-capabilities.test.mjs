import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExternalDocsHybridProofGate,
  deriveQdrantVersionCapabilities,
  qdrantExternalDocsCapabilityProfileSchema,
  semverAtLeast,
} from '../dist/core/external-doc-runtime-capabilities.js';

function profile(overrides = {}) {
  return qdrantExternalDocsCapabilityProfileSchema.parse({
    probed_at: '2026-08-19T21:00:00.000Z',
    qdrant_version: '1.18.3',
    qdrant_commit: 'abc123',
    supports_sparse_vectors: true,
    supports_idf_modifier: true,
    supports_hybrid_query_api: true,
    supports_named_vector_schema_update: true,
    supports_memory_tiers_v119: false,
    native_bm25_inference: 'UNPROBED',
    current_collection_exists: true,
    shadow_collection_exists: false,
    current_collection_vector_mode: 'UNNAMED_DENSE',
    shadow_collection_vector_mode: 'MISSING',
    producer_revision: 'test-r1',
    canonical_authority: false,
    ...overrides,
  });
}

test('semver comparison ignores v prefix and recognizes 1.19 memory tier boundary', () => {
  assert.equal(semverAtLeast('v1.19.0', '1.19.0'), true);
  assert.equal(semverAtLeast('1.18.3', '1.19.0'), false);
  assert.equal(deriveQdrantVersionCapabilities('1.18.3').supports_memory_tiers_v119, false);
  assert.equal(deriveQdrantVersionCapabilities('1.19.0').supports_memory_tiers_v119, true);
});

test('hybrid and IDF are version-qualified at the 1.10 boundary', () => {
  const before = deriveQdrantVersionCapabilities('1.9.9');
  const after = deriveQdrantVersionCapabilities('1.10.0');
  assert.equal(before.supports_sparse_vectors, true);
  assert.equal(before.supports_idf_modifier, false);
  assert.equal(before.supports_hybrid_query_api, false);
  assert.equal(after.supports_idf_modifier, true);
  assert.equal(after.supports_hybrid_query_api, true);
});

test('native BM25 must be probed before the production proof gate can become ready', () => {
  const blocked = buildExternalDocsHybridProofGate({
    gateId: 'g1',
    gateRevision: 'r1',
    profile: profile(),
  });
  assert.equal(blocked.status, 'BLOCKED');
  assert.deepEqual(blocked.blockers, ['NATIVE_BM25_UNPROBED']);

  const ready = buildExternalDocsHybridProofGate({
    gateId: 'g2',
    gateRevision: 'r1',
    profile: profile({ native_bm25_inference: 'SUPPORTED' }),
  });
  assert.equal(ready.status, 'READY');
  assert.deepEqual(ready.blockers, []);
});

test('unsupported sparse/IDF/query capabilities remain explicit blockers', () => {
  const gate = buildExternalDocsHybridProofGate({
    gateId: 'g3',
    gateRevision: 'r1',
    profile: profile({
      qdrant_version: '1.9.0',
      supports_idf_modifier: false,
      supports_hybrid_query_api: false,
      native_bm25_inference: 'UNSUPPORTED',
    }),
  });
  assert.equal(gate.status, 'BLOCKED');
  assert.deepEqual(gate.blockers, [
    'IDF_MODIFIER_UNAVAILABLE',
    'HYBRID_QUERY_API_UNAVAILABLE',
    'NATIVE_BM25_UNAVAILABLE',
  ]);
});
