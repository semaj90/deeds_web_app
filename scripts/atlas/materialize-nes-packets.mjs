#!/usr/bin/env node
/**
 * materialize-nes-packets.mjs
 *
 * Reads atlas_feature_map rows and materializes durable NES/CHR packets:
 *   atlas_feature_map
 *   → nes_chrom_packets  (JSONB payload, packet_key, source_ref, feature_id)
 *   → atlas_feature_map.packet_id  (back-link)
 *   → Redis: ace:packet:<packet_key>  (hot cache, 1h TTL)
 *            nes:packet:<sha8(source_ref)>  (source_ref index, 1h TTL)
 *
 * Packet payload shape (compact — fits Gemma4 context budget):
 *   {
 *     source_ref, feature_id, cluster_id, centroid_id, som_cluster,
 *     lane_ids, qdrant_point_id, tags, kind, indexed_at
 *   }
 *
 * Usage:
 *   node scripts/atlas/materialize-nes-packets.mjs
 *   node scripts/atlas/materialize-nes-packets.mjs --dry-run
 *   node scripts/atlas/materialize-nes-packets.mjs --only-missing
 *   node scripts/atlas/materialize-nes-packets.mjs --limit=500
 *   node scripts/atlas/materialize-nes-packets.mjs --source-ref=src/routes/api/auth/register/+server.ts
 */

import fs     from 'node:fs';
import path   from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildPacketKey, buildPacketPayload, sha8, slug } from './packet-materializer-lib.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv         = process.argv.slice(2);
const DRY_RUN      = argv.includes('--dry-run');
const ONLY_MISSING = argv.includes('--only-missing');
const VERBOSE      = argv.includes('--verbose');
const limitArg     = argv.find(a => a.startsWith('--limit='));
const sourceArg    = argv.find(a => a.startsWith('--source-ref='));
const LIMIT        = limitArg  ? parseInt(limitArg.split('=')[1])  : null;
const ONLY_REF     = sourceArg ? sourceArg.split('=').slice(1).join('=') : null;
const BATCH        = 200;
const FORCE        = argv.includes('--force');

// ── Env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}
const ENV = loadEnv();

