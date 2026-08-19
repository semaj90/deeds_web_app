import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultRetrievalExecutorPolicy,
  retrievalExecutorPolicySchema,
  retrievalIndexGenerationReceiptSchema,
} from '../dist/index.js';

const H = (c) => c.repeat(64);

test('default executor policy keeps BM25 lexical ownership and one semantic vote', () => {
  const policy = defaultRetrievalExecutorPolicy('retrieval-policy-r1');
  assert.equal(policy.lexical_owner, 'QDRANT_BM25');
  assert.equal(policy.semantic_exact_oracle, 'CUVS_BRUTE_FORCE');
  assert.equal(policy.semantic_lane_votes, 1);
  assert.equal(policy.valkey_cache.role, 'HOT_RETRIEVAL_CACHE');
  assert.equal(policy.valkey_cache.vector_dimension, 64);
  assert.equal(policy.hnsw_interop.require_cpu_hierarchy_for_generic_hnswlib_compatibility, true);
  assert.equal(policy.hnsw_interop.serialization_is_experimental, true);
});

test('semantic executor vote inflation fails closed', () => {
  const policy = defaultRetrievalExecutorPolicy('retrieval-policy-r1');
  const cagra = policy.executors.find((executor) => executor.executor === 'CUVS_CAGRA');
  assert.throws(() => retrievalExecutorPolicySchema.parse({
    ...policy,
    executors: policy.executors.map((executor) => executor === cagra ? { ...executor, semantic_lane_vote: 1 } : executor),
  }));
});

test('verified approximate indexes require exact-oracle evidence', () => {
  assert.throws(() => retrievalIndexGenerationReceiptSchema.parse({
    receipt_id: 'cagra-r1',
    executor: 'CUVS_CAGRA',
    source_snapshot_revision: 'source-r1',
    semantic_snapshot_revision: 'semantic-r1',
    row_identity_checksum: H('1'),
    index_generation: 'cagra-generation-r1',
    build_parameters: { graph_degree: 64 },
    source_vector_count: 100,
    source_dimension: 768,
    index_checksum: H('2'),
    exact_oracle_receipt_id: null,
    recall_at_k: 0.99,
    status: 'VERIFIED',
    producer_revision: 'test-r1',
  }));
});
