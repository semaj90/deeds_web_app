#!/usr/bin/env node
/**
 * CPU-first Parent Atlas retrieval readiness proof.
 *
 * This verifies the correctness-first path:
 *   Postgres packet truth + JSONB/FTS indexes + Qdrant named-vector mirror
 *   + RRF scorer + Redis hot cache surface.
 *
 * GPU/TensorRT/cuVS lanes are intentionally reported as later acceleration.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);

const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'cpu-first-packet-retrieval-readiness.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'cpu-first-packet-retrieval-readiness.md');

const REQUIRED_COLUMNS = [
  'packet_id',
  'packet_key',
  'source_ref',
  'source_ref_key',
  'feature_id',
  'feature_label',
  'summary',
  'metadata',
  'payload',
  'embedding',
  'qdrant_point_id',
  'qdrant_collection',
  'pagerank',
  'redis_centroid_key',
];

const REQUIRED_INDEX_HINTS = [
  { key: 'source_ref', pattern: /source_ref/i },
  { key: 'feature_id', pattern: /feature_id/i },
  { key: 'source_feature', pattern: /source_ref.*feature_id|feature_id.*source_ref/i },
  { key: 'qdrant_point_id', pattern: /qdrant_point_id/i },
  { key: 'metadata_gin', pattern: /metadata.*gin/i },
  { key: 'payload_gin', pattern: /payload.*gin/i },
  { key: 'fts', pattern: /to_tsvector|fts/i },
];

function pct(part, total) {
  return total ? Number(((Number(part) / Number(total)) * 100).toFixed(2)) : 0;
}

function existsFile(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

async function qdrantProof() {
  const qdrantUrl = String(env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');
  const collection = String(env.QDRANT_CODE_COLLECTION || 'codebase_chunks_768');
  try {
    const info = await fetchJson(`${qdrantUrl}/collections/${collection}`);
    const vectors = info?.result?.config?.params?.vectors;
    const content = vectors?.content;
    return {
      status: content?.size === 768 ? 'LIVE_PASS' : 'WARN',
      url: qdrantUrl,
      collection,
      points: info?.result?.points_count ?? null,
      indexed_vectors: info?.result?.indexed_vectors_count ?? null,
      named_vectors: vectors ? Object.keys(vectors) : [],
      content_vector_dim: content?.size ?? null,
    };
  } catch (error) {
    return {
      status: 'FAIL',
      url: qdrantUrl,
      collection,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function redisProof() {
  const patterns = ['bifrost:*', 'bifrost:sem:packet:*', 'bifrost:sem:feature:*', 'ace:context:*', 'centroid:*', 'som:*'];
  try {
    const { findRedisContainer, getRedisPassword, runRedisCli } = await import('./lib/redis-valkey.mjs');
    const container = findRedisContainer(env);
    if (!container) throw new Error('No Redis/Valkey container found');
    const password = getRedisPassword(env);
    const counts = {};
    for (const pattern of patterns) {
      const result = runRedisCli(container, ['--scan', '--pattern', pattern], password, null, {
        maxBuffer: 1024 * 1024 * 16,
      });
      if (!result.ok) throw new Error(result.stderr || result.stdout || `redis-cli scan failed for ${pattern}`);
      counts[pattern] = result.stdout.split(/\r?\n/).filter(Boolean).length;
    }
    return {
      status: Object.values(counts).some((value) => Number(value) > 0) ? 'LIVE_PASS' : 'WARN',
      container,
      counts,
    };
  } catch (error) {
    return {
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function postgresProof(pool) {
  const columns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'atlas_packets'
    ORDER BY ordinal_position
  `);
  const columnSet = new Set(columns.rows.map((row) => row.column_name));

  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'atlas_packets'
    ORDER BY indexname
  `);
  const indexText = indexes.rows.map((row) => `${row.indexname} ${row.indexdef}`).join('\n');

  const [counts] = (await pool.query(`
    SELECT
      count(*)::int AS total,
      count(packet_key)::int AS with_packet_key,
      count(source_ref)::int AS with_source_ref,
      count(feature_id)::int AS with_feature_id,
      count(source_ref_key)::int AS with_source_ref_key,
      count(qdrant_point_id)::int AS with_qdrant_point_id,
      count(summary) FILTER (WHERE btrim(summary) <> '')::int AS with_packet_summary,
      count(embedding)::int AS with_pgvector_embedding
    FROM atlas_packets
  `)).rows;

  const fts = await pool.query(`
    SELECT packet_key, source_ref, feature_id,
           ts_rank(to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(feature_label, '') || ' ' || coalesce(feature_id, '')),
                   websearch_to_tsquery('english', 'qdrant redis retrieval')) AS rank
    FROM atlas_packets
    WHERE to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(feature_label, '') || ' ' || coalesce(feature_id, ''))
          @@ websearch_to_tsquery('english', 'qdrant redis retrieval')
    ORDER BY rank DESC
    LIMIT 5
  `);

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columnSet.has(column));
  const indexCoverage = Object.fromEntries(
    REQUIRED_INDEX_HINTS.map((item) => [item.key, item.pattern.test(indexText)])
  );

  return {
    status: missingColumns.length === 0 && Object.values(indexCoverage).every(Boolean) ? 'LIVE_PASS' : 'WARN',
    missing_columns: missingColumns,
    index_coverage: indexCoverage,
    counts: {
      ...counts,
      packet_key_pct: pct(counts.with_packet_key, counts.total),
      source_ref_pct: pct(counts.with_source_ref, counts.total),
      feature_id_pct: pct(counts.with_feature_id, counts.total),
      source_ref_key_pct: pct(counts.with_source_ref_key, counts.total),
      qdrant_point_id_pct: pct(counts.with_qdrant_point_id, counts.total),
      packet_summary_pct: pct(counts.with_packet_summary, counts.total),
      pgvector_embedding_pct: pct(counts.with_pgvector_embedding, counts.total),
    },
    fts_sample_count: fts.rowCount,
    fts_samples: fts.rows,
  };
}

function codeSurfaceProof() {
  const surfaces = {
    source_ref_normalizer: existsFile('scripts/atlas/lib/lineage-field-aliases.mjs'),
    rrf_scorer: existsFile('sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts')
      || existsFile('sveltekit-frontend/src/lib/server/retrieval/rrf-combiner.ts')
      || existsFile('scripts/atlas/lib/phase89-rrf.mjs'),
    atlas_search_route: existsFile('sveltekit-frontend/src/routes/api/atlas/search/+server.ts'),
    qdrant_upsert_adapter: existsFile('packages/parent-atlas/src/adapters/qdrant.ts')
      || existsFile('sveltekit-frontend/src/lib/server/adapters/service-integrations.ts'),
    redis_hot_cache_writer: existsFile('sveltekit-frontend/src/lib/server/cache/atlas-cache-cascade.ts')
      || existsFile('scripts/atlas/warm-bitfrost-semantic-cache.mjs'),
    embedding_qdrant_turbovec_proof: existsFile('scripts/atlas/test-embedding-qdrant-turbovec.mjs'),
  };
  return {
    status: Object.values(surfaces).every(Boolean) ? 'LIVE_PASS' : 'WARN',
    surfaces,
  };
}

function renderMd(report) {
  const lines = [
    '# CPU-First Packet Retrieval Readiness',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    '',
    '## Rule',
    '',
    'Postgres owns packets. Qdrant finds vectors. RRF decides rank. Gemma4 summarizes. Redis caches. GPU accelerates only after correctness is proven.',
    '',
    '## Lanes',
    '',
    `- Postgres truth/indexes: ${report.lanes.postgres.status}`,
    `- Qdrant named-vector mirror: ${report.lanes.qdrant.status}`,
    `- Redis/BitFrost cache surface: ${report.lanes.redis.status}`,
    `- Code surfaces: ${report.lanes.code.status}`,
    '',
    '## Postgres Coverage',
    '',
    `- atlas_packets: ${report.lanes.postgres.counts.total}`,
    `- packet_key: ${report.lanes.postgres.counts.packet_key_pct}%`,
    `- source_ref: ${report.lanes.postgres.counts.source_ref_pct}%`,
    `- feature_id: ${report.lanes.postgres.counts.feature_id_pct}%`,
    `- source_ref_key: ${report.lanes.postgres.counts.source_ref_key_pct}%`,
    `- qdrant_point_id: ${report.lanes.postgres.counts.qdrant_point_id_pct}%`,
    `- packet summary: ${report.lanes.postgres.counts.packet_summary_pct}%`,
    `- pgvector embedding: ${report.lanes.postgres.counts.pgvector_embedding_pct}%`,
    '',
    '## Qdrant',
    '',
    `- collection: ${report.lanes.qdrant.collection}`,
    `- points: ${report.lanes.qdrant.points}`,
    `- named vectors: ${(report.lanes.qdrant.named_vectors ?? []).join(', ')}`,
    `- content vector dim: ${report.lanes.qdrant.content_vector_dim}`,
    '',
    '## Redis',
    '',
    ...Object.entries(report.lanes.redis.counts ?? {}).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Later Acceleration Lanes',
    '',
    '- TensorRT reranker',
    '- ONNX Runtime GPU',
    '- cuVS/TurboVec ANN accelerator',
    '- LibTorch kmeans/SOM/AE/xgradient',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const lanes = {
      postgres: await postgresProof(pool),
      qdrant: await qdrantProof(),
      redis: await redisProof(),
      code: codeSurfaceProof(),
    };
    const statuses = Object.values(lanes).map((lane) => lane.status);
    const status = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('WARN') ? 'WARN' : 'LIVE_PASS';
    const report = {
      generated_at: new Date().toISOString(),
      status,
      cutoff: 'CPU fp32 packet truth and queryability first; GPU/TensorRT/cuVS only as acceleration lanes.',
      lanes,
    };

    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(OUT_MD, renderMd(report), 'utf8');
    console.log(JSON.stringify({
      status,
      atlas_packets: lanes.postgres.counts.total,
      qdrant_points: lanes.qdrant.points,
      qdrant_content_dim: lanes.qdrant.content_vector_dim,
      redis_status: lanes.redis.status,
      report: OUT_JSON,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
