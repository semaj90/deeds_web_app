import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAstEntityPrefillProfileV1 } from './ast-entity-prefill-profile-v1.mjs';

const profile = {
  schema: 'atlas.ast-entity-prefill-pipeline.v1',
  source: { table: 'atlas_packets', identity: ['packet_key', 'source_ref', 'feature_id', 'title_id', 'tree_node_id'], source_revision: 'graphify_packet_revision_pending' },
  extraction: { engine: 'ast-grep-napi', languages: ['typescript'], identity_status: 'candidate_only' },
  lexical: { authority: 'lexical_signal_only' },
  json: { authority: 'payload_acceleration_only' },
  nlp: { authority: 'semantic_entities_only' },
  embedding: { representation: 'semantic_768', normalization: 'L2_VECTOR', query_role: 'QUERY', document_role: 'DOCUMENT' },
  output: { format: 'ndjson', canonical_writes: false },
};

test('accepts the current AST entity prefill profile', () => {
  assert.deepEqual(validateAstEntityPrefillProfileV1(profile), []);
});

test('rejects non-candidate identity and canonical writes', () => {
  const invalid = structuredClone(profile);
  invalid.extraction.identity_status = 'canonical';
  invalid.output.canonical_writes = true;
  assert.deepEqual(validateAstEntityPrefillProfileV1(invalid), [
    'IDENTITY_STATUS_MUST_REMAIN_CANDIDATE_ONLY',
    'CANONICAL_WRITES_MUST_BE_DISABLED',
  ]);
});

test('rejects vector-dimension drift and missing source identity fields', () => {
  const invalid = structuredClone(profile);
  invalid.embedding.representation = 'hidden_4096';
  invalid.source.identity = ['source_ref'];
  assert.deepEqual(validateAstEntityPrefillProfileV1(invalid), [
    'SOURCE_IDENTITY_FIELDS_INCOMPLETE',
    'EMBEDDING_CONTRACT_MUST_REMAIN_SEMANTIC_768_L2_VECTOR',
  ]);
});

test('rejects a non-object configuration', () => {
  assert.deepEqual(validateAstEntityPrefillProfileV1([]), ['CONFIG_NOT_OBJECT']);
});
