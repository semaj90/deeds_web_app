import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { parseTangInspiredShortlistReceiptV1 } from './document-governance-experiment-receipt-v1.mjs';

const { documentGovernanceRecordV1Schema } = await tsImport(
  '../../packages/parent-atlas/src/core/document-governance-record-v1.ts',
  import.meta.url,
);

const receipt = () => ({
  schema: 'atlas.candidate-shortlist-receipt.v1',
  generatedAt: '2026-08-27T17:40:43.310Z',
  readOnly: true,
  databaseWrites: false,
  canonicalAuthority: false,
  featureRevision: 'fixture-feature-r1',
  inputCount: 512,
  targetCount: 96,
  rank: 8,
  lowRank: { policy: 'TANG_INSPIRED_LOW_RANK_SHORTLIST', canonical_authority: false },
  exactSemantic: { metrics: { recallAt10: 0.3, recallAt24: 1 / 3, top24Overlap: 1 / 3, oracleNdcgAt24: 0.49 } },
  quality: { recallAt10: 0.3, recallAt24: 1 / 3, top24Overlap: 1 / 3, oracleNdcgAt24: 0.49, ndcgAt24: null },
  status: 'EXECUTED_UNPROVEN',
});

test('projects the receipt as historical, noncanonical experiment evidence with measured quality', () => {
  const projected = parseTangInspiredShortlistReceiptV1(JSON.stringify(receipt()));
  assert.equal(projected.receiptStatus, 'EXECUTED_UNPROVEN');
  assert.equal(projected.canonicalAuthority, false);
  assert.equal(projected.sourceChange, 'parent-atlas-neural-prefill-encoder');
  assert.equal(projected.quality.recallAt10, 0.3);
  assert.equal(projected.quality.ndcgAt24, null);
});

test('rejects any attempt to promote the challenger receipt as canonical', () => {
  assert.throws(() => parseTangInspiredShortlistReceiptV1(JSON.stringify({ ...receipt(), canonicalAuthority: true })), /CONTRACT_MISMATCH/);
  assert.throws(() => parseTangInspiredShortlistReceiptV1(JSON.stringify({ ...receipt(), lowRank: { ...receipt().lowRank, canonical_authority: true } })), /CONTRACT_MISMATCH/);
});

test('rejects wrong experiment policy, missing metrics, and malformed input', () => {
  assert.throws(() => parseTangInspiredShortlistReceiptV1(JSON.stringify({ ...receipt(), lowRank: { ...receipt().lowRank, policy: 'CANONICAL_RANKER' } })), /CONTRACT_MISMATCH/);
  assert.throws(() => parseTangInspiredShortlistReceiptV1(JSON.stringify({ ...receipt(), quality: { ...receipt().quality, recallAt10: 4 } })), /CONTRACT_MISMATCH/);
  assert.throws(() => parseTangInspiredShortlistReceiptV1('{'), /INVALID_JSON/);
});

test('document-governance schema forbids promoting an experiment record to canonical', () => {
  const experiment = parseTangInspiredShortlistReceiptV1(JSON.stringify(receipt()));
  const record = {
    schema: 'atlas.document-governance-record.v1',
    documentId: `doc:sha256:${'a'.repeat(64)}`,
    path: 'docs/reports/atlas-candidate-shortlist-receipt-v1.json',
    sha256: 'b'.repeat(64), bytes: 1, title: null,
    documentKind: 'REPORT', status: 'EXPERIMENTAL', topicIds: [], canonicalForTopics: [],
    topicOwnershipStatus: 'UNASSIGNED', instructionScope: null,
    supersedes: [], supersededBy: [], supersessionStatus: 'UNASSESSED', supersessionReason: null,
    openspec: { change: null, taskRefs: [], completedTasks: null, totalTasks: null, progressFraction: null },
    validation: { status: 'NOT_CHECKED', linksChecked: false, referencesChecked: false, smokePassed: false, testsPassed: false, contradictions: [], receiptRefs: [] },
    workflow: null, experiment,
    archive: { eligible: false, blockedReasons: ['NO_OPERATOR_ARCHIVE_AUTHORIZATION'], archivedPath: null },
  };
  assert.equal(documentGovernanceRecordV1Schema.safeParse(record).success, true);
  assert.equal(documentGovernanceRecordV1Schema.safeParse({ ...record, status: 'CANONICAL_CURRENT' }).success, false);
});
