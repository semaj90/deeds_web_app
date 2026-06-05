#!/usr/bin/env node
/**
 * Read-only report for the compressed semantic geometry retrieval contract.
 *
 * It does not mutate Postgres, Qdrant, Redis, or files outside docs/reports.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = REPO_ROOT || path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const LIMIT = Number(args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? process.env.npm_config_limit ?? 25);
const JSON_OUT = path.join(ROOT, 'docs', 'reports', 'compressed-semantic-geometry-report.json');
const MD_OUT = path.join(ROOT, 'docs', 'reports', 'compressed-semantic-geometry-report.md');

function env() {
  return loadRepoEnv(process.env);
}

function qdrantUrl(e) {
  const raw = e.QDRANT_URL || e.PUBLIC_QDRANT_URL || '';
  if (/^https?:\/\//.test(raw)) return raw.replace(/\/$/, '');
  const host = e.QDRANT_HOST || '127.0.0.1';
  const port = e.QDRANT_PORT || '6333';
  return `http://${host}:${port}`;
}

async function queryOne(pool, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? {};
}

async function queryList(pool, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

function pct(n, d) {
  if (!Number(d)) return 0;
  return Number(((Number(n) / Number(d)) * 100).toFixed(1));
}

function asNumberMap(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
}

async function fetchQdrantCollection(e) {
  const base = qdrantUrl(e);
  const headers = e.QDRANT_API_KEY ? { 'api-key': e.QDRANT_API_KEY } : {};
  try {
    const res = await fetch(`${base}/collections/codebase_chunks_768`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const body = await res.json();
    const result = body.result ?? {};
    const config = result.config ?? {};
    const params = config.params ?? {};
    const quantizationConfig =
      config.quantization_config ??
      config.quantizationConfig ??
      params.quantization_config ??
      params.quantizationConfig ??
      null;
    return {
      available: true,
      url: base,
      collection: 'codebase_chunks_768',
      status: result.status ?? null,
      pointsCount: Number(result.points_count ?? result.vectors_count ?? 0),
      indexedVectorsCount: Number(result.indexed_vectors_count ?? 0),
      vectorsConfig: params.vectors ?? config.vectors ?? null,
      optimizerConfig: config.optimizer_config ?? config.optimizers_config ?? null,
      hnswConfig: config.hnsw_config ?? config.hnswConfig ?? null,
      quantizationConfig,
      quantizationDetected: Boolean(quantizationConfig),
    };
  } catch (err) {
    return {
      available: false,
      url: base,
      collection: 'codebase_chunks_768',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function classifyOversampling(row) {
  const sourceRefs = Number(row.source_ref_count ?? 0);
  const featureIds = Number(row.feature_id_count ?? 0);
  const qdrantHits = Number(row.qdrant_hits ?? 0);
  const cacheHit = row.cache_hit === true || row.cache_hit === 't';
  if (cacheHit && sourceRefs >= 8) return 'low';
  if (sourceRefs === 0 || featureIds === 0) return 'high';
  if (sourceRefs < 4 && qdrantHits > 0) return 'high';
  if (sourceRefs < 8 || qdrantHits < 4) return 'medium';
  return 'low';
}

function markdown(report) {
  const m = [];
  m.push('# Compressed Semantic Geometry Report');
  m.push('');
  m.push(`Generated: ${report.generated_at}`);
  m.push('');
  m.push('## Contract');
  m.push('');
  m.push('```txt');
  m.push('filters first');
  m.push('  -> approximate ANN / compressed semantic search');
  m.push('  -> dynamic oversampling when needed');
  m.push('  -> optional exact rescore on bounded candidates');
  m.push('  -> graph expansion');
  m.push('  -> NES/CHROM packet assembly');
  m.push('```');
  m.push('');
  m.push('## Summary');
  m.push('');
  m.push(`- Qdrant available: ${report.qdrant.available}`);
  m.push(`- Qdrant points: ${report.qdrant.pointsCount ?? 'n/a'}`);
  m.push(`- Qdrant quantization config detected: ${report.qdrant.quantizationDetected ?? false}`);
  m.push(`- Runtime packets: ${report.runtime.total}`);
  m.push(`- Runtime packets with sourceRefs: ${report.runtime.with_source_refs} (${pct(report.runtime.with_source_refs, report.runtime.total)}%)`);
  m.push(`- Runtime packets with featureIds: ${report.runtime.with_feature_ids} (${pct(report.runtime.with_feature_ids, report.runtime.total)}%)`);
  m.push(`- Runtime packets with Qdrant hits: ${report.runtime.with_qdrant_hits} (${pct(report.runtime.with_qdrant_hits, report.runtime.total)}%)`);
  m.push(`- Runtime packets with Redis hot keys: ${report.runtime.with_redis_hot_keys} (${pct(report.runtime.with_redis_hot_keys, report.runtime.total)}%)`);
  m.push(`- Low-context-density packets: ${report.runtime.low_context_density}`);
  m.push(`- Exact-rescore telemetry fields present: ${report.telemetry.exact_rescore_fields_present}`);
  m.push('');
  m.push('## Suggested Oversampling Buckets');
  m.push('');
  m.push(`- Low: ${report.oversampling.low}`);
  m.push(`- Medium: ${report.oversampling.medium}`);
  m.push(`- High: ${report.oversampling.high}`);
  m.push('');
  m.push('## Qdrant Signals');
  m.push('');
  m.push('```json');
  m.push(JSON.stringify({
    status: report.qdrant.status,
    pointsCount: report.qdrant.pointsCount,
    indexedVectorsCount: report.qdrant.indexedVectorsCount,
    quantizationConfig: report.qdrant.quantizationConfig,
    hnswConfig: report.qdrant.hnswConfig,
    optimizerConfig: report.qdrant.optimizerConfig,
  }, null, 2));
  m.push('```');
  m.push('');
  m.push('## Recent Candidate Policy Sample');
  m.push('');
  if (!report.recent_policy_sample.length) {
    m.push('_No route runtime packet samples._');
  } else {
    m.push('| packet_id | sourceRefs | featureIds | qdrantHits | cacheHit | suggestedOversampling |');
    m.push('|---|---:|---:|---:|---|---|');
    for (const row of report.recent_policy_sample) {
      m.push(`| ${row.id} | ${row.source_ref_count} | ${row.feature_id_count} | ${row.qdrant_hits} | ${row.cache_hit} | ${row.suggested_oversampling} |`);
    }
  }
  m.push('');
  m.push('## Notes');
  m.push('');
  m.push('- This report is read-only and does not update Qdrant collection settings.');
  m.push('- A missing Qdrant quantization config is not a failure by itself. It only means the collection is not proving the PQ/scalar compression part through config introspection.');
  m.push('- Exact rescore must remain bounded to the approximate candidate set and must preserve `sourceRef`, `feature_id`, and packet provenance.');
  m.push('- `route_runtime_packets` remains JSONB telemetry. It is not a matmul or GPU lane.');
  return `${m.join('\n')}\n`;
}

async function main() {
  const e = env();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(e) });
  try {
    const qdrant = await fetchQdrantCollection(e);
    const runtime = asNumberMap(await queryOne(pool, `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(source_refs), 0) > 0) AS with_source_refs,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(feature_ids), 0) > 0) AS with_feature_ids,
        COUNT(*) FILTER (WHERE COALESCE(qdrant_hits, 0) > 0) AS with_qdrant_hits,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(redis_hot_keys), 0) > 0) AS with_redis_hot_keys,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(source_refs), 0) < 8 AND COALESCE(qdrant_hits, 0) > 0) AS low_context_density
      FROM route_runtime_packets
    `));

    const columns = await queryList(pool, `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'route_runtime_packets'
        AND column_name IN ('rescore_mode', 'rescore_strategy', 'oversampling', 'oversampling_factor')
      ORDER BY column_name
    `);

    const samples = await queryList(pool, `
      SELECT
        id::text,
        COALESCE(jsonb_array_length(source_refs), 0)::int AS source_ref_count,
        COALESCE(jsonb_array_length(feature_ids), 0)::int AS feature_id_count,
        COALESCE(qdrant_hits, 0)::int AS qdrant_hits,
        COALESCE(cache_hit, false) AS cache_hit
      FROM route_runtime_packets
      ORDER BY captured_at DESC
      LIMIT $1
    `, [LIMIT]);

    const recentPolicySample = samples.map((row) => ({
      ...row,
      suggested_oversampling: classifyOversampling(row),
    }));

    const oversampling = recentPolicySample.reduce((acc, row) => {
      acc[row.suggested_oversampling] = (acc[row.suggested_oversampling] ?? 0) + 1;
      return acc;
    }, { low: 0, medium: 0, high: 0 });

    const report = {
      schema: 'compressed_semantic_geometry_report.v1',
      generated_at: new Date().toISOString(),
      limit: LIMIT,
      qdrant,
      runtime,
      telemetry: {
        exact_rescore_fields_present: columns.length > 0,
        fields: columns.map((row) => row.column_name),
      },
      oversampling,
      recent_policy_sample: recentPolicySample,
    };

    await fsp.mkdir(path.dirname(JSON_OUT), { recursive: true });
    await fsp.writeFile(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
    await fsp.writeFile(MD_OUT, markdown(report), 'utf8');

    console.log('Compressed semantic geometry report written:');
    console.log(`  ${JSON_OUT}`);
    console.log(`  ${MD_OUT}`);
    console.log(`Qdrant available: ${qdrant.available}`);
    console.log(`Quantization config detected: ${qdrant.quantizationDetected ?? false}`);
    console.log(`Runtime packets: ${runtime.total}`);
    console.log(`Oversampling buckets: low=${oversampling.low}, medium=${oversampling.medium}, high=${oversampling.high}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[compressed-semantic-geometry] fatal:', err);
  process.exit(1);
});
