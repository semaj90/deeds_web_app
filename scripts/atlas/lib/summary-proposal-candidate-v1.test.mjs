import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryProposalV1, selectStratifiedCandidates, validateSummaryOutput } from './summary-proposal-candidate-v1.mjs';

const row = (overrides = {}) => ({
  sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace',
  workspaceId: 'deeds-web-app', chunkId: 'chunk-a', canonicalChunkId: 'canonical-a', chunkRowId: 'row-a', physicalChunkRowId: 'row-a',
  chunkContentHash: 'sha256:chunk', bindingChecksum: 'sha256:binding', revisionStatus: 'PROVEN', content: 'export const answer = 42;', chunkSummaryText: null, legacySummaryColumn: null, ...overrides,
});

test('selection fails closed on missing identity, revision, and oversized input', () => {
  const result = selectStratifiedCandidates([
    row(), row({ sourceRef: 'src/revision-missing.ts', sourceRevision: null, canonicalChunkId: 'revision-missing' }), row({ canonicalChunkId: null, chunkContentHash: 'sha256:no-id' }), row({ sourceRef: 'src/large.ts', canonicalChunkId: 'large', content: 'x'.repeat(40), chunkContentHash: 'sha256:large' }),
  ], 10, 32);
  assert.equal(result.eligibleCount, 1);
  assert.equal(result.selected.length, 1);
  assert.equal(result.excludedByReason.LINEAGE_UNQUALIFIED, 1);
  assert.equal(result.excludedByReason.CHUNK_IDENTITY_MISSING, 1);
  assert.equal(result.excludedByReason.INPUT_TOO_LARGE, 1);
});

test('selection quarantines duplicate canonical identities with conflicting text', () => {
  const result = selectStratifiedCandidates([row(), row({ chunkRowId: 'row-b', physicalChunkRowId: 'row-b', content: 'different', chunkContentHash: 'sha256:different' })], 10, 1000);
  assert.equal(result.eligibleCount, 0);
  assert.equal(result.excludedByReason.CONFLICTING_CHUNK_TEXT, 2);
});

test('legacy summary/signature content is never mistaken for canonical summary text', () => {
  const result = selectStratifiedCandidates([
    row({ legacySummaryColumn: 'legacy signature value' }),
    row({ sourceRef: 'src/b.ts', canonicalChunkId: 'chunk-b', chunkId: 'chunk-b', chunkRowId: 'row-b', physicalChunkRowId: 'row-b', chunkSummaryText: 'admitted summary already exists' }),
  ], 4, 1000);
  assert.equal(result.eligibleCount, 0);
  assert.equal(result.excludedByReason.LEGACY_SUMMARY_COLUMN_POPULATED, 1);
  assert.equal(result.excludedByReason.ALREADY_SUMMARIZED, 1);
});

test('legacy summaries can be retained only as comparison hints for regenerated proposals', () => {
  const result = selectStratifiedCandidates([row({ legacySummaryColumn: 'A legacy hint summary with enough descriptive text.', legacyComparisonEligible: true })], 1, 1000, { allowLegacyForComparison: true });
  assert.equal(result.eligibleCount, 1);
  assert.equal(result.selected[0].legacySummaryColumn.startsWith('A legacy hint'), true);
});

test('comparison mode alone cannot bypass legacy-summary exclusion', () => {
  const result = selectStratifiedCandidates([row({ legacySummaryColumn: 'A legacy hint summary with enough descriptive text.' })], 1, 1000, { allowLegacyForComparison: true });
  assert.equal(result.eligibleCount, 0);
  assert.equal(result.excludedByReason.LEGACY_SUMMARY_COLUMN_POPULATED, 1);
});

test('selection is deterministic and spreads over file extensions', () => {
  const rows = [row(), row({ sourceRef: 'src/b.md', chunkId: 'b', canonicalChunkId: 'b', chunkRowId: 'rb', physicalChunkRowId: 'rb' }), row({ sourceRef: 'src/c.py', chunkId: 'c', canonicalChunkId: 'c', chunkRowId: 'rc', physicalChunkRowId: 'rc' }), row({ sourceRef: 'src/d.ts', chunkId: 'd', canonicalChunkId: 'd', chunkRowId: 'rd', physicalChunkRowId: 'rd' })];
  const a = selectStratifiedCandidates(rows, 3, 1000).selected.map((x) => x.canonicalChunkId);
  const b = selectStratifiedCandidates(rows, 3, 1000).selected.map((x) => x.canonicalChunkId);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 3);
  assert.equal(new Set(a.map((id) => rows.find((x) => x.canonicalChunkId === id).sourceRef.split('.').pop())).size, 3);
});

test('summary validation rejects empty/degenerate output and accepts source-faithful prose', () => {
  assert.equal(validateSummaryOutput('', 'source'), 'EMPTY_GENERATION');
  assert.equal(validateSummaryOutput('Summary.', 'source'), 'DEGENERATE_SUMMARY');
  assert.equal(validateSummaryOutput('export const answer = 42;', 'export const answer = 42;'), 'DEGENERATE_SUMMARY');
  assert.equal(validateSummaryOutput('Defines the answer constant as the integer 42.', 'export const answer = 42;'), null);
});

test('proposal binds checksums and leaves unknown model/generation metadata null', () => {
  const proposal = buildSummaryProposalV1({ row: { ...row(), inputTextSha256: 'sha256:text', inputByteLength: 24 }, sourceIdentityKey: 'deeds-web-app:src/a.ts', summary: 'A concise summary for this source.', model: { id: 'ornith-1.5-9b' }, promptRevision: 'sha256:prompt', schemaRevision: 'atlas.chunk-summary-proposal.v1', generationParameters: null, runtimeBuildRevision: 'build-a', latencyMs: 100, usage: null });
  assert.equal(proposal.modelRevision, null);
  assert.equal(proposal.generationParameters, null);
  assert.equal(proposal.lineageState, 'REVISION_QUALIFIED');
  assert.equal(proposal.canonicalAuthority, false);
  assert.equal(proposal.summarySha256.length, 64);
  assert.match(proposal.proposalChecksum, /^sha256:[a-f0-9]{64}$/);
  assert.equal(buildSummaryProposalV1({ row: { ...row(), inputTextSha256: 'sha256:text', inputByteLength: 24 }, sourceIdentityKey: 'deeds-web-app:src/a.ts', summary: 'A concise summary for this source.', model: { id: 'ornith-1.5-9b' }, promptRevision: 'sha256:prompt', schemaRevision: 'atlas.chunk-summary-proposal.v1', generationParameters: null, runtimeBuildRevision: 'build-a', latencyMs: 100, usage: null }).proposalChecksum, proposal.proposalChecksum);
});
