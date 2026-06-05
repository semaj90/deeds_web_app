#!/usr/bin/env node
/**
 * scripts/atlas/warm-redis-lod-cache.mjs
 *
 * Writes the Atlas LOD hot cache to Redis / Valkey (BitFrost layer).
 *
 * Key schema (Game Boy RAM model):
 *
 *   BATTLE RAM (hot, 1h TTL):
 *     ace:source:{id}:lod0    → compressed JSON packet {s,f,t,l,q,b,k,d,r,a}
 *     ace:authority:top        → sorted set of top-100 source_ref_ids by reward
 *
 *   MAP MEMORY (warm, 24h TTL):
 *     ace:source:{id}:lod1    → 1-line LOD1 summary string
 *     ace:dict:features       → JSON hash (feature_code decode table)
 *     ace:dict:tags           → JSON hash (tag_code decode table)
 *     ace:dict:sources        → JSON hash (source_id → source_ref)
 *     ace:dict:lanes          → JSON hash (lane_code decode table)
 *     ace:index:lane:{lane}   → SMEMBERS of source_ref_ids in that lane
 *     ace:index:feature:{f}   → SMEMBERS of source_ref_ids with that feature
 *
 *   ROM BANK (cold pointer, 48h TTL):
 *     ace:source:{id}:lod2    → 1 if LOD2 (Gemma4) summary exists in Postgres
 *     ace:source:{id}:qdrant  → qdrant_point_id if indexed
 *
 * Usage:
 *   node scripts/atlas/warm-redis-lod-cache.mjs --dry-run
 *   node scripts/atlas/warm-redis-lod-cache.mjs --apply
 *   node scripts/atlas/warm-redis-lod-cache.mjs --apply --lod=0   # LOD0 only
 *   node scripts/atlas/warm-redis-lod-cache.mjs --apply --lod=1   # LOD1 only
 *   node scripts/atlas/warm-redis-lod-cache.mjs --apply --dicts   # Dicts only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DICTS_ONLY = process.argv.includes('--dicts');
const LOD_IDX = process.argv.indexOf('--lod');
const LOD_FILTER = LOD_IDX >= 0 ? parseInt(process.argv[LOD_IDX + 1], 10) : null; // null = all

// TTLs
const TTL_LOD0 = 3600;          // 1h — hot battle RAM
const TTL_LOD1 = 86400;         // 24h — warm map memory
const TTL_LOD2 = 86400 * 2;     // 48h — cold pointer
const TTL_DICT = 86400 * 7;     // 7d — dictionaries
const TTL_INDEX = 86400;        // 24h — lane/feature indexes
const TTL_AUTHORITY = 3600;     // 1h — top authority list

function loadEnv() {
  for (const p of [path.join(ROOT, 'sveltekit-frontend', '.env'), path.join(ROOT, '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL
  ?? `redis://:${process.env.REDIS_PASSWORD ?? 'redis'}@${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`;

const DICT_PATH = path.join(ROOT, '.tmp', 'atlas-dict-full.json');

async function main() {
  console.log('\n══ Warm Redis LOD Cache ══════════════════════════════════');
  console.log(`  Mode:    ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Redis:   ${REDIS_URL.replace(/:([^@]+)@/, ':***@')}`);
  if (LOD_FILTER !== null) console.log(`  LOD filter: LOD${LOD_FILTER} only`);
  if (DICTS_ONLY) console.log(`  Dicts only mode`);

  // Load dictionary
  if (!fs.existsSync(DICT_PATH)) {
    console.error(`  ❌ ${DICT_PATH} missing. Run build-compressed-packets.mjs --apply first.`);
    process.exit(1);
  }
  const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
  console.log(`\n  Dictionary: ${dict.source_count} sources, ${dict.feature_count} features, ${dict.tag_count} tags`);

  // Connect Postgres
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Load all rows
  console.log('\n  Step 1: Load rows from Postgres...');
  const { rows } = await pool.query(`
    SELECT
      pad.source_ref_id        AS id,
      pad.source_ref,
      pad.feature_id,
      pad.tags,
      pad.source_kind,
      pad.index_lane,
      pad.summary_lod0,
      pad.summary_lod1,
      pad.summary_lod2,
      pad.has_auth,
      pad.is_route,
      pad.line_count,
      afms.som_cluster,
      afms.semantic_confidence,
      afms.behavior_score,
      afms.packet_count,
      pad.qdrant_point_id
    FROM parent_atlas_documents pad
    LEFT JOIN atlas_feature_map_synthesized afms ON afms.source_ref = pad.source_ref
    WHERE pad.source_ref NOT LIKE 'feature:%'
      AND pad.source_ref_id IS NOT NULL
    ORDER BY pad.source_ref_id
  `);
  console.log(`  ✅ ${rows.length} rows loaded`);
  await pool.end();

  // Pre-compute encode tables
  const featureEnc = dict.encode.features;
  const tagEnc = dict.encode.tags;
  const laneEnc = dict.encode.lanes;

  // Stats
  let lod0Count = 0, lod1Count = 0, lod2Count = 0, qdrantCount = 0;

  // Build Redis pipeline data
  const lod0Entries = []; // [key, value, ttl]
  const lod1Entries = [];
  const lod2Entries = [];
  const laneIndex = {}; // lane → Set<id>
  const featureIndex = {}; // feature_id → Set<id>

  for (const row of rows) {
    const id = row.id;
    if (!id) continue;

    const tags = (Array.isArray(row.tags) ? row.tags : [])
      .filter(t => !t.startsWith('excluded_') && t !== 'vendor')
      .map(t => tagEnc[t])
      .filter(c => c != null)
      .sort((a, b) => a - b);

    const confidence = row.semantic_confidence
      ? Math.round(parseFloat(row.semantic_confidence) * 100) : 0;
    const behavior = row.behavior_score
      ? Math.round(parseFloat(row.behavior_score) * 100) : 0;

    // LOD0 compressed packet
    const packet = {
      s: id,
      f: featureEnc[row.feature_id] ?? 0,
      t: tags,
      l: laneEnc[row.index_lane] ?? 1,
      q: confidence,
      b: behavior,
      k: row.packet_count ?? 0,
      d: (row.summary_lod0 ? 1 : 0) | (row.summary_lod1 ? 2 : 0) |
         (row.summary_lod2 ? 4 : 0) | (row.som_cluster ? 8 : 0),
      r: row.is_route ? 1 : 0,
      a: row.has_auth ? 1 : 0,
    };
    lod0Entries.push([`ace:source:${id}:lod0`, JSON.stringify(packet), TTL_LOD0]);
    lod0Count++;

    // LOD1 summary string
    if (row.summary_lod1) {
      lod1Entries.push([`ace:source:${id}:lod1`, row.summary_lod1, TTL_LOD1]);
      lod1Count++;
    }

    // LOD2 pointer (just a flag pointing to Postgres)
    if (row.summary_lod2) {
      lod2Entries.push([`ace:source:${id}:lod2`, '1', TTL_LOD2]);
      lod2Count++;
    }

    // Qdrant pointer
    if (row.qdrant_point_id) {
      lod2Entries.push([`ace:source:${id}:qdrant`, String(row.qdrant_point_id), TTL_LOD2]);
      qdrantCount++;
    }

    // Lane index
    if (row.index_lane) {
      if (!laneIndex[row.index_lane]) laneIndex[row.index_lane] = [];
      laneIndex[row.index_lane].push(String(id));
    }

    // Feature index
    if (row.feature_id) {
      if (!featureIndex[row.feature_id]) featureIndex[row.feature_id] = [];
      featureIndex[row.feature_id].push(String(id));
    }
  }

  console.log(`\n  Prepared:`);
  console.log(`    LOD0 packets:  ${lod0Count}`);
  console.log(`    LOD1 strings:  ${lod1Count}`);
  console.log(`    LOD2 pointers: ${lod2Count}`);
  console.log(`    Qdrant ptrs:   ${qdrantCount}`);
  console.log(`    Lane indexes:  ${Object.keys(laneIndex).length}`);
  console.log(`    Feature idx:   ${Object.keys(featureIndex).length}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No Redis writes. Pass --apply to warm cache.');
    // Show sample
    if (lod0Entries.length > 0) {
      console.log(`\n  Sample LOD0 packet: ${lod0Entries[0][0]}`);
      console.log(`  Value: ${lod0Entries[0][1]}`);
    }
    if (lod1Entries.length > 0) {
      console.log(`\n  Sample LOD1: ${lod1Entries[0][0]}`);
      console.log(`  Value: "${lod1Entries[0][1].slice(0, 80)}"`);
    }
    return;
  }

  // Connect Redis
  const options = {};
  if (process.env.REDIS_PASSWORD) {
    options.password = process.env.REDIS_PASSWORD;
  }
  const redis = new Redis(REDIS_URL, options);
  redis.on('error', e => console.error('  [Redis error]', e.message));
  console.log('\n  ✅ Redis connected');

  // Write dicts
  console.log('\n  Step 2: Write dictionaries (7d TTL)...');
  await redis.set('ace:dict:features', JSON.stringify(dict.decode.features), 'EX', TTL_DICT);
  await redis.set('ace:dict:tags', JSON.stringify(dict.decode.tags), 'EX', TTL_DICT);
  await redis.set('ace:dict:lanes', JSON.stringify(dict.decode.lanes), 'EX', TTL_DICT);
  await redis.set('ace:dict:sources', JSON.stringify(dict.decode.sources), 'EX', TTL_DICT);
  // Also store encode table for fast lookup
  await redis.set('ace:dict:tag_encode', JSON.stringify(dict.encode.tags), 'EX', TTL_DICT);
  await redis.set('ace:dict:feature_encode', JSON.stringify(dict.encode.features), 'EX', TTL_DICT);
  console.log('  ✅ Dictionaries written');

  if (DICTS_ONLY) {
    await redis.disconnect();
    console.log('\n  ✅ Dict-only mode complete.');
    return;
  }

  // Write LOD0 in pipeline batches
  if (LOD_FILTER === null || LOD_FILTER === 0) {
    console.log(`\n  Step 3: Writing ${lod0Entries.length} LOD0 packets (1h TTL)...`);
    let written = 0;
    const BATCH = 500;
    for (let i = 0; i < lod0Entries.length; i += BATCH) {
      const batch = lod0Entries.slice(i, i + BATCH);
      const pipeline = redis.pipeline();
      for (const [key, val, ttl] of batch) {
        pipeline.set(key, val, 'EX', ttl);
      }
      await pipeline.exec();
      written += batch.length;
      if (written % 2000 === 0 || written >= lod0Entries.length) {
        console.log(`    wrote ${written}/${lod0Entries.length}...`);
      }
    }
    console.log('  ✅ LOD0 written');
  }

  // Write LOD1
  if (LOD_FILTER === null || LOD_FILTER === 1) {
    console.log(`\n  Step 4: Writing ${lod1Entries.length} LOD1 strings (24h TTL)...`);
    let written = 0;
    const BATCH = 500;
    for (let i = 0; i < lod1Entries.length; i += BATCH) {
      const batch = lod1Entries.slice(i, i + BATCH);
      const pipeline = redis.pipeline();
      for (const [key, val, ttl] of batch) {
        pipeline.set(key, val, 'EX', ttl);
      }
      await pipeline.exec();
      written += batch.length;
    }
    console.log('  ✅ LOD1 written');
  }

  // Write LOD2 + Qdrant pointers
  if (LOD_FILTER === null || LOD_FILTER === 2) {
    console.log(`\n  Step 5: Writing LOD2 + Qdrant pointers (48h TTL)...`);
    const BATCH = 500;
    for (let i = 0; i < lod2Entries.length; i += BATCH) {
      const batch = lod2Entries.slice(i, i + BATCH);
      const pipeline = redis.pipeline();
      for (const [key, val, ttl] of batch) {
        pipeline.set(key, val, 'EX', ttl);
      }
      await pipeline.exec();
    }
    console.log('  ✅ LOD2 pointers written');
  }

  // Write lane indexes (SADD)
  console.log('\n  Step 6: Writing lane indexes...');
  for (const [lane, ids] of Object.entries(laneIndex)) {
    const key = `ace:index:lane:${lane}`;
    await redis.del(key);
    if (ids.length > 0) {
      await redis.sadd(key, ids);
      await redis.expire(key, TTL_INDEX);
    }
  }
  console.log(`  ✅ ${Object.keys(laneIndex).length} lane indexes written`);

  // Write feature indexes
  console.log('\n  Step 7: Writing feature indexes...');
  const BATCH = 50;
  const featureEntries = Object.entries(featureIndex);
  for (let i = 0; i < featureEntries.length; i += BATCH) {
    const batch = featureEntries.slice(i, i + BATCH);
    for (const [feat, ids] of batch) {
      const key = `ace:index:feature:${feat}`;
      await redis.del(key);
      if (ids.length > 0) {
        await redis.sadd(key, ids);
        await redis.expire(key, TTL_INDEX);
      }
    }
  }
  console.log(`  ✅ ${featureEntries.length} feature indexes written`);

  // Write authority top-100 sorted set (score = source_ref_id as proxy)
  console.log('\n  Step 8: Writing authority:top sorted set (1h TTL)...');
  await redis.del('ace:authority:top');
  const topRows = rows
    .filter(r => r.source_kind === 'source' && r.id)
    .sort((a, b) => (parseFloat(b.behavior_score) || 0) - (parseFloat(a.behavior_score) || 0))
    .slice(0, 100);
  if (topRows.length > 0) {
    await redis.zadd('ace:authority:top', ...topRows.flatMap(r => [
      parseFloat(r.behavior_score) || 0,
      String(r.id)
    ]));
    await redis.expire('ace:authority:top', TTL_AUTHORITY);
  }
  console.log(`  ✅ ${topRows.length} entries in ace:authority:top`);

  // Metadata key
  await redis.set('ace:meta:last_warm', JSON.stringify({
    timestamp: new Date().toISOString(),
    lod0: lod0Count,
    lod1: lod1Count,
    lod2: lod2Count,
    features: dict.feature_count,
    tags: dict.tag_count,
    sources: dict.source_count,
  }), 'EX', 86400 * 7);

  redis.disconnect();

  console.log('\n══ Results ════════════════════════════════════════════════');
  console.log(`  LOD0 keys:     ${lod0Count}  (ace:source:*:lod0,  1h TTL)`);
  console.log(`  LOD1 keys:     ${lod1Count}  (ace:source:*:lod1, 24h TTL)`);
  console.log(`  LOD2 pointers: ${lod2Count}  (ace:source:*:lod2, 48h TTL)`);
  console.log(`  Qdrant ptrs:   ${qdrantCount} (ace:source:*:qdrant)`);
  console.log(`  Dict keys:     6  (ace:dict:*, 7d TTL)`);
  console.log(`  Lane indexes:  ${Object.keys(laneIndex).length}  (ace:index:lane:*)`);
  console.log(`  Feature idx:   ${featureEntries.length} (ace:index:feature:*)`);
  console.log(`  Authority top: ${topRows.length}  (ace:authority:top)`);
  console.log('\n  ✅ Redis LOD hot cache warmed.');
  console.log('     Verify: redis-cli get ace:source:1:lod0');
  console.log('     Verify: redis-cli hgetall ace:dict:tags (if stored as hash)');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
