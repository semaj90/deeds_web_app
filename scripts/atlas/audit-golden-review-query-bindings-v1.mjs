#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const queuePath = path.resolve(root, '.tmp/atlas/golden-relevance-review-pool-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/golden-review-query-binding-audit-v1.json');
const databaseUrl = process.env.ATLAS_DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

if (!fs.existsSync(queuePath)) throw new Error(`Missing review pool: ${queuePath}`);
const queue = fs.readFileSync(queuePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query('SELECT id::text AS id, query, domain FROM evaluation_queries ORDER BY id');
  const byQuery = new Map(result.rows.map((row) => [row.query, row]));
  const bindings = queue.map((item) => {
    const exact = byQuery.get(item.queryText);
    return {
      queryPacketKey: item.queryPacketKey,
      querySourceRef: item.querySourceRef,
      evaluationQueryId: exact?.id ?? null,
      matchMethod: exact ? 'EXACT_QUERY_TEXT' : 'UNRESOLVED',
      domain: exact?.domain ?? null,
    };
  });
  const report = {
    schema: 'atlas.golden-review-query-binding-audit-v1',
    status: bindings.every((binding) => binding.evaluationQueryId) ? 'BINDINGS_COMPLETE' : 'BINDINGS_INCOMPLETE',
    canonicalAuthority: false,
    queuePath: path.relative(root, queuePath),
    queueQueryCount: queue.length,
    evaluationQueryCount: result.rowCount,
    exactTextBindings: bindings.filter((binding) => binding.evaluationQueryId).length,
    unresolvedBindings: bindings.filter((binding) => !binding.evaluationQueryId).length,
    bindings,
    databaseWrites: false,
    importAllowed: false,
    nextRequiredStep: 'Create a reviewed evaluation_queries record or an explicitly approved external binding; never infer IDs from packet keys.',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, bindings: undefined }));
} finally {
  await pool.end();
}
