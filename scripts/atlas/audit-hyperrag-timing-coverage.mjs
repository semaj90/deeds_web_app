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

const { rows: [metrics] } = await pool.query(`
  select
    count(*)::int as rows,
    count(distinct query_hash)::int as distinct_queries,
    count(*) filter (where qdrant_ms is not null)::int as qdrant_rows,
    count(*) filter (where coalesce(bm25_ms, pg_bm25_ms) is not null)::int as bm25_rows,
    count(*) filter (where redis_ms is not null)::int as redis_rows,
    count(*) filter (where neo4j_ms is not null)::int as neo4j_rows,
    count(*) filter (where rerank_ms is not null)::int as rerank_rows,
    count(*) filter (where total_ms is not null)::int as total_rows,
    count(*) filter (where cache_hit_source is not null)::int as cache_hit_rows,
    count(*) filter (where route is not null)::int as route_rows,
    count(*) filter (where result_count is not null)::int as result_count_rows,
    percentile_cont(0.5) within group (order by total_ms)::float as p50_total_ms,
    percentile_cont(0.95) within group (order by total_ms)::float as p95_total_ms,
    percentile_cont(0.5) within group (order by qdrant_ms)::float as p50_qdrant_ms,
    percentile_cont(0.95) within group (order by qdrant_ms)::float as p95_qdrant_ms
  from atlas_retrieval_eval_times
`);
await pool.end();

const total = Number(metrics.rows ?? 0);
const coverage = {};
for (const field of ['qdrant', 'bm25', 'redis', 'neo4j', 'rerank', 'total', 'route', 'result_count']) {
  const count = Number(metrics[`${field}_rows`] ?? 0);
  coverage[field] = {
    count,
    pct: total ? Number(((count / total) * 100).toFixed(2)) : 0,
  };
}

const requiredFields = ['qdrant', 'bm25', 'redis', 'neo4j', 'rerank', 'total'];
const failingFields = requiredFields.filter((field) => coverage[field].pct < 95);
const report = {
  generatedAt: new Date().toISOString(),
  status: total >= 50 && failingFields.length === 0 ? 'READY' : 'PARTIAL',
  rows: total,
  distinctQueries: Number(metrics.distinct_queries ?? 0),
  cacheHitRows: Number(metrics.cache_hit_rows ?? 0),
  coverage,
  latency: {
    p50TotalMs: Number(metrics.p50_total_ms ?? 0),
    p95TotalMs: Number(metrics.p95_total_ms ?? 0),
    p50QdrantMs: Number(metrics.p50_qdrant_ms ?? 0),
    p95QdrantMs: Number(metrics.p95_qdrant_ms ?? 0),
  },
  failingFields,
  contract: {
    oneRowPerQueryWriter: 'hyperrag-packet-rpc recordQueryEvalTimes',
    behavioralTelemetryWriter: 'retrieval-recorder retrieval_telemetry',
    fusionTimingStorage: 'payload/fusion trace; no new scalar column required',
  },
};

const reportDir = resolve('docs/reports');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, 'hyperrag-timing-coverage-audit.json'), JSON.stringify(report, null, 2));
writeFileSync(resolve(reportDir, 'hyperrag-timing-coverage-audit.md'), `# HyperRAG Timing Coverage Audit

- Generated: ${report.generatedAt}
- Status: ${report.status}
- Rows: ${report.rows}
- Distinct query hashes: ${report.distinctQueries}
- Cache-hit rows: ${report.cacheHitRows}
- p50 total: ${report.latency.p50TotalMs} ms
- p95 total: ${report.latency.p95TotalMs} ms

## Field Coverage

${Object.entries(coverage).map(([field, value]) => `- ${field}: ${value.count}/${total} (${value.pct}%)`).join('\n')}

The packet RPC owns one detailed eval row per query. The generic recorder still
owns behavioral telemetry in \`retrieval_telemetry\`.
`);

console.log(JSON.stringify(report, null, 2));
