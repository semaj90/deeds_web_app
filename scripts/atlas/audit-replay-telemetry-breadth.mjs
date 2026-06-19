#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv(resolve('.'));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 1,
  connectionTimeoutMillis: 3000,
  statement_timeout: 10000,
});

const { rows } = await pool.query(`
  select
    id,
    created_at,
    query,
    query_hash,
    latency_ms,
    vector_hits,
    trigram_hits,
    fts_hits,
    selected_packet_keys,
    feature_ids,
    fusion_score,
    cache_hit,
    surface,
    environment,
    retrieval_strategy
  from retrieval_telemetry
  order by created_at desc, id desc
  limit 1000
`);
await pool.end();

const goldenQueries = new Set([
  'qdrant vector retrieval fusion RRF',
  'neo4j graph community authority score',
  'atlas packet metadata topology community_id',
  'redis valkey exact match cache hyperrag',
  'postgres BM25 full text search retrieval',
  'SOM cluster som_x som_y centroid',
  'drizzle schema migration retrieval eval times',
  'sveltekit route server API endpoint',
  'embeddings 768 dimension codebase chunks',
  'legal document case notes schema',
].map((query) => query.toLowerCase()));

const categoryRules = {
  cache_hit: (row) => row.cache_hit === true,
  fusion: (row) => row.retrieval_strategy === 'fusion',
  lexical_only: (row) => row.retrieval_strategy === 'lexical_only',
  vector_only: (row) => row.retrieval_strategy === 'vector_only',
  cold_path: (row) => /cold/i.test(String(row.retrieval_strategy ?? '')),
  low_density: (row) => {
    const aggregateHits = Number(row.vector_hits ?? 0) +
      Number(row.trigram_hits ?? 0) +
      Number(row.fts_hits ?? 0);
    const selectedPackets = Array.isArray(row.selected_packet_keys)
      ? row.selected_packet_keys.length
      : 0;
    return aggregateHits <= 2 || selectedPackets <= 1;
  },
  kanban: (row) => /\b(kanban|recommendation|task registry|open lane|todo)\b/i.test(String(row.query ?? '')),
  graph: (row) => /\b(neo4j|graph|gds|multi[- ]?hop|topology)\b/i.test(String(row.query ?? '')),
  golden: (row) => goldenQueries.has(String(row.query ?? '').trim().toLowerCase()) ||
    /\b(golden|regression|benchmark fixture)\b/i.test(String(row.query ?? '')) ||
    /golden/i.test(String(row.environment ?? '')),
};

const categoryCounts = Object.fromEntries(
  Object.entries(categoryRules).map(([name, predicate]) => [
    name,
    rows.filter(predicate).length,
  ])
);
const queryCounts = new Map();
for (const row of rows) {
  const key = String(row.query_hash || row.query || '').trim();
  if (key) queryCounts.set(key, (queryCounts.get(key) ?? 0) + 1);
}
const duplicateQueryRows = [...queryCounts.values()].reduce(
  (total, count) => total + Math.max(0, count - 1),
  0
);
const requiredScenarios = ['cache_hit', 'fusion', 'lexical_only', 'vector_only', 'cold_path', 'low_density', 'kanban', 'graph', 'golden'];
const missingScenarios = requiredScenarios.filter((name) => categoryCounts[name] === 0);
const report = {
  generatedAt: new Date().toISOString(),
  status: rows.length >= 50 && missingScenarios.length === 0
    ? 'READY'
    : rows.length >= 50
      ? 'VOLUME_READY_SCENARIOS_OPEN'
      : 'COLLECTING',
  totalRows: rows.length,
  distinctQueries: queryCounts.size,
  duplicateQueryRows,
  oneRowPerQueryPct: rows.length
    ? Number((((rows.length - duplicateQueryRows) / rows.length) * 100).toFixed(2))
    : 0,
  categoryCounts,
  missingScenarios,
  rules: {
    oneRowPerQuery: 'Duplicate query hashes are reported, not deleted.',
    graph: 'Classified from query text because the current table has no graph_hits column.',
    golden: 'Recognizes the canonical retrieval E2E benchmark query set or an explicit golden marker.',
  },
};

const reportDir = resolve('docs/reports');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, 'replay-telemetry-breadth-audit.json'), JSON.stringify(report, null, 2));
writeFileSync(resolve(reportDir, 'replay-telemetry-breadth-audit.md'), `# Replay Telemetry Breadth Audit

- Generated: ${report.generatedAt}
- Status: ${report.status}
- Rows: ${report.totalRows}
- Distinct queries: ${report.distinctQueries}
- Duplicate query rows: ${report.duplicateQueryRows}
- One-row-per-query ratio: ${report.oneRowPerQueryPct}%

## Scenario Counts

${Object.entries(categoryCounts).map(([name, count]) => `- ${name}: ${count}`).join('\n')}

## Missing Scenarios

${missingScenarios.length ? missingScenarios.map((name) => `- ${name}`).join('\n') : '- none'}

This audit is read-only. It does not delete duplicate rows or synthesize missing
scenarios.
`);

console.log(JSON.stringify(report, null, 2));
