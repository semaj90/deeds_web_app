#!/usr/bin/env node

/** Convert one read-only Atlas top-K ranking receipt into compiler input. */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
}
const input = path.resolve(root, args.get('input') ?? 'docs/reports/atlas-file-topk-ranking-v1.json');
const output = path.resolve(root, args.get('out') ?? 'docs/reports/atlas-reranker-retrieval-input-v1.jsonl');

const report = JSON.parse(await fs.readFile(input, 'utf8'));
if (report.schema !== 'atlas.embedding-ranking-diagnostic.v1') throw new Error('ATLAS_RERANKER_RANKING_RECEIPT_REQUIRED');
const candidates = (report.ranking?.candidates ?? []).map((row, index) => ({
  candidateOrdinal: index,
  packetKey: row.packetKey,
  sourceRef: row.sourceRef,
  sourceRevision: row.documentRevision,
  candidateSnapshotRevision: row.documentRevision,
  featureRevision: report.featureRevision ?? 'ranking-receipt-v1',
  candidateText: row.candidateText,
  retrievalRank: index,
  teacherScore: null,
  semanticScore: row.semanticScore,
  lexicalScore: row.lexicalScore,
  astMatch: row.astScore,
  identityQuality: row.integrityScore,
  evidenceFreshness: row.versionStatus === 'VERIFIED_METADATA_PRESENT' ? 1 : 0,
  evidenceKinds: row.integrityStatus === 'INTEGRITY_VERIFIED' ? ['SOURCE'] : ['DERIVED_SYNTHESIS'],
  isHardNegative: false,
}));
const envelope = {
  queryId: `ranking:${report.generatedAt ?? 'unknown'}`,
  queryRevision: `query:${report.generatedAt ?? 'unknown'}`,
  workspaceRevision: report.generatedAt ?? 'unknown',
  candidateSnapshotRevision: report.generatedAt ?? 'unknown',
  queryText: report.query ?? '',
  labelRevision: 'labels-unreviewed',
  candidates,
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(envelope)}\n`, 'utf8');
console.log(JSON.stringify({ schema: 'atlas.reranker-input-adapter-receipt.v1', input, output, candidateCount: candidates.length, readOnly: true, promotion: 'BLOCKED_UNTIL_LABELS' }, null, 2));

