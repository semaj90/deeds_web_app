#!/usr/bin/env node
/**
 * scripts/atlas/report-route-runtime-packets.mjs
 *
 * Report-only observability surface for route_runtime_packets.
 *
 * Usage:
 *   node scripts/atlas/report-route-runtime-packets.mjs
 *   node scripts/atlas/report-route-runtime-packets.mjs --limit=50
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const LIMIT = Number(args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? process.env.npm_config_limit ?? 25);
const JSON_OUT = path.join(ROOT, 'docs', 'reports', 'route-runtime-packets-report.json');
const MD_OUT = path.join(ROOT, 'docs', 'reports', 'route-runtime-packets-report.md');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function env() {
  return {
    ...loadEnvFile(path.join(ROOT, '.env')),
    ...loadEnvFile(path.join(ROOT, '.env.local')),
    ...loadEnvFile(path.join(ROOT, 'sveltekit-frontend', '.env')),
    ...loadEnvFile(path.join(ROOT, 'sveltekit-frontend', '.env.local')),
    ...process.env,
  };
}

function databaseUrl(e) {
  return (
    e.DATABASE_URL ||
    `postgresql://${e.DB_USER || 'legal_admin'}:${e.DB_PASSWORD || '123456'}@${e.DB_HOST || '127.0.0.1'}:${e.DB_PORT || '5434'}/${e.DB_NAME || 'legal_ai_db'}`
  );
}

function redisUrl(e) {
  const raw = e.REDIS_URL || '';
  if (/^redis(s)?:\/\//.test(raw)) return raw;
  const host = e.REDIS_HOST || (raw.includes(':') ? raw.split(':')[0] : '127.0.0.1');
  const port = Number(e.REDIS_PORT || (raw.includes(':') ? raw.split(':')[1] : 6379));
  return `redis://${host}:${port}`;
}

async function queryList(pool, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((Number(numerator) / Number(denominator)) * 100).toFixed(1));
}

async function redisLod0Probe(e, packetIds) {
  const out = {
    checked: packetIds.length,
    found: 0,
    missing: 0,
    available: false,
    error: null,
  };
  if (packetIds.length === 0) return out;

  const redis = new Redis(redisUrl(e), {
    password: e.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const keys = packetIds.map((id) => `ace:telemetry:${id}:lod0`);
    const exists = await redis.mget(keys);
    out.available = true;
    out.found = exists.filter(Boolean).length;
    out.missing = keys.length - out.found;
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  } finally {
    try {
      if (redis.status !== 'end') await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
  return out;
}

function table(rows, headers) {
  if (!rows.length) return '_No rows._\n';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`);
  return [head, sep, ...body].join('\n') + '\n';
}

function markdown(report) {
  const m = [];
  m.push('# Route Runtime Packets Report');
  m.push('');
  m.push(`Generated: ${report.generated_at}`);
  m.push('');
  m.push('## Summary');
  m.push('');
  m.push(`- Total packets: ${report.summary.total}`);
  m.push(`- Last 24h: ${report.summary.last24h}`);
  m.push(`- Cache hit rate: ${report.summary.cache_hit_pct}%`);
  m.push(`- Average Qdrant hits: ${report.summary.avg_qdrant_hits}`);
  m.push(`- Average latency ms: ${report.summary.avg_latency_ms}`);
  m.push(`- Empty sourceRefs: ${report.summary.empty_source_refs}`);
  m.push(`- Empty featureIds: ${report.summary.empty_feature_ids}`);
  m.push(`- Missing SOM/cluster: ${report.summary.empty_som_cluster}`);
  m.push(`- Low context density rows: ${report.summary.low_context_density}`);
  m.push(`- Redis LOD0 found: ${report.redis_lod0.found}/${report.redis_lod0.checked}${report.redis_lod0.error ? ` (${report.redis_lod0.error})` : ''}`);
  m.push('');
  m.push('## Top SourceRefs');
  m.push('');
  m.push(table(report.top_source_refs, ['source_ref', 'hits']));
  m.push('## Top Features');
  m.push('');
  m.push(table(report.top_features, ['feature_id', 'hits']));
  m.push('## Top Redis Hot Keys');
  m.push('');
  m.push(table(report.top_redis_hot_keys, ['redis_hot_key', 'hits']));
  m.push('## Top SOM Clusters');
  m.push('');
  m.push(table(report.top_som_clusters, ['som_cluster', 'hits']));
  m.push('## Cache Tiers');
  m.push('');
  m.push(table(report.cache_tiers, ['cache_tier', 'hits']));
  m.push('## Recent Low-Density Packets');
  m.push('');
  m.push(table(report.recent_low_density, ['id', 'query_preview', 'source_ref_count', 'qdrant_hits', 'cache_tier']));
  m.push('');
  m.push('## Notes');
  m.push('');
  m.push('- `route_runtime_packets` is JSONB audit telemetry. It is not a GPU/matmul lane.');
  m.push('- Redis `ace:telemetry:{packet_id}:lod0` is the compact replay packet checked here.');
  m.push('- Neo4j traversal depth is not stored directly in `route_runtime_packets`; use replay smoke for traversal proof or add a later derived replay report.');
  return m.join('\n');
}

async function main() {
  const e = env();
  const pool = new pg.Pool({ connectionString: databaseUrl(e) });
  try {
    const [summary] = await queryList(pool, `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE captured_at >= now() - interval '24 hours')::int AS last24h,
        COUNT(*) FILTER (WHERE cache_hit IS TRUE)::int AS cache_hits,
        ROUND(COALESCE(AVG(qdrant_hits), 0)::numeric, 2)::float AS avg_qdrant_hits,
        ROUND(COALESCE(AVG(latency_ms), 0)::numeric, 2)::float AS avg_latency_ms,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(source_refs), 0) = 0)::int AS empty_source_refs,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(feature_ids), 0) = 0)::int AS empty_feature_ids,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(som_cluster, ''), NULLIF(cluster_id, '')) IS NULL)::int AS empty_som_cluster,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(source_refs), 0) < 8 AND COALESCE(qdrant_hits, 0) > 0)::int AS low_context_density
      FROM route_runtime_packets
    `);

    const topSourceRefs = await queryList(pool, `
      SELECT ref.value AS source_ref, COUNT(*)::int AS hits
      FROM route_runtime_packets r, LATERAL jsonb_array_elements_text(r.source_refs) ref(value)
      WHERE ref.value <> ''
      GROUP BY ref.value
      ORDER BY hits DESC, source_ref
      LIMIT $1
    `, [LIMIT]);

    const topFeatures = await queryList(pool, `
      SELECT feature.value AS feature_id, COUNT(*)::int AS hits
      FROM route_runtime_packets r, LATERAL jsonb_array_elements_text(r.feature_ids) feature(value)
      WHERE feature.value <> ''
      GROUP BY feature.value
      ORDER BY hits DESC, feature_id
      LIMIT $1
    `, [LIMIT]);

    const topRedisHotKeys = await queryList(pool, `
      SELECT key.value AS redis_hot_key, COUNT(*)::int AS hits
      FROM route_runtime_packets r, LATERAL jsonb_array_elements_text(r.redis_hot_keys) key(value)
      WHERE key.value <> ''
      GROUP BY key.value
      ORDER BY hits DESC, redis_hot_key
      LIMIT $1
    `, [LIMIT]);

    const topSomClusters = await queryList(pool, `
      SELECT COALESCE(NULLIF(som_cluster, ''), NULLIF(cluster_id, ''), 'missing') AS som_cluster, COUNT(*)::int AS hits
      FROM route_runtime_packets
      GROUP BY 1
      ORDER BY hits DESC, som_cluster
      LIMIT $1
    `, [LIMIT]);

    const cacheTiers = await queryList(pool, `
      SELECT COALESCE(NULLIF(cache_tier, ''), 'missing') AS cache_tier, COUNT(*)::int AS hits
      FROM route_runtime_packets
      GROUP BY 1
      ORDER BY hits DESC, cache_tier
    `);

    const recentLowDensity = await queryList(pool, `
      SELECT
        id::text,
        left(COALESCE(query_preview, ''), 80) AS query_preview,
        COALESCE(jsonb_array_length(source_refs), 0)::int AS source_ref_count,
        COALESCE(qdrant_hits, 0)::int AS qdrant_hits,
        COALESCE(NULLIF(cache_tier, ''), 'missing') AS cache_tier
      FROM route_runtime_packets
      WHERE COALESCE(jsonb_array_length(source_refs), 0) < 8
        AND COALESCE(qdrant_hits, 0) > 0
      ORDER BY captured_at DESC
      LIMIT $1
    `, [LIMIT]);

    const latestIds = await queryList(pool, `
      SELECT id::text
      FROM route_runtime_packets
      ORDER BY captured_at DESC
      LIMIT $1
    `, [Math.min(LIMIT, 50)]);

    const redisLod0 = await redisLod0Probe(e, latestIds.map((row) => row.id));

    const report = {
      generated_at: new Date().toISOString(),
      limit: LIMIT,
      summary: {
        ...summary,
        cache_hit_pct: percent(summary.cache_hits, summary.total),
      },
      redis_lod0: redisLod0,
      top_source_refs: topSourceRefs,
      top_features: topFeatures,
      top_redis_hot_keys: topRedisHotKeys,
      top_som_clusters: topSomClusters,
      cache_tiers: cacheTiers,
      recent_low_density: recentLowDensity,
    };

    await fsp.mkdir(path.dirname(JSON_OUT), { recursive: true });
    await fsp.writeFile(JSON_OUT, JSON.stringify(report, null, 2), 'utf8');
    await fsp.writeFile(MD_OUT, markdown(report), 'utf8');

    console.log('Route runtime packet report written:');
    console.log(`  ${JSON_OUT}`);
    console.log(`  ${MD_OUT}`);
    console.log(`Total packets: ${report.summary.total}`);
    console.log(`Cache hit rate: ${report.summary.cache_hit_pct}%`);
    console.log(`Redis LOD0: ${report.redis_lod0.found}/${report.redis_lod0.checked}`);
    console.log(`Low-density rows: ${report.summary.low_context_density}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
