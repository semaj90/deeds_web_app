#!/usr/bin/env node
/**
 * import-atlas-scores.mjs
 *
 * Offline graph compiler — Stage 3.
 *
 * Reads docs/graph/offline/results.jsonl (written by gpu-sparse-rank.py)
 * and writes pagerank + top_neighbors back to:
 *   - atlas_feature_map (pagerank, centrality columns)
 *   - Redis hash gpu:atlas:pagerank  (feature_id → score, 24h TTL)
 *   - atlas_paths table (top neighbor paths per feature_id)
 *
 * Usage:
 *   node scripts/atlas/import-atlas-scores.mjs --dry-run
 *   node scripts/atlas/import-atlas-scores.mjs --apply
 */

import pg from 'pg';
import { createRequire } from 'node:module';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');
const RESULTS = join(ROOT, 'docs', 'graph', 'offline', 'results.jsonl');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || '';

const APPLY   = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const TTL_24H = 86400;
const BATCH   = 200;

async function readResults() {
  if (!existsSync(RESULTS)) {
    throw new Error(`results.jsonl not found at ${RESULTS}. Run gpu-sparse-rank.py first.`);
  }
  const rows = [];
  const rl = createInterface({ input: createReadStream(RESULTS), crlfDelay: Infinity });
  for await (const line of rl) {
    const l = line.trim();
    if (l) rows.push(JSON.parse(l));
  }
  return rows;
}

async function main() {
  console.log(`\n═══ Import Atlas Scores ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);

  const rows = await readResults();
  console.log(`Results loaded: ${rows.length} feature entries`);

  if (DRY_RUN) {
    const top5 = rows.sort((a, b) => b.pagerank - a.pagerank).slice(0, 5);
    console.log('\nTop-5 by PageRank:');
    for (const r of top5) {
      console.log(`  ${r.feature_id}: pr=${r.pagerank} degree=${r.degree} top=${JSON.stringify(r.top_neighbors?.slice(0, 2))}`);
    }
    console.log('\n(dry-run — no writes; run with --apply to commit)');
    return;
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  // ── 1. Update atlas_feature_map pagerank + centrality ─────────────────────
  console.log('\nUpdating atlas_feature_map pagerank...');
  let pgUpdated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const featureIds = batch.map(r => r.feature_id);
    const pageranks  = batch.map(r => r.pagerank);
    const degrees    = batch.map(r => r.degree);

    await pool.query(`
      UPDATE atlas_feature_map afm
      SET pagerank   = u.pagerank,
          centrality = u.degree::real / 1000.0,
          updated_at = now()
      FROM (
        SELECT unnest($1::text[])  AS feature_id,
               unnest($2::real[])  AS pagerank,
               unnest($3::int[])   AS degree
      ) u
      WHERE afm.feature_id = u.feature_id
    `, [featureIds, pageranks, degrees]);
    pgUpdated += batch.length;
    process.stdout.write(`\r  Updated ${pgUpdated}/${rows.length}`);
  }
  process.stdout.write('\n');

  // ── 2. Write to Redis hash gpu:atlas:pagerank ─────────────────────────────
  let redisOk = false;
  try {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: REDIS_HOST, port: REDIS_PORT,
      password: REDIS_PASS || undefined,
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();

    const pipeline = redis.pipeline();
    for (const r of rows) {
      pipeline.hset('gpu:atlas:pagerank', r.feature_id, String(r.pagerank));
    }
    pipeline.expire('gpu:atlas:pagerank', TTL_24H);
    await pipeline.exec();
    await redis.quit();
    redisOk = true;
    console.log(`Redis gpu:atlas:pagerank: ${rows.length} entries written (TTL 24h)`);
  } catch (err) {
    console.warn(`Redis unavailable (${err.message}) — skipping`);
  }

  // ── 3. Insert top-neighbor paths into atlas_paths ─────────────────────────
  console.log('\nInserting atlas_paths...');
  let pathsInserted = 0;
  for (const r of rows) {
    if (!r.top_neighbors?.length) continue;
    for (const [neighbor, score] of r.top_neighbors) {
      await pool.query(`
        INSERT INTO atlas_paths (start_key, end_key, path_nodes, path_edges, score, reason, hop_count)
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, 1)
        ON CONFLICT DO NOTHING
      `, [
        r.feature_id, neighbor,
        JSON.stringify([r.feature_id, neighbor]),
        JSON.stringify([{ from: r.feature_id, to: neighbor, type: 'SCORED_NEIGHBOR', weight: score }]),
        score,
        `pagerank=${r.pagerank.toFixed(4)} degree=${r.degree}`,
      ]);
      pathsInserted++;
    }
  }
  console.log(`atlas_paths inserted: ${pathsInserted}`);

  await pool.end();

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  atlas_feature_map updated: ${pgUpdated}`);
  console.log(`  Redis gpu:atlas:pagerank:  ${redisOk ? rows.length + ' entries' : 'SKIPPED'}`);
  console.log(`  atlas_paths inserted:      ${pathsInserted}`);
  console.log('\n  Next: node scripts/atlas/generate-parent-atlas-toc.mjs --apply');
}

main().catch(err => { console.error(err); process.exit(1); });
