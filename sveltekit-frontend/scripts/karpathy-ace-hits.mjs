#!/usr/bin/env node
/**
 * karpathy-ace-hits.mjs
 *
 * Reads the chunk_hit_log (Postgres) and cross-references with
 * gpu:karpathy:scores (Redis) to answer: "Are Karpathy high-authority
 * files actually the ones ACE is retrieving?"
 *
 * Writes:
 *   - Redis hash  ace:karpathy:hit_report   (current run stats, 6h TTL)
 *   - Redis stream gpu:karpathy:run_log      (XADD hit-report entry)
 *   - File logs/task-output/pipeline-test/karpathy-ace-hits-<ts>.json
 *   - Stdout: hit-rate table (top files, lane distribution, coverage)
 *
 * Usage:
 *   node scripts/karpathy-ace-hits.mjs
 *   node scripts/karpathy-ace-hits.mjs --hours 2     # last 2h of ACE hits
 *   node scripts/karpathy-ace-hits.mjs --dry-run     # read-only, no Redis writes
 *   node scripts/karpathy-ace-hits.mjs --json        # JSON output to stdout
 *
 * What "hit" means:
 *   A file is a "Karpathy hit" when it appears in chunk_hit_log (ACE retrieved
 *   it) AND appears in gpu:karpathy:scores with blend > 0. A "miss" is a
 *   chunk_hit_log entry whose file is NOT in the Karpathy index yet.
 *   A "ghost" is a high-authority Karpathy file that ACE never retrieves
 *   (surfaced by this script so you can tune the retrieval lanes).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const LOG_DIR   = resolve(ROOT, 'logs/task-output/pipeline-test');
mkdirSync(LOG_DIR, { recursive: true });

const args    = process.argv.slice(2);
const DRY     = args.includes('--dry-run');
const JSON_OUT = args.includes('--json');
const HOURS   = parseInt(args.find(a => a.startsWith('--hours'))?.split(/[= ]/)[1] ?? '24', 10) || 24;

const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const QDRANT_URL   = process.env.QDRANT_URL   ?? 'http://localhost:6333';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const report = {
  runAt:     new Date().toISOString(),
  hours:     HOURS,
  hits:      0,
  misses:    0,
  ghosts:    0,
  hitRate:   0,
  topHitFiles:    [],
  topGhostFiles:  [],
  laneDistribution: {},
  status: 'running',
};

if (!DATABASE_URL) {
  console.error('[ace-hits] DATABASE_URL not set');
  process.exit(1);
}

const redis = new Redis(REDIS_URL, {
  lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 6000 });

try {
  await redis.connect();

  // ── 1. Load Karpathy scores from Redis ─────────────────────────────────────
  const allScores = await redis.hgetall('gpu:karpathy:scores');
  const karpathyFiles = new Map(); // filePath → { blend, pr, attn, authority }
  for (const [key, val] of Object.entries(allScores ?? {})) {
    try {
      karpathyFiles.set(key, JSON.parse(val));
    } catch { /* skip corrupt entry */ }
  }
  report.karpathyIndexSize = karpathyFiles.size;

  if (!JSON_OUT) {
    console.log(`\n📊 Karpathy ACE Hit-Rate Report (last ${HOURS}h)`);
    console.log(`   Karpathy index: ${karpathyFiles.size} files`);
  }

  // ── 2. Pull chunk hit log from Postgres (last N hours) ───────────────────
  const since = new Date(Date.now() - HOURS * 3_600_000).toISOString();
  let hitRows = [];
  try {
    const { rows } = await pool.query(`
      SELECT
        stable_key,
        pipeline,
        SUM(hit_count)::int AS hits,
        MAX(last_hit_at)    AS last_hit
      FROM chunk_hit_log
      WHERE last_hit_at >= $1
      GROUP BY stable_key, pipeline
      ORDER BY hits DESC
      LIMIT 500
    `, [since]);
    hitRows = rows;
  } catch (e) {
    // chunk_hit_log may not exist in older deployments
    if (e.message?.includes('does not exist')) {
      report.status = 'SKIP';
      report.reason = 'chunk_hit_log table not found — run graphify:full to create it';
      console.warn('[ace-hits] chunk_hit_log table missing — skipping');
    } else {
      throw e;
    }
  }
  report.aceChunkHits = hitRows.length;

  // ── 3. Cross-reference ────────────────────────────────────────────────────
  const hitsInKarpathy   = [];
  const missFiles        = [];     // in ACE log but not in Karpathy index

  for (const row of hitRows) {
    if (karpathyFiles.has(row.stable_key)) {
      hitsInKarpathy.push({
        file:      row.stable_key,
        aceHits:   row.hits,
        pipeline:  row.pipeline,
        ...karpathyFiles.get(row.stable_key),
      });
    } else {
      missFiles.push({ file: row.stable_key, aceHits: row.hits, pipeline: row.pipeline });
    }
  }

  // Ghosts = high-authority files ACE never retrieved
  const aceFileSet = new Set(hitRows.map(r => r.stable_key));
  const ghostFiles = [...karpathyFiles.entries()]
    .filter(([key]) => !aceFileSet.has(key))
    .map(([key, scores]) => ({ file: key, ...scores }))
    .sort((a, b) => b.blend - a.blend)
    .slice(0, 20);

  report.hits    = hitsInKarpathy.length;
  report.misses  = missFiles.length;
  report.ghosts  = ghostFiles.length;
  report.hitRate = hitRows.length > 0
    ? +(hitsInKarpathy.length / hitRows.length * 100).toFixed(1)
    : 0;

  report.topHitFiles = hitsInKarpathy
    .sort((a, b) => b.blend - a.blend)
    .slice(0, 15)
    .map(f => ({ file: f.file, blend: +f.blend.toFixed(3), aceHits: f.aceHits }));

  report.topGhostFiles = ghostFiles.slice(0, 10)
    .map(f => ({ file: f.file, blend: +f.blend.toFixed(3) }));

  // ── 4. Lane distribution from gpu:karpathy:by_lane ───────────────────────
  const byLaneRaw = await redis.hgetall('gpu:karpathy:by_lane');
  if (byLaneRaw) {
    const aceFileBlend = new Map(hitsInKarpathy.map(f => [f.file, f.blend]));
    for (const [lane, jsonStr] of Object.entries(byLaneRaw)) {
      try {
        const laneFiles = JSON.parse(jsonStr);
        const laneHits = laneFiles.filter(f => aceFileSet.has(f.file)).length;
        report.laneDistribution[lane] = {
          total: laneFiles.length,
          aceHits: laneHits,
          hitRate: laneFiles.length > 0
            ? +(laneHits / laneFiles.length * 100).toFixed(1)
            : 0,
          topBlend: +((laneFiles[0]?.blend ?? 0).toFixed(3)),
        };
      } catch { /* skip */ }
    }
  }

  // ── 5. Print report ───────────────────────────────────────────────────────
  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n   Hit rate:  ${report.hitRate}%  (${report.hits} hits / ${hitRows.length} ACE retrievals)`);
    console.log(`   Misses:    ${report.misses}  (in ACE log but not in Karpathy index)`);
    console.log(`   Ghosts:    ${report.ghosts}  (high-authority but never retrieved by ACE)`);

    if (report.topHitFiles.length) {
      console.log('\n   Top hit files (Karpathy authority × ACE frequency):');
      for (const f of report.topHitFiles.slice(0, 8)) {
        console.log(`     blend=${f.blend.toFixed(3)}  hits=${f.aceHits}  ${f.file}`);
      }
    }

    if (Object.keys(report.laneDistribution).length) {
      console.log('\n   Lane distribution:');
      for (const [lane, stat] of Object.entries(report.laneDistribution).sort()) {
        console.log(`     ${lane.padEnd(4)}  ${stat.aceHits}/${stat.total} ACE hits  (${stat.hitRate}%)`);
      }
    }

    if (report.topGhostFiles.length) {
      console.log('\n   Top ghost files (high blend, never retrieved — consider boosting these lanes):');
      for (const f of report.topGhostFiles.slice(0, 5)) {
        console.log(`     blend=${f.blend}  ${f.file}`);
      }
    }
    console.log('');
  }

  // ── 6. Write to Redis + stream ────────────────────────────────────────────
  if (!DRY) {
    await redis.hset('ace:karpathy:hit_report', {
      runAt:     report.runAt,
      hours:     String(HOURS),
      hitRate:   String(report.hitRate),
      hits:      String(report.hits),
      misses:    String(report.misses),
      ghosts:    String(report.ghosts),
      topHit:    report.topHitFiles[0]?.file ?? '',
      topGhost:  report.topGhostFiles[0]?.file ?? '',
      laneJson:  JSON.stringify(report.laneDistribution),
    });
    await redis.expire('ace:karpathy:hit_report', 6 * 3600);

    // Append to run_log stream alongside the GPU enrich entries
    await redis.xadd(
      'gpu:karpathy:run_log', 'MAXLEN', '~', '500', '*',
      'type',      'ace_hit_report',
      'runAt',     report.runAt,
      'hitRate',   String(report.hitRate),
      'hits',      String(report.hits),
      'misses',    String(report.misses),
      'ghosts',    String(report.ghosts),
    ).catch(() => {});
  }

  report.status = 'PASS';
} catch (err) {
  report.status = 'FAIL';
  report.error  = err.message;
  console.error('[ace-hits] ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await redis.quit().catch(() => {});
  await pool.end().catch(() => {});

  const out = JSON.stringify(report, null, 2);
  writeFileSync(resolve(LOG_DIR, `karpathy-ace-hits-${stamp}.json`), out);
  writeFileSync(resolve(LOG_DIR, 'karpathy-ace-hits-latest.json'), out);

  if (!JSON_OUT) {
    console.log(`[ace-hits] ${report.status}  hitRate=${report.hitRate}%  hits=${report.hits}  ghosts=${report.ghosts}`);
  }
}
