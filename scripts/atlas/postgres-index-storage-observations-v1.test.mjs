import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStorageObservations, SEARCH_INPUT_COLUMNS, summarizeStorageObservations } from './postgres-index-storage-observations-v1.mjs';

const trigger = (overrides = {}) => ({
  function_name: 'compute_codebase_chunk_search_vector', enabled: 'O',
  on_update: true, on_insert: true, update_columns: [...SEARCH_INPUT_COLUMNS], ...overrides,
});

test('records exact search-input filter without claiming dependency or bloat proof', () => {
  const report = summarizeStorageObservations({ triggers: [trigger()], indexes: [], statistics: [{ n_live_tup: 0 }] });
  assert.equal(report.searchTrigger.status, 'SEARCH_INPUT_FILTER_OBSERVED');
  assert.equal(report.searchTrigger.functionDependencyReviewRequired, true);
  assert.equal(report.bloatAssessment, 'NOT_MEASURED');
  assert.equal(report.promotionEligible, false);
  assert.equal(report.databaseWrites, false);
});

test('broad duplicate trigger defeats narrowed-trigger observation', () => {
  const report = summarizeStorageObservations({ triggers: [trigger(), trigger({ update_columns: [] })] });
  assert.equal(report.searchTrigger.status, 'BROAD_UPDATE_TRIGGER_PRESENT');
});

test('disabled or incomplete filters do not pass', () => {
  for (const candidate of [trigger({ enabled: 'D' }), trigger({ update_columns: ['content'] }), trigger({ on_insert: false })]) {
    assert.equal(summarizeStorageObservations({ triggers: [candidate] }).searchTrigger.status, 'EXPECTED_FILTER_NOT_OBSERVED');
  }
});

test('GIN proof requires valid ready index and separates HNSW', () => {
  const report = summarizeStorageObservations({ columns: [{ column_name: 'search_vector', udt_name: 'tsvector' }], indexes: [
    { name: 'fts', method: 'gin', valid: true, ready: true, definition: 'CREATE INDEX fts ON public.codebase_chunk_index USING gin (search_vector)' },
    { name: 'invalid', method: 'gin', valid: false, ready: true, definition: 'USING gin (search_vector)' },
    { name: 'ann', method: 'hnsw', valid: true, ready: true },
  ] });
  assert.equal(report.searchVectorType, 'tsvector');
  assert.deepEqual(report.ftsGinIndexes, ['fts']);
  assert.deepEqual(report.hnswIndexes, ['ann']);
});

test('failed catalog query remains unproven rather than an empty successful audit', () => {
  const report = collectStorageObservations(() => { throw new Error('catalog unavailable'); });
  assert.equal(report.errors.length, 5);
  assert.equal(report.status, 'INCOMPLETE_OBSERVATIONS');
  assert.equal(report.searchTrigger.status, 'UNPROVEN_QUERY_FAILED');
});

test('invalid catalog envelope fails closed', () => {
  const report = collectStorageObservations(() => '{}');
  assert.equal(report.errors.length, 5);
  assert.equal(report.errors[0].message, 'EXPECTED_ROW_ARRAY');
});