const DB_URL = ENV.DATABASE_URL
  ?? `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

const REDIS_HOST = ENV.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = parseInt(ENV.REDIS_PORT ?? '6379');
const REDIS_PASS = ENV.REDIS_PASSWORD ?? ENV.REDIS_PASS ?? undefined;

// ── Redis (ioredis — optional, skip gracefully if unavailable) ────────────────
let redis = null;
async function connectRedis() {
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis({
      host:               REDIS_HOST,
      port:               REDIS_PORT,
      password:           REDIS_PASS,
      lazyConnect:        true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy:      () => null,
    });
    client.on('error', () => {});
    await client.connect();
    await client.ping();
    redis = client;
    return true;
  } catch {
    return false;
  }
}

async function cachePacket(packetKey, payload) {
  if (!redis) return;
  const json = JSON.stringify(payload);
  const TTL  = 3600; // 1h
  try {
    await redis.setex(`ace:packet:${packetKey}`, TTL, json);
    await redis.setex(`nes:packet:${sha8(payload.source_ref)}`, TTL, JSON.stringify({ packet_key: packetKey }));
    if (payload.feature_id) {
      await redis.setex(`ace:feature:${payload.feature_id}`, TTL, json);
    }
  } catch { /* non-fatal */ }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[materialize-nes-packets] Starting (dry_run=${DRY_RUN} only_missing=${ONLY_MISSING} limit=${LIMIT ?? 'all'})`);

  const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });
  const redisOk = await connectRedis();
  console.log(`  Redis: ${redisOk ? 'connected' : 'unavailable (skipping cache writes)'}`);

  // Build SELECT query
  let where = '';
  const params = [];
  if (ONLY_REF) {
    params.push(ONLY_REF);
    where = `WHERE (source_ref = $${params.length} OR source_ref = 'sveltekit-frontend/' || $${params.length})`;
  } else if (ONLY_MISSING || !FORCE) {
    where = 'WHERE packet_id IS NULL';
  } else {
    where = 'WHERE 1=1';
  }
  const limitClause = LIMIT ? ` LIMIT ${LIMIT}` : '';

  const countRes = await pool.query(
    `SELECT COUNT(*) FROM atlas_feature_map ${where}`, params
  ).catch(() => ({ rows: [{ count: '?' }] }));
  const total = countRes.rows[0]?.count ?? '?';
  console.log(`  atlas_feature_map rows to process: ${total}`);

  if (DRY_RUN) {
    const sample = await pool.query(
      `SELECT source_ref, feature_id, cluster_id, centroid_id FROM atlas_feature_map ${where} LIMIT 5`, params
    ).catch(() => ({ rows: [] }));
    console.log('[DRY RUN] Sample rows:');
    for (const r of sample.rows) {
      console.log(`  ${r.source_ref} → feat:${r.feature_id ?? 'none'} cluster:${r.cluster_id ?? 'none'}`);
    }
    await pool.end();
    return;
  }

  let cursor = '';   // keyset: last normalized_path seen
  let done = 0;
  let cached = 0;
  let errors = 0;

  while (true) {
    // Keyset pagination: stable under concurrent updates (no OFFSET drift)
    const cursorClause = cursor ? ` AND normalized_path > $${params.length + 1}` : '';
    const cursorParams = cursor ? [...params, cursor] : params;

    let queryWhere = 'WHERE packet_id IS NULL';
    if (ONLY_REF) {
      queryWhere = `WHERE (source_ref = $1 OR source_ref = 'sveltekit-frontend/' || $1)`;
    } else if (FORCE) {
      queryWhere = 'WHERE 1=1';
    }

    const rows = await pool.query(
      `SELECT normalized_path, source_ref, feature_id, related_feature_ids,
              cluster_id, centroid_id, som_cluster, qdrant_point_id, lane_ids,
              nes_card_id, indexed_at
       FROM atlas_feature_map
       ${queryWhere}${cursorClause}
       ORDER BY normalized_path
       LIMIT ${BATCH}`,
      cursorParams
    ).catch(err => { console.error('DB read error:', err.message); return { rows: [] }; });

    if (!rows.rows.length) break;
    cursor = rows.rows[rows.rows.length - 1].normalized_path;

    for (const row of rows.rows) {
      const packetKey  = buildPacketKey(row.source_ref, row.feature_id);
      const payload    = buildPacketPayload(row);
      const queryHash  = sha8(`materialize:${row.source_ref}`);

      try {
        // Upsert nes_chrom_packets
        await pool.query(
          `INSERT INTO nes_chrom_packets
             (packet_key, query_hash, chunk_id, source_ref, source_refs, feature_id,
              packet_type, lane, model, summary, payload, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6,
                   'nes_chrom', 'atlas_materialized', 'materialize-nes-packets', NULL,
                   $7::jsonb, NOW(), NOW())
           ON CONFLICT (packet_key) DO UPDATE SET
             payload    = EXCLUDED.payload,
             feature_id = COALESCE(EXCLUDED.feature_id, nes_chrom_packets.feature_id),
             updated_at = NOW()`,
          [
            packetKey,
            queryHash,
            sha8(row.source_ref),
            row.source_ref,
            JSON.stringify([row.source_ref]),
            row.feature_id ?? `feat:${slug(row.source_ref)}`,
            JSON.stringify(payload),
          ]
        );

        // Back-link packet_id on atlas_feature_map
        await pool.query(
          `UPDATE atlas_feature_map SET packet_id = $1 WHERE normalized_path = $2`,
          [packetKey, row.normalized_path]
        );

        // Write to Redis
        await cachePacket(packetKey, payload);
        cached++;

        done++;
        if (VERBOSE) console.log(`  ✓ ${row.source_ref} → ${packetKey}`);

      } catch (err) {
        errors++;
        if (VERBOSE) console.warn(`  ✗ ${row.source_ref}: ${err.message}`);
      }
    }

    process.stdout.write(`\r  materialized ${done} / ~${total}  errors=${errors}`);
    if (LIMIT && done >= LIMIT) break;
  }

  if (redis) await redis.quit().catch(() => {});
  await pool.end();

  console.log(`\n\n[materialize-nes-packets] Done`);
  console.log(`  Materialized : ${done}`);
  console.log(`  Redis cached : ${cached}`);
  console.log(`  Errors       : ${errors}`);
  console.log(`\nVerify:`);
  console.log(`  SELECT COUNT(*) FROM nes_chrom_packets WHERE lane = 'atlas_materialized';`);
  console.log(`  SELECT COUNT(*) FROM atlas_feature_map WHERE packet_id IS NOT NULL;`);
}

main().catch(err => {
  console.error('[materialize-nes-packets] Fatal:', err);
  process.exit(1);
});
