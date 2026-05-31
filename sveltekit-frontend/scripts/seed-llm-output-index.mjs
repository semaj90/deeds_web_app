#!/usr/bin/env node
/**
 * Seeds code:llm_output:* (Redis) and optionally code_llm_index (Postgres)
 * from existing wiki notes.
 *
 * For every Redis wiki note with gemma4Summary, write an entry into the
 * code-path LLM-output index so the graph viewer can populate per-cluster
 * hit badges and the hottest-paths panel without waiting for ACE traffic.
 *
 * Flags:
 *   --postgres    Also UPSERT into Postgres code_llm_index (durable mirror)
 *   --no-redis    Skip Redis (postgres-only refresh)
 *
 * Idempotent — re-running just refreshes TTLs and bumps refreshed_at.
 */
import Redis from 'ioredis';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.resolve(__dirname, '..', '.env');

// Load .env so DATABASE_URL is available outside of SvelteKit
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const WITH_PG  = args.includes('--postgres');
const NO_REDIS = args.includes('--no-redis');

const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const TTL = 6 * 60 * 60;

const r = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
await r.ping();

// Build dir → { clusterId, somRow, somCol } map from graph JSON files
const GRAPH_JSON     = path.resolve(__dirname, '..', 'docs', 'graph', 'codebase-graph.json');
const HYPER_CLUSTERS = path.resolve(__dirname, '..', 'docs', 'graph', 'hypergraph-clusters.json');
const dirMeta = new Map();

if (existsSync(GRAPH_JSON)) {
  try {
    const g = JSON.parse(readFileSync(GRAPH_JSON, 'utf8'));
    const dirHits = {};
    for (const f of g.files ?? []) {
      if (!f.rel || f.clusterId === undefined || f.clusterId < 0) continue;
      const dir = f.rel.includes('/') ? f.rel.split('/').slice(0, -1).join('/') : '.';
      const slot = (dirHits[dir] ??= { counts: {}, somRow: null, somCol: null });
      slot.counts[f.clusterId] = (slot.counts[f.clusterId] ?? 0) + 1;
      if (slot.somRow === null && f.somBmuRow !== undefined) {
        slot.somRow = f.somBmuRow;
        slot.somCol = f.somBmuCol;
      }
    }
    for (const [dir, slot] of Object.entries(dirHits)) {
      const top = Object.entries(slot.counts).sort((a, b) => b[1] - a[1])[0];
      dirMeta.set(dir.toLowerCase(), {
        clusterId: parseInt(top[0], 10),
        somRow:    slot.somRow,
        somCol:    slot.somCol,
      });
    }
    console.log(`✓ Loaded cluster + SOM metadata for ${dirMeta.size} directories from codebase-graph.json`);
  } catch (err) {
    console.warn(`  could not parse codebase-graph.json: ${err.message}`);
  }
}

let pool = null;
if (WITH_PG) {
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  await pool.query('SELECT 1');
  console.log('✓ Postgres connected');
}

const keys = await r.keys('wiki:note:dir:*');
console.log(`Found ${keys.length} wiki notes (postgres=${WITH_PG}, redis=${!NO_REDIS})`);

let seededRedis = 0, seededPg = 0, skipped = 0;
const clusterPipe = r.pipeline();

