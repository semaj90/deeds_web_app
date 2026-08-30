#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const inputPath = path.resolve(root, '.tmp/atlas/golden-relevance-review-pool-v1.ndjson');
const outputPath = path.resolve(root, '.tmp/atlas/golden-relevance-review-pool-bound-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/golden-review-query-id-binding-v1.json');
const databaseUrl = process.env.ATLAS_DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const rows = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const result = await pool.query(
    `SELECT id::text AS id, query FROM evaluation_queries WHERE query = ANY($1) AND domain = 'golden_review_pending'`,
    [rows.map((row) => row.queryText)],
  );
  const byText = new Map(result.rows.map((row) => [row.query, row.id]));
  const bound = rows.map((row) => ({
    ...row,
    evaluationQueryId: byText.get(row.queryText) ?? null,
  }));
  const unresolved = bound.filter((row) => !row.evaluationQueryId).length;
  const serialized = bound.map((row) => JSON.stringify(row)).join('\n') + (bound.length ? '\n' : '');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized, 'utf8');
  const report = {
    schema: 'atlas.golden-review-query-id-binding-v1',
    status: unresolved === 0 ? 'QUERY_IDS_BOUND' : 'QUERY_IDS_INCOMPLETE',
    canonicalAuthority: false,
    inputPath: path.relative(root, inputPath),
    outputPath: path.relative(root, outputPath),
    plannedQueries: rows.length,
    matchingQueryIds: bound.length - unresolved,
    unresolvedQueryIds: unresolved,
    judgmentRowsInserted: 0,
    databaseWrites: false,
    outputChecksum: `sha256:${(await import('node:crypto')).createHash('sha256').update(serialized).digest('hex')}`,
    nextRequiredStep: unresolved === 0 ? 'Fill and independently validate judgments; do not import proxy hints.' : 'Resolve missing evaluation query IDs before review import.',
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
} finally {
  await pool.end();
}
