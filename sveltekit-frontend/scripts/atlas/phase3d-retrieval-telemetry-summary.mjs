#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');

const OUT_JSON = path.join(APP_ROOT, 'docs', 'reports', 'retrieval-telemetry-summary.json');
const OUT_MD = path.join(APP_ROOT, 'docs', 'reports', 'retrieval-telemetry-summary.md');

const EXPECTED_COLUMNS = [
  'id',
  'created_at',
  'query',
  'query_hash',
  'latency_ms',
  'vector_hits',
  'trigram_hits',
  'fts_hits',
  'selected_packet_key',
  'selected_packet_keys',
  'selected_feature_id',
  'feature_ids',
  'fusion_score',
  'cache_hit',
  'surface',
  'environment',
  'retrieval_strategy',
];

function normalizeDbUrl(url) {
  if (!url) return null;
  return url.replace('@0.0.0.0:', '@127.0.0.1:');
}

async function queryPostgres(databaseUrl) {
  if (!databaseUrl) {
    return { status: 'ENV_MISSING', tableExists: false, columns: [], rows: 0, error: 'DATABASE_URL is not configured' };
  }

  let Client;
  try {
    ({ Client } = await import('pg'));
  } catch (err) {
    return { status: 'DRIVER_MISSING', tableExists: false, columns: [], rows: 0, error: String(err?.message ?? err) };
  }

  const client = new Client({ connectionString: normalizeDbUrl(databaseUrl) });
  try {
    await client.connect();
    const table = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'retrieval_telemetry'
      order by ordinal_position
    `);
    const columns = table.rows.map((row) => row.column_name);
    const tableExists = columns.length > 0;
    if (!tableExists) {
      return { status: 'TABLE_MISSING', tableExists, columns, rows: 0 };
    }

    const count = await client.query(`
      select
        count(*)::int as rows,
        count(*) filter (where retrieval_strategy = 'smoke' or environment like '%smoke%' or query like 'phase3d %smoke%')::int as smoke_rows,
        count(*) filter (where not (retrieval_strategy = 'smoke' or environment like '%smoke%' or query like 'phase3d %smoke%'))::int as real_rows
      from retrieval_telemetry
    `);
    const metrics = await client.query(`
      select
        count(*)::int as query_count,
        count(distinct query_hash)::int as unique_queries,
        avg(latency_ms)::float as mean_latency_ms,
        percentile_cont(0.5) within group (order by latency_ms)::float as p50_latency_ms,
        percentile_cont(0.95) within group (order by latency_ms)::float as p95_latency_ms,
        percentile_cont(0.99) within group (order by latency_ms)::float as p99_latency_ms,
        avg(case when cache_hit then 1 else 0 end)::float as cache_hit_ratio
      from retrieval_telemetry
    `);
    const bySurface = await client.query(`
      select surface, count(*)::int as rows
      from retrieval_telemetry
      group by surface
      order by rows desc, surface asc
      limit 20
    `);
    const byFeature = await client.query(`
      select selected_feature_id as feature_id, count(*)::int as rows
      from retrieval_telemetry
      where selected_feature_id is not null
      group by selected_feature_id
      order by rows desc, selected_feature_id asc
      limit 20
    `);
    const byStrategy = await client.query(`
      select retrieval_strategy, count(*)::int as rows
      from retrieval_telemetry
      group by retrieval_strategy
      order by rows desc, retrieval_strategy asc
      limit 20
    `);

    return {
      status: 'READY',
      tableExists,
      columns,
      rows: count.rows[0]?.rows ?? 0,
      smokeRows: count.rows[0]?.smoke_rows ?? 0,
      realRows: count.rows[0]?.real_rows ?? 0,
      metrics: metrics.rows[0] ?? {},
      bySurface: bySurface.rows,
      topFeatures: byFeature.rows,
      byStrategy: byStrategy.rows,
    };
  } catch (err) {
    return { status: 'SOURCE_UNAVAILABLE', tableExists: false, columns: [], rows: 0, error: String(err?.message ?? err) };
  } finally {
    try {
      await client.end();
    } catch {
      // Read-only audit; ignore close errors.
    }
  }
}

function classify(pg) {
  if (pg.status !== 'READY') return pg.status;
  const missingColumns = EXPECTED_COLUMNS.filter((column) => !pg.columns.includes(column));
  if (missingColumns.length) return 'COLUMN_MISMATCH';
  if (Number(pg.realRows ?? 0) < 1000) return 'COLLECTING';
  return 'BEHAVIORAL_TELEMETRY_READY';
}

function renderMarkdown(report) {
  const missingColumns = report.expectedColumns.filter((column) => !report.postgres.columns.includes(column));
  return [
    '# Phase 3D Retrieval Telemetry Summary',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Status',
    '',
    `- classification: ${report.classification}`,
    `- tableExists: ${report.postgres.tableExists}`,
    `- rows: ${report.postgres.rows}`,
    `- realRows: ${report.postgres.realRows}`,
    `- smokeRows: ${report.postgres.smokeRows}`,
    `- targetRows: ${report.targetRows}`,
    `- missingColumns: ${missingColumns.length ? missingColumns.join(', ') : 'none'}`,
    report.postgres.error ? `- note: ${report.postgres.error}` : null,
    '',
    '## Retrieval Surfaces',
    '',
    `- runtime/legal retrieval collection: ${report.qdrant.runtimeCollection}`,
    `- codebase/Atlas topology collection: ${report.qdrant.codebaseCollection}`,
    '- Phase 3D records behavior from retrieval calls; it does not patch Qdrant payloads or topology.',
    '- Production readiness topology checks continue to use the codebase/Atlas collection.',
    '',
    '## Metrics',
    '',
    `- queryCount: ${report.metrics.queryCount}`,
    `- realQueryCount: ${report.metrics.realQueryCount}`,
    `- smokeQueryCount: ${report.metrics.smokeQueryCount}`,
    `- uniqueQueries: ${report.metrics.uniqueQueries}`,
    `- meanLatencyMs: ${report.metrics.meanLatencyMs}`,
    `- p50LatencyMs: ${report.metrics.p50LatencyMs}`,
    `- p95LatencyMs: ${report.metrics.p95LatencyMs}`,
    `- p99LatencyMs: ${report.metrics.p99LatencyMs}`,
    `- cacheHitRatio: ${report.metrics.cacheHitRatio}`,
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((item) => `- ${item}`),
    '',
  ].filter((line) => line !== null).join('\n');
}

async function main() {
  loadAtlasEnv(APP_ROOT);
  const postgres = await queryPostgres(process.env.DATABASE_URL);
  const classification = classify(postgres);
  const metrics = postgres.metrics ?? {};
  const qdrant = {
    runtimeCollection: process.env.QDRANT_COLLECTION ?? 'legal_documents',
    codebaseCollection: process.env.CODEBASE_QDRANT_COLLECTION ?? 'codebase_chunks_768',
  };
  const report = {
    generatedAt: new Date().toISOString(),
    phase: '3D',
    name: 'retrieval-telemetry',
    classification,
    targetRows: 1000,
    qdrant,
    expectedColumns: EXPECTED_COLUMNS,
    postgres: {
      status: postgres.status,
      tableExists: postgres.tableExists,
      columns: postgres.columns,
      rows: postgres.rows,
      realRows: postgres.realRows ?? 0,
      smokeRows: postgres.smokeRows ?? 0,
      error: postgres.error ?? null,
    },
    metrics: {
      queryCount: Number(metrics.query_count ?? 0),
      realQueryCount: Number(postgres.realRows ?? 0),
      smokeQueryCount: Number(postgres.smokeRows ?? 0),
      uniqueQueries: Number(metrics.unique_queries ?? 0),
      meanLatencyMs: metrics.mean_latency_ms == null ? null : Number(Number(metrics.mean_latency_ms).toFixed(2)),
      p50LatencyMs: metrics.p50_latency_ms == null ? null : Number(Number(metrics.p50_latency_ms).toFixed(2)),
      p95LatencyMs: metrics.p95_latency_ms == null ? null : Number(Number(metrics.p95_latency_ms).toFixed(2)),
      p99LatencyMs: metrics.p99_latency_ms == null ? null : Number(Number(metrics.p99_latency_ms).toFixed(2)),
      cacheHitRatio: metrics.cache_hit_ratio == null ? null : Number(Number(metrics.cache_hit_ratio).toFixed(4)),
    },
    bySurface: postgres.bySurface ?? [],
    topFeatures: postgres.topFeatures ?? [],
    byStrategy: postgres.byStrategy ?? [],
    sourceDocs: [
      path.relative(APP_ROOT, path.join(REPO_ROOT, 'docs', 'reports', 'PHASE-3D-RETRIEVAL-TELEMETRY.md')),
      path.relative(APP_ROOT, path.join(REPO_ROOT, 'reports', 'parent-atlas-open-lanes-todo.md')),
    ],
    nextActions: classification === 'TABLE_MISSING'
      ? ['add retrieval_telemetry schema/migration contract', 'wire non-blocking recorder after schema exists']
      : classification === 'COLLECTING'
        ? ['continue collecting real retrieval records until realRows >= 1000', 'smoke rows only prove insertion and do not count toward behavioral temperature', 'do not automate cache policy from structural temperature alone']
        : classification === 'BEHAVIORAL_TELEMETRY_READY'
          ? ['run Phase 3E evaluation harness', 'derive behavioral temperature policy from telemetry']
          : ['resolve telemetry source availability or schema alignment before Phase 3G policy work'],
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    classification,
    rows: report.postgres.rows,
    realRows: report.postgres.realRows,
    smokeRows: report.postgres.smokeRows,
    reportJson: path.relative(APP_ROOT, OUT_JSON),
    reportMd: path.relative(APP_ROOT, OUT_MD),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
