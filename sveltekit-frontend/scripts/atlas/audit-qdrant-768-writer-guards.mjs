#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'sveltekit-frontend/scripts/atlas/backfill-qdrant-768-v2-uuid.mjs',
  'sveltekit-frontend/scripts/atlas/backfill-qdrant-768-keyset.mjs',
  'sveltekit-frontend/scripts/atlas/atlas-qdrant-projection-worker.mjs',
];
const reportPath = process.env.ATLAS_QDRANT_768_WRITER_GUARD_REPORT ?? 'docs/reports/qdrant-768-writer-guard-audit.json';
const checks = [];

for (const relativePath of files) {
  const source = readFileSync(path.resolve(root, relativePath), 'utf8');
  const guard = relativePath.endsWith('atlas-qdrant-projection-worker.mjs')
    ? source.indexOf('if (!row.content_hash)')
    : source.indexOf('!row.relative_path || !row.content_hash || !row.chunk_id');
  const pointConstruction = source.indexOf('const qdrantPointId =', guard);
  const emptyBatch = source.indexOf('if (points.length === 0)', pointConstruction);
  const cursorAdvance = source.indexOf('continue;', emptyBatch);
  const workerContract = relativePath.endsWith('atlas-qdrant-projection-worker.mjs')
    ? source.includes("'codebase_chunks_768_v2'") && source.includes("'atlas-qdrant-768-v2'") && source.includes('embedding_dimension: 768')
    : true;
  const passed = relativePath.endsWith('atlas-qdrant-projection-worker.mjs')
    ? guard >= 0 && workerContract
    : guard >= 0 && pointConstruction > guard && emptyBatch > pointConstruction && cursorAdvance > emptyBatch;
  checks.push({ relativePath, passed, guardBeforePointConstruction: relativePath.endsWith('atlas-qdrant-projection-worker.mjs') ? null : pointConstruction > guard, rejectedBatchAdvances: relativePath.endsWith('atlas-qdrant-projection-worker.mjs') ? null : cursorAdvance > emptyBatch, workerContract });
}

const report = {
  schema: 'atlas.qdrant-768-writer-guard-audit.v1',
  status: checks.every((check) => check.passed) ? 'PROVEN_STATIC_GUARDS' : 'FAILED_STATIC_GUARDS',
  readOnly: true,
  canonicalWrites: false,
  checks,
};
writeFileSync(path.resolve(root, reportPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (report.status !== 'PROVEN_STATIC_GUARDS') process.exitCode = 1;