for (const k of keys) {
  const keyType = await r.type(k);
  let v = null;
  if (keyType === 'none') {
    skipped++;
    continue;
  }
  try {
    if (keyType === 'string') {
      v = await r.get(k);
    } else if (keyType === 'hash') {
      const obj = await r.hgetall(k);
      v = JSON.stringify(obj);
    } else if (keyType === 'list') {
      const arr = await r.lrange(k, 0, -1);
      v = JSON.stringify(arr);
    } else if (keyType === 'set') {
      const arr = await r.smembers(k);
      v = JSON.stringify(arr);
    } else if (keyType === 'zset') {
      const arr = await r.zrange(k, 0, -1);
      v = JSON.stringify(arr);
    } else {
      console.warn('[seed-llm-output-index] skipping unsupported key type', { key: k, keyType });
      skipped++;
      continue;
    }
  } catch (err) {
    console.warn('[seed-llm-output-index] redis read error', { key: k, keyType, err: err.message });
    skipped++;
    continue;
  }
  if (!v) { skipped++; continue; }
  if (!v) { skipped++; continue; }
  let note;
  try { note = JSON.parse(v); } catch { skipped++; continue; }
  // Prefer gemma4Summary, fall back to generic summary/purpose text if present.
  const llmOutput = note.gemma4Summary ?? note.summary ?? note.purpose ?? null;
  if (!llmOutput) { skipped++; continue; }

  // Determine a directory path; fall back to known note fields or the redis key when absent.
  const rawPath = note.directoryPath ?? note.path ?? note.directory ?? k.replace(/^wiki:note:dir:/, '');
  const path = String(rawPath).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  const hash = createHash('sha1').update(path).digest('hex').slice(0, 16);
  const now  = Date.now();
  const meta = dirMeta.get(path) ?? null;
  const cid  = meta?.clusterId ?? (typeof note.clusterId === 'number' && note.clusterId >= 0 ? note.clusterId : null);
  const somRow = meta?.somRow ?? null;
  const somCol = meta?.somCol ?? null;

  if (!NO_REDIS) {
    const entry = {
      path,
      pathHash: hash,
      isDir: true,
      llmOutput: llmOutput,
      source: note.gemma4Summary
        ? 'gemma4-summary'
        : note.summary
          ? 'note-summary'
          : 'note-purpose',
      glyphClusterId: cid ?? undefined,
      generatedAt: note.summaryUpdatedAt ?? new Date(now).toISOString(),
      hitCount: 0,
      lastHitMs: now,
      embedded: false,
    };
    await r.set(`code:llm_output:path:${hash}`, JSON.stringify(entry), 'EX', TTL);
    await r.zadd('code:llm_output:recent', now, hash);
    if (cid !== null) clusterPipe.sadd(`code:llm_output:by-cluster:${cid}`, hash);
    seededRedis++;
  }

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO code_llm_index (
           path_hash, path, is_dir, llm_output, source,
           glyph_cluster_id, som_bmu_row, som_bmu_col,
           hit_count, generated_at, last_hit_at, refreshed_at
         ) VALUES ($1, $2, true, $3, 'gemma4-summary', $4, $5, $6, 0, $7, to_timestamp($8), now())
         -- $5/$6 from dirMeta (codebase-graph.json), $4 from wiki note clusterId fallback
         ON CONFLICT (path_hash) DO UPDATE SET
           llm_output       = EXCLUDED.llm_output,
           glyph_cluster_id = EXCLUDED.glyph_cluster_id,
           som_bmu_row      = COALESCE(EXCLUDED.som_bmu_row, code_llm_index.som_bmu_row),
           som_bmu_col      = COALESCE(EXCLUDED.som_bmu_col, code_llm_index.som_bmu_col),
           refreshed_at     = now()`,
        [
          hash,
          path,
          llmOutput,
          cid,
          somRow,
          somCol,
          note.summaryUpdatedAt ?? new Date(now).toISOString(),
          now / 1000,
        ]
      );
      seededPg++;
    } catch (err) {
      // First failure is informative, the rest get suppressed
      if (seededPg === 0) console.warn(`  postgres insert failed: ${err.message}`);
    }
  }
}

if (!NO_REDIS) await clusterPipe.exec();

const clusterKeys = await r.keys('code:llm_output:by-cluster:*');
console.log(`✓ Redis seeded ${seededRedis} · Postgres seeded ${seededPg} · skipped ${skipped} · ${clusterKeys.length} clusters populated`);

await r.quit();
if (pool) await pool.end();
