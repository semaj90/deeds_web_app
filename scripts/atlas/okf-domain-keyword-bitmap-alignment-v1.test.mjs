import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/okf-domain-keyword-bitmap-alignment-v1.json');
const shadowCorpusPath = resolve(root, '.tmp/atlas/keyword-corpus-v1/keyword-corpus.jsonl');

test('OKF-DOMAIN-KEYWORD-BITMAP-ALIGNMENT shadow report and corpus verification', () => {
  assert.ok(existsSync(reportPath), 'report file must exist');
  assert.ok(existsSync(shadowCorpusPath), 'shadow keyword corpus jsonl must exist');

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));

  // Canonical authority & safety invariants
  assert.equal(report.canonicalAuthority, false);
  assert.equal(report.writesPerformed, false);

  // Core verdicts
  const expectedVerdicts = [
    'OKF_CORPUS_GROUNDED',
    'ONTOLOGY_CROSSWALK_REVIEWED',
    'KEYWORD_CORPUS_SHADOW_READY',
    'EMBEDDING_RECIPE_COMPATIBLE',
    'ORDINAL_MAP_SEALED',
    'DOMAIN_BITMAP_PARITY',
    'NES_LUT_MAPPING_PRESERVED',
    'HYBRID_TOPK_BASELINE',
    'WORKSPACE_ADMISSION_VERDICT',
    'LIVE_MASTRA_REFUSAL_VERDICT',
    'LANGFUSE_SERVER_SPAN_READBACK',
    'FIRST_FAILING_BOUNDARY',
  ];

  for (const key of expectedVerdicts) {
    assert.ok(report.verdicts[key], `verdict ${key} must be defined`);
  }

  assert.equal(report.verdicts.OKF_CORPUS_GROUNDED, 'PROVEN');
  assert.equal(report.verdicts.NES_LUT_MAPPING_PRESERVED, 'PROVEN');
  assert.equal(report.verdicts.FIRST_FAILING_BOUNDARY, 'WORKSPACE_AUTHORITY');

  // Postgres 18 inventory
  assert.equal(report.postgres18Inventory.keywordCorpusExists, false, 'keyword_corpus table must not exist in live database');
  assert.ok(report.postgres18Inventory.ginIndexCount > 200, 'PG18 GIN index count must be verified');

  // Ordinal map and domain bitmaps
  assert.ok(report.ordinalMap.totalEntries > 0);
  assert.match(report.ordinalMap.ordinalMapDigest, /^sha256:[a-f0-9]{64}$/);

  // NES LUT preservation
  assert.equal(report.nesLutPreservation.verified, true);
  assert.equal(report.nesLutPreservation.unresolvedByte, 0);

  // EmbeddingGemma 768 recipe
  assert.equal(report.embeddingRecipe.canonicalDimensions, 768);
  assert.equal(report.embeddingRecipe.distanceMetric, 'COSINE');
  assert.equal(report.embeddingRecipe.legacy384Retired, true);

  // Frozen query demonstration
  assert.ok(report.frozenQueryDemonstration.topK.length > 0);
  assert.ok(report.frozenQueryDemonstration.candidateConcepts.length > 0);
});
