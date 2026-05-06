#!/usr/bin/env node
/**
 * Sync cluster_summaries (Postgres) → Qdrant `cluster_narratives` + Redis cache.
 *
 * Why:
 *   - Postgres cluster_summaries holds gemma4 narratives with summary_embedding
 *     (768-dim from embeddinggemma during summarisation), but they aren't
 *     reachable via vector search until pushed to Qdrant.
 *   - GraphifyViewer's cluster panel reads cluster_narratives JSON from Redis
 *     in <5ms; otherwise it falls back to the Postgres join (~50ms).
 *
 * What this writes:
 *   - Qdrant `cluster_narratives` collection (named vector "narrative", 768-dim)
 *     payload includes summary, purpose, patterns, warnings, tags, metadata
 *   - Redis `cluster:summary:{id}` JSON cache, 12h TTL
 *
 * Idempotent — Qdrant uses point_id = gpu_cluster (deterministic int).
 */
import pg from 'pg';
import Redis from 'ioredis';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.resolve(__dirname, '..', '.env');

if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const REPO          = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : 'default';
const QDRANT_URL    = process.env.QDRANT_URL    ?? 'http://127.0.0.1:6333';
const REDIS_URL     = process.env.REDIS_URL     ?? 'redis://127.0.0.1:6379';
const DATABASE_URL  = process.env.DATABASE_URL  ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const COLLECTION    = 'cluster_narratives';
const REDIS_TTL     = 12 * 60 * 60;

const pool  = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const redis = new Redis(REDIS_URL, { lazyConnect: true });
await redis.ping();

const { rows } = await pool.query(`
  SELECT
    gpu_cluster                      AS cluster_id,
    summary, purpose, patterns, warnings, tags,
    member_count, centroid_distance_mean, summary_model,
    metadata, created_at, updated_at,
    summary_embedding::text          AS embedding_text
  FROM cluster_summaries
  WHERE repo_id = $1 AND summary_embedding IS NOT NULL
  ORDER BY gpu_cluster
`, [REPO]);

console.log(`✓ Loaded ${rows.length} cluster summaries with embeddings from Postgres`);

let qdrantOk = 0, redisOk = 0, failed = 0;
const QDRANT_BATCH = 16;

for (let i = 0; i < rows.length; i += QDRANT_BATCH) {
  const batch = rows.slice(i, i + QDRANT_BATCH);
  const points = [];

  for (const row of batch) {
    // pgvector returns "[0.1,0.2,...]" — parse to float array
    let vector;
    try {
      vector = JSON.parse(row.embedding_text);
      if (!Array.isArray(vector) || vector.length !== 768) {
        console.warn(`  cluster #${row.cluster_id}: bad embedding shape ${vector?.length}`);
        failed++;
        continue;
      }
    } catch (err) {
      console.warn(`  cluster #${row.cluster_id}: parse error ${err.message}`);
      failed++;
      continue;
    }

    const payload = {
      clusterId:            row.cluster_id,
      repoId:               REPO,
      summary:              row.summary,
      purpose:              row.purpose,
      patterns:             row.patterns ?? [],
      warnings:             row.warnings ?? [],
      tags:                 row.tags ?? [],
      memberCount:          row.member_count,
      centroidDistanceMean: row.centroid_distance_mean,
      summaryModel:         row.summary_model,
      metadata:             row.metadata,
      createdAt:            row.created_at?.toISOString?.() ?? null,
      updatedAt:            row.updated_at?.toISOString?.() ?? null,
    };

    points.push({
      id:      row.cluster_id,
      vector:  { narrative: vector },
      payload,
    });

    // Redis cache (fire-and-forget alongside Qdrant batch)
    void redis.setex(
      `cluster:summary:${row.cluster_id}`,
      REDIS_TTL,
      JSON.stringify(payload),
    ).then(() => { redisOk++; }).catch(() => null);
  }

  if (!points.length) continue;

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      qdrantOk += points.length;
      console.log(`  ✓ batch ${i / QDRANT_BATCH + 1}: ${points.length} points → Qdrant`);
    } else {
      const body = await res.text();
      console.warn(`  ✗ batch ${i / QDRANT_BATCH + 1}: HTTP ${res.status} — ${body.slice(0, 120)}`);
      failed += points.length;
    }
  } catch (err) {
    console.warn(`  ✗ batch ${i / QDRANT_BATCH + 1}: ${err.message}`);
    failed += points.length;
  }
}

// Settle Redis writes
await new Promise((r) => setTimeout(r, 250));

const info = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then((r) => r.json()).catch(() => null);

console.log(`\nSync complete:`);
console.log(`  Qdrant ${COLLECTION}: ${qdrantOk} points (collection holds ${info?.result?.points_count ?? '?'})`);
console.log(`  Redis cluster:summary:*: ${redisOk} keys, ${REDIS_TTL / 3600}h TTL`);
console.log(`  Failed: ${failed}`);

await redis.quit();
await pool.end();
