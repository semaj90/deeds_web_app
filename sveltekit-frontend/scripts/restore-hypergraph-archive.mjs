#!/usr/bin/env node
/**
 * restore-hypergraph-archive.mjs
 *
 * Restore hypergraph_edges from the Redis archive that seed-hypergraph-edges.mjs
 * snapshots before every run. Avoids re-running the AST+GPU+qdrant_cluster_members
 * upstream pipeline (>20 min) when an edge set is lost or corrupted.
 *
 * Use cases:
 *   - Operator deletes orphan edges by accident
 *   - Cleanup query removes too much
 *   - Migration goes wrong and edges are lost
 *   - Need to compare today's seed against yesterday's snapshot
 *
 * Recovery flow:
 *   1. List available archives (default behavior)
 *   2. Inspect specific archive contents
 *   3. Restore selected archive (UPSERT, no destructive overwrite of newer rows)
 *
 * Usage:
 *   node scripts/restore-hypergraph-archive.mjs                   # list archives
 *   node scripts/restore-hypergraph-archive.mjs --inspect 2026-05-08
 *   node scripts/restore-hypergraph-archive.mjs --restore 2026-05-08 --dry-run
 *   node scripts/restore-hypergraph-archive.mjs --restore 2026-05-08 --apply
 *
 * Idempotent: ON CONFLICT (edge_hash) DO UPDATE so re-running just refreshes
 * existing rows. Members are NOT touched — operator should follow up with
 * `npm run seed:hypergraph --force` to rebuild member rows from current data.
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args   = process.argv.slice(2);
const APPLY  = args.includes('--apply');
const DRY    = !APPLY;
const argVal = (name) => {
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
};
const RESTORE_DAY = argVal('--restore');
const INSPECT_DAY = argVal('--inspect');

const DB_URL    = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

console.log(`\n📦 Hypergraph archive restore${DRY ? ' [DRY]' : ''}`);

const { default: Redis } = await import('ioredis');
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
await redis.connect();

try {
  // 1. List mode (default) — show all available archives
  if (!RESTORE_DAY && !INSPECT_DAY) {
    const keys = await redis.keys('hypergraph:edges:archive:*');
    const dayKeys = keys.filter(k => !k.endsWith(':meta')).sort().reverse();
    if (dayKeys.length === 0) {
      console.log('\n   No archives found. The seeder writes one on every run.');
      console.log('   Run: npm run seed:hypergraph\n');
      process.exit(0);
    }
    console.log(`\n   Available archives (newest first):\n`);
    for (const k of dayKeys) {
      const day  = k.split(':').pop();
      const n    = await redis.hlen(k);
      const ttl  = await redis.ttl(k);
      const meta = await redis.get(`${k}:meta`).catch(() => null);
      const m    = meta ? JSON.parse(meta) : null;
      const ttlD = ttl > 0 ? `${Math.round(ttl / 86400)}d` : 'expired';
      console.log(`   ${day}  ${String(n).padStart(4)} edges  TTL=${ttlD}${m?.archived_at ? `  archived=${m.archived_at.slice(0, 19)}` : ''}`);
    }
    console.log(`\n   Inspect:  node scripts/restore-hypergraph-archive.mjs --inspect <day>`);
    console.log(`   Restore:  node scripts/restore-hypergraph-archive.mjs --restore <day> --apply\n`);
    process.exit(0);
  }

  const day = INSPECT_DAY ?? RESTORE_DAY;
  const key = `hypergraph:edges:archive:${day}`;
  const n   = await redis.hlen(key);
  if (n === 0) {
    console.error(`❌ archive ${key} not found or empty`);
    process.exit(1);
  }

  // 2. Inspect mode — show what's in the archive
  if (INSPECT_DAY) {
    const fields = await redis.hgetall(key);
    const edges  = Object.values(fields).map(s => JSON.parse(s));
    console.log(`\n   ${key}: ${edges.length} edges\n`);
    const byType = {};
    for (const e of edges) byType[e.edge_type] = (byType[e.edge_type] ?? 0) + 1;
    console.log('   By edge_type:');
    for (const [t, c] of Object.entries(byType)) console.log(`     ${t.padEnd(20)} ${c}`);
    console.log('\n   First 5 edges:');
    for (const e of edges.slice(0, 5)) {
      console.log(`     ${e.label?.padEnd(10) ?? '?'.padEnd(10)} type=${e.edge_type} members=${e.member_ids?.length ?? 0} run=${e.run_id?.slice(0, 8) ?? '—'}`);
    }
    console.log();
    process.exit(0);
  }

  // 3. Restore mode — UPSERT every archived edge into hypergraph_edges
  const pool   = new pg.Pool({ connectionString: DB_URL, max: 4 });
  const fields = await redis.hgetall(key);
  const edges  = Object.values(fields).map(s => JSON.parse(s));
  console.log(`\n   ${key}: ${edges.length} edges to restore${DRY ? ' (dry-run)' : ''}\n`);

  if (DRY) {
    console.log('   [dry] Would UPSERT each edge by edge_hash. Existing rows with the');
    console.log('   [dry] same edge_hash get their fields updated; new rows get inserted.');
    console.log('   [dry] hypergraph_edge_members is NOT touched — re-run seed:hypergraph');
    console.log('   [dry] --force after restore to rebuild members from current data.\n');
    console.log(`   Re-run with --apply to write.`);
    await pool.end();
    process.exit(0);
  }

  let restored = 0, updated = 0;
  for (const e of edges) {
    const r = await pool.query(
      `INSERT INTO hypergraph_edges (
         edge_hash, edge_type, member_ids, title, summary,
         grade_label, grade_score, gpu_cluster, som_cluster, som_cell,
         manifold4, topo_class, weight, run_id, label, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
       ON CONFLICT (edge_hash) DO UPDATE SET
         title       = EXCLUDED.title,
         summary     = EXCLUDED.summary,
         som_cluster = EXCLUDED.som_cluster,
         som_cell    = EXCLUDED.som_cell,
         manifold4   = EXCLUDED.manifold4,
         topo_class  = EXCLUDED.topo_class,
         weight      = EXCLUDED.weight,
         updated_at  = now()
       RETURNING (xmax = 0) AS was_inserted`,
      [
        e.edge_hash, e.edge_type, e.member_ids, e.title, e.summary,
        e.grade_label, e.grade_score, e.gpu_cluster, e.som_cluster, e.som_cell,
        e.manifold4, e.topo_class, e.weight, e.run_id, e.label,
        JSON.stringify(e.metadata ?? {}),
      ],
    );
    if (r.rows[0]?.was_inserted) restored++; else updated++;
  }

  console.log(`   ✓ restored: ${restored}  (new rows)`);
  console.log(`   ✓ updated:  ${updated}   (existing rows refreshed)`);
  console.log(`\n   Next: npm run seed:hypergraph -- --force   # rebuild member rows\n`);
  await pool.end();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
} finally {
  await redis.quit().catch(() => {});
}
