import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMissingSummarySourceDispositionV1, classifyMissingSummarySourceV1 } from './missing-summary-source-disposition-v1.mjs';

test('classifies source refs without claiming source or revision authority', () => {
  assert.equal(classifyMissingSummarySourceV1('', false, 'MISSING'), 'MISSING_SOURCE_REFERENCE');
  assert.equal(classifyMissingSummarySourceV1('cluster:summary:0', false, 'MISSING'), 'NON_PATH_REFERENCE');
  assert.equal(classifyMissingSummarySourceV1('src/a.ts', true, 'FILE'), 'TRACKED_TEXT_CANDIDATE_UNQUALIFIED');
  assert.equal(classifyMissingSummarySourceV1('node_modules/a/index.js', false, 'FILE'), 'GENERATED_OR_CACHE_REVIEW');
  assert.equal(classifyMissingSummarySourceV1('archive/a.md', false, 'FILE'), 'ARCHIVE_REVIEW');
  assert.equal(classifyMissingSummarySourceV1('src/missing.ts', false, 'MISSING'), 'MISSING_ON_DISK');
});

test('requires the expected census shape and records its limitations', () => {
  assert.throws(() => buildMissingSummarySourceDispositionV1({}, new Set()), /RECEIPT_INVALID/);
  const result = buildMissingSummarySourceDispositionV1({
    schema: 'atlas.missing-packet-summaries.v1', generatedAt: 'snapshot', database: { database: 'legal_ai_db' },
    sources: [{ source_ref: 'scripts/atlas/missing-summary-source-disposition-v1.mjs', packet_count: 1, no_embedding_count: 0, packet_keys: ['packet:a'] }],
  }, new Set(['scripts/atlas/missing-summary-source-disposition-v1.mjs']));
  assert.equal(result.writesPerformed, false);
  assert.equal(result.fileContentsRead, false);
  assert.equal(result.sourceRevisionChecksPerformed, false);
  assert.equal(result.sources[0].disposition, 'TRACKED_TEXT_CANDIDATE_UNQUALIFIED');
});
