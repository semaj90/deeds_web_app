#!/usr/bin/env node
/** Read-only alignment receipt for files emitted by daily Graphify. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const LIMIT = Math.max(1, Math.min(5000, Number(arg('limit', 256))));
const SINCE_HOURS = Math.max(1, Math.min(720, Number(arg('since-hours', 24))));
const QDRANT_URL = String(arg('qdrant-url', env.QDRANT_URL ?? 'http://127.0.0.1:6333')).replace(/\/+$/, '');
const COLLECTION = String(arg('collection', env.QDRANT_CODE_COLLECTION ?? 'codebase_chunks_768'));
const OUT = path.resolve(REPO_ROOT, String(arg('out', 'docs/reports/graphify-daily-feature-alignment-v1.json')));

function pointId(value) {
  const text = String(value ?? '').trim();
  if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text))) return Number(text);
  return text;
}
async function qdrantIds(ids) {
  if (!ids.length) return new Set();
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, with_payload: false, with_vector: false }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Qdrant point lookup HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  return new Set((body?.result ?? []).map((point) => String(point.id)));
}
async function valkeyProbe() {
  const redis = new Redis(resolveRedisUrl(env), { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
  try {
    await redis.connect();
    const patterns = ['centroid:*', 'som:*', 'ace:*', 'gpu:karpathy:*'];
    const counts = {};
    for (const pattern of patterns) {
      let cursor = '0'; let count = 0;
      do { const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500); cursor = next; count += keys.length; } while (cursor !== '0');
      counts[pattern] = count;
    }
    return { reachable: true, counts };
  } catch (error) { return { reachable: false, error: error.message }; }
  finally { redis.disconnect(); }
}
async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'graphify-daily-feature-alignment' });
  const report = { schema: 'atlas.graphify-daily-feature-alignment.v1', generatedAt: new Date().toISOString(), readOnly: true, scope: { table: 'codebase_chunk_index', sinceHours: SINCE_HOURS, limit: LIMIT }, qdrant: { url: QDRANT_URL, collection: COLLECTION }, status: 'FAIL', rows: [], coverage: {}, featureAuthority: {}, valkey: {} };
  try {
    const authorityResult = await pool.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE page_rank_score IS NOT NULL)::int AS scored
      FROM code_features
    `);
    report.featureAuthority = {
      table: 'code_features',
      scoreColumn: 'page_rank_score',
      total: authorityResult.rows[0]?.total ?? 0,
      scored: authorityResult.rows[0]?.scored ?? 0,
    };
    const result = await pool.query(`
      SELECT id::text, qdrant_id, source_ref, relative_path, content_embedding_768 IS NOT NULL AS semantic_768,
        search_vector IS NOT NULL AS bm25, COALESCE(jsonb_array_length(ast_symbols), 0) > 0 AS ast,
        error_embedding IS NOT NULL AS error_embedding, signature_embedding IS NOT NULL AS signature_embedding,
        page_rank_score IS NOT NULL AS pagerank, centroid_id IS NOT NULL AS centroid,
        latent_64 IS NOT NULL AS latent_64, som_cluster IS NOT NULL AS som, kmeans_cluster IS NOT NULL AS kmeans
      FROM codebase_chunk_index
      WHERE updated_at >= NOW() - ($1 * INTERVAL '1 hour')
      ORDER BY updated_at DESC, id
      LIMIT $2
    `, [SINCE_HOURS, LIMIT]);
    const qdrantPresent = await qdrantIds(result.rows.map((row) => row.qdrant_id).filter(Boolean).map(pointId));
    report.rows = result.rows.map((row) => ({ ...row, qdrant: row.qdrant_id ? qdrantPresent.has(String(row.qdrant_id)) : false }));
    const fields = ['semantic_768', 'bm25', 'ast', 'error_embedding', 'signature_embedding', 'pagerank', 'centroid', 'latent_64', 'som', 'kmeans', 'qdrant'];
    report.coverage = Object.fromEntries(fields.map((field) => [field, { count: report.rows.filter((row) => row[field]).length, total: report.rows.length }]));
    report.coverage.feature_pagerank = report.featureAuthority;
    report.valkey = await valkeyProbe();
    report.status = result.rows.length > 0 ? 'PASS' : 'EMPTY';
  } catch (error) { report.error = error.message; }
  finally { await pool.end(); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, scope: report.scope, coverage: report.coverage, valkey: report.valkey, out: OUT }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}
main();
