#!/usr/bin/env node
/**
 * run-authority-scores.mjs
 *
 * Populates Redis `ace:authority:top` HASH from the latest GDS artifact
 * (memory/graphify/gds/latest.json). This is the lightweight re-publish step
 * that runs after graphify:daily so ACE context assembly can read authority
 * scores in O(1) without re-running the full GDS pipeline.
 *
 * Falls back to Postgres `code_retrieval_chunks.graph_authority_score` if the
 * GDS artifact is absent or stale (>25h).
 *
 * ace:authority:top layout:
 *   HSET ace:authority:top  <file_path>  <JSON>
 *   where file_path = 'lib/server/db/client.ts' (no src/ prefix, no abs path)
 *   and JSON = { graphAuthorityScore, communityId, pagerank, topoClass }
 *   TTL: 6h (21600s)
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const DRY       = process.argv.includes('--dry-run');
const HASH_KEY  = 'ace:authority:top';
const TTL       = 21600; // 6h
const TOP_N     = 200;

// ── .env loader — npm scripts don't auto-source .env ──────────────────────────
for (const envFile of [join(ROOT, '.env'), join(ROOT, '..', '.env')]) {
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}

const REDIS_HOST     = process.env.REDIS_HOST     ?? '127.0.0.1';
const REDIS_PORT     = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined;
function redisOpts(extra = {}) {
  return { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD, ...extra };
}
const PG_URL     = process.env.DATABASE_URL    ?? null;

// ── helpers ────────────────────────────────────────────────────────────────────

function normalisePath(raw) {
  if (!raw) return null;
  // strip absolute prefix up to sveltekit-frontend/src/ or sveltekit-frontend/
  let p = raw.replace(/\\/g, '/');
  const marker = 'sveltekit-frontend/src/';
  const idx = p.indexOf(marker);
  if (idx !== -1) return p.slice(idx + marker.length);
  const marker2 = 'sveltekit-frontend/';
  const idx2 = p.indexOf(marker2);
  if (idx2 !== -1) {
    const rel = p.slice(idx2 + marker2.length);
    return rel.startsWith('src/') ? rel.slice(4) : rel;
  }
  // already relative — strip leading src/
  return p.startsWith('src/') ? p.slice(4) : p;
}

// ── 1. load GDS artifact ───────────────────────────────────────────────────────

async function loadFromGdsArtifact() {
  const latestPath = join(ROOT, 'memory', 'graphify', 'gds', 'latest.json');
  if (!existsSync(latestPath)) return null;

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }

  // warn if older than 25h but still use — GDS isn't re-run on every graphify:daily
  if (artifact.finishedAt) {
    const ageH = (Date.now() - new Date(artifact.finishedAt).getTime()) / 3600000;
    if (ageH > 25) console.log(`[authority] GDS artifact is ${ageH.toFixed(0)}h old — using anyway (re-run graphify:gds to refresh)`);
  }

  const topAuthorities = artifact.topAuthorities;
  if (!Array.isArray(topAuthorities) || topAuthorities.length === 0) return null;

  const entries = [];
  for (const entry of topAuthorities) {
    const fp = normalisePath(entry.filePath ?? entry.file_path ?? entry.stableKey ?? entry.stable_key);
    if (!fp) continue;
    entries.push({
      filePath:            fp,
      graphAuthorityScore: entry.graphAuthorityScore ?? entry.authority_score ?? null,
      communityId:         entry.communityId ?? entry.community_id ?? null,
      pagerank:            entry.pagerank ?? null,
      topoClass:           entry.topoClass ?? entry.topo_class ?? null,
    });
  }
  return entries.slice(0, TOP_N);
}

// ── 2. Postgres fallback ───────────────────────────────────────────────────────

async function loadFromPostgres() {
  if (!PG_URL) return null;
  let pg;
  try {
    const { default: pgPkg } = await import('pg');
    const Pool = pgPkg.Pool ?? pgPkg.default?.Pool;
    if (!Pool) return null;
    pg = new Pool({ connectionString: PG_URL, max: 1, statement_timeout: 5000 });

    // Try atlas_packets first (has pagerank + community_id from Phase 20 topology pass)
    try {
      const res = await pg.query(`
        SELECT DISTINCT ON (file_path)
               file_path,
               pagerank          AS ga,
               community_id,
               som_cluster       AS topo_class
        FROM   atlas_packets
        WHERE  pagerank IS NOT NULL
           AND file_path IS NOT NULL
        ORDER  BY file_path, pagerank DESC NULLS LAST
        LIMIT  $1
      `, [TOP_N]);
      if (res.rows.length > 0) {
        const entries = res.rows.map(r => ({
          filePath:            normalisePath(r.file_path),
          graphAuthorityScore: parseFloat(r.ga) || null,
          communityId:         r.community_id ?? null,
          pagerank:            parseFloat(r.ga) || null,
          topoClass:           r.topo_class ?? null,
        })).filter(e => e.filePath);
        await pg.end();
        return entries.length ? entries : null;
      }
    } catch {
      // atlas_packets not available — fall through to code_retrieval_chunks
    }

    // Fallback: code_retrieval_chunks (no community_id column)
    const res = await pg.query(`
      SELECT file_path,
             max(graph_authority_score) AS ga,
             max(topo_class)            AS topo_class
      FROM   code_retrieval_chunks
      WHERE  graph_authority_score IS NOT NULL
      GROUP  BY file_path
      ORDER  BY max(graph_authority_score) DESC NULLS LAST
      LIMIT  $1
    `, [TOP_N]);
    const entries = res.rows.map(r => ({
      filePath:            normalisePath(r.file_path),
      graphAuthorityScore: parseFloat(r.ga) || null,
      communityId:         null,
      pagerank:            null,
      topoClass:           r.topo_class ?? null,
    })).filter(e => e.filePath);
    await pg.end();
    return entries.length ? entries : null;
  } catch (err) {
    console.warn('[authority] Postgres fallback failed:', err.message);
    if (pg) await pg.end().catch(() => {});
    return null;
  }
}

// ── 3. write to Redis ──────────────────────────────────────────────────────────

async function writeToRedis(entries) {
  const { Redis } = await import('ioredis');
  const redis = new Redis(redisOpts({
    lazyConnect:          true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   false,
    retryStrategy:        () => null,
  }));
  redis.on('error', () => {});

  try {
    await redis.connect();
    await redis.ping();

    const pipe = redis.pipeline();
    for (const entry of entries) {
      const value = JSON.stringify({
        graphAuthorityScore: entry.graphAuthorityScore,
        communityId:         entry.communityId,
        pagerank:            entry.pagerank,
        topoClass:           entry.topoClass,
      });
      pipe.hset(HASH_KEY, entry.filePath, value);
    }
    pipe.expire(HASH_KEY, TTL);
    await pipe.exec();
    return entries.length;
  } catch (err) {
    console.warn('[authority] Redis unavailable:', err.message);
    return 0;
  } finally {
    try { await redis.quit(); } catch { /* ignore — connection may already be closed */ }
  }
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Authority Scores → Redis ${DRY ? '(dry-run)' : ''} ===`);

  let entries = await loadFromGdsArtifact();
  const source = entries ? 'gds-artifact' : 'postgres';

  if (!entries) {
    console.log('[authority] Falling back to Postgres...');
    entries = await loadFromPostgres();
  }

  if (!entries || entries.length === 0) {
    console.warn('[authority] No authority scores found (Neo4j GDS not yet run + Postgres empty). Skipping.');
    console.log('[authority] Run `npm run graphify:gds` to populate authority scores.');
    process.exit(0);
  }

  console.log(`[authority] Loaded ${entries.length} entries from ${source}`);

  if (DRY) {
    console.log('[authority] Dry-run — sample entries:');
    for (const e of entries.slice(0, 5)) {
      console.log(`  ${e.filePath}  score=${e.graphAuthorityScore}  community=${e.communityId}`);
    }
    console.log(`[authority] Would write ${entries.length} entries to Redis ${HASH_KEY} (TTL ${TTL}s)`);
    return;
  }

  const written = await writeToRedis(entries);
  if (written > 0) {
    console.log(`[authority] Written ${written} entries to Redis ace:authority:top (TTL ${TTL}s)`);
  } else {
    console.warn('[authority] Redis write failed — ace:authority:top not updated');
  }

  console.log('=== Done ===');
}

main().catch(err => {
  console.error('[authority] Fatal:', err.message);
  process.exit(0); // non-fatal for pipeline — graphify:daily continues
});
