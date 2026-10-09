import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObservationFeatureRegistryCensusV1,
  normalizeObservedFeatureToken,
} from './observation-feature-registry-census-v1.mjs';

test('maps observed producer labels to proposal-only normalized IDs', () => {
  const census = buildObservationFeatureRegistryCensusV1({
    schemaColumns: ['ast_observation_kinds'],
    observedValues: [{ producerField: 'ast_observation_kinds', value: 'FUNCTION_DECL', count: '4' }],
  });
  assert.equal(census.observations[0].candidate_feature_id, 'ast.function_decl');
  assert.equal(census.observations[0].family, 'AST_BINARY');
  assert.equal(census.observations[0].approval_state, 'REVIEW_REQUIRED');
  assert.equal(census.observations[0].lineage_qualified, false);
  assert.equal(census.registry_artifact_created, false);
  assert.equal(census.canonical_authority, false);
  assert.equal(census.persistent_store_writes_performed, false);
  assert.equal(census.scratch_artifact_written, true);
});

test('marks persisted mappings unavailable when their columns are absent', () => {
  const census = buildObservationFeatureRegistryCensusV1({ schemaColumns: ['feature_revision'] });
  assert.equal(census.source_map.find((entry) => entry.prefix === 'ast.').persisted_column_present, false);
  assert.equal(census.source_map.find((entry) => entry.prefix === 'context.authority').persisted_column_present, null);
});

test('normalizes labels with the compiler token policy', () => {
  assert.equal(normalizeObservedFeatureToken('  Function Declaration / V2  '), 'function_declaration_v2');
});
