#!/usr/bin/env node
/**
 * seed-hypergraph-edges-lane-b.mjs
 *
 * Lane B — shared-resource edges from `code_relations`.
 * Files that all touch the SAME runtime resource (Postgres table, Qdrant
 * collection, Redis key, Neo4j label) form a hyperedge. This is the
 * dependency-coupling lane; Lane A is the cluster-cohesion lane (already
 * seeded from qdrant_cluster_members → cluster_context).
 *
 * Edge type: 'shared_resource'  (added to EDGE_TYPE_VALUES in
 * src/routes/api/hypergraph/search/+server.ts so MCP+API can filter by it).
 *
 * Resource kinds covered (relation_type filter):
 *   - QUERIES_TABLE             → kind = "table"
 *   - QUERIES_QDRANT_COLLECTION → kind = "qdrant_collection"
 *   - READS_REDIS_KEY           → kind = "redis_read"
 *   - WRITES_REDIS_KEY          → kind = "redis_write"
 *   - QUERIES_NEO4J_LABEL       → kind = "neo4j_label"
 *
 * EXPORTS_SYMBOL is intentionally excluded — symbol-export edges are too
 * granular (7966 rows) and dilute the operational signal. Add a separate
 * lane for them if symbol-level coupling becomes a target.
 *
 * Pre-run defensive Redis archive (same pattern as Lane A): every existing
 * hypergraph_edges row is snapshotted to hypergraph:edges:archive:{day} with
 * 30-day TTL before any mutation, so a botched run can be restored without
 * re-running AST + GPU upstream (>20 min).
 *
 * edge_hash convention: sha256('shared_resource:' + kind + ':' + target_key
 *                              + ':' + sorted_member_files.join('|'))
 * — deterministic, ON CONFLICT (edge_hash) DO UPDATE keeps re-runs cheap.
 *
 * Usage:
 *   node scripts/seed-hypergraph-edges-lane-b.mjs --dry-run
 *   node scripts/seed-hypergraph-edges-lane-b.mjs --apply
 *   node scripts/seed-hypergraph-edges-lane-b.mjs --apply --min-members 5 --limit 100
 */
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args   = process.argv.slice(2);
const APPLY  = args.includes('--apply');
const DRY    = !APPLY;
const intArg = (name, def) => {
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return parseInt(eq.split('=')[1], 10) || def;
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10) || def;
  return def;
};
const MIN_MEMBERS = intArg('--min-members', 3);
const MAX_MEMBERS = intArg('--max-members', 500);
const LIMIT       = intArg('--limit', 9999);

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const pool   = new pg.Pool({ connectionString: DB_URL, max: 4 });
const RUN_ID = randomUUID();

console.log(`\n🔗 Hypergraph edge seeder — Lane B (shared resources)${DRY ? ' [DRY]' : ''}`);
console.log(`   min_members=${MIN_MEMBERS}  max_members=${MAX_MEMBERS}  limit=${LIMIT}`);
console.log(`   run_id=${RUN_ID}\n`);

const RELATION_TO_KIND = {
  QUERIES_TABLE:             'table',
  QUERIES_QDRANT_COLLECTION: 'qdrant_collection',
  READS_REDIS_KEY:           'redis_read',
  WRITES_REDIS_KEY:          'redis_write',
  QUERIES_NEO4J_LABEL:       'neo4j_label',
};

function gradeFor(n) {
  if (n >= 25) return { label: 'A', score: 0.95 };
  if (n >= 12) return { label: 'B', score: 0.78 };
  if (n >= 6)  return { label: 'C', score: 0.55 };
  return         { label: 'D', score: 0.32 };
}

function edgeHash(kind, targetKey, memberKeys) {
  const sorted = [...memberKeys].sort().join('|');
  return createHash('sha256')
    .update(`shared_resource:${kind}:${targetKey}:${sorted}`)
    .digest('hex').slice(0, 64);
}

async function snapshotToRedis(pool) {
  let Redis;
  try { ({ default: Redis } = await import('ioredis')); } catch { return null; }
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    const day = new Date().toISOString().slice(0, 10);
    const key = `hypergraph:edges:archive:${day}`;
    const { rows } = await pool.query(
      `SELECT id, edge_hash, edge_type, member_ids, title, summary,
              grade_label, grade_score, gpu_cluster, som_cluster, som_cell,
              manifold4, topo_class, weight, run_id, label, metadata
       FROM hypergraph_edges`,
    );
    if (rows.length === 0) { await redis.quit(); return { archived: 0, key }; }
    const pipe = redis.pipeline();
    pipe.del(key);
    for (const r of rows) pipe.hset(key, r.edge_hash, JSON.stringify(r));
    pipe.expire(key, 30 * 24 * 3600);
    pipe.set(`${key}:meta`,
             JSON.stringify({ archived_at: new Date().toISOString(), edges: rows.length }),
             'EX', 30 * 24 * 3600);
    await pipe.exec();
    return { archived: rows.length, key };
  } catch {
    return null;
  } finally {
    await redis.quit().catch(() => {});
  }
}

async function main() {
  if (!DRY) {
    const snap = await snapshotToRedis(pool);
    if (snap) console.log(`   📦 archived ${snap.archived} edges → ${snap.key} (30d TTL)\n`);
    else      console.log(`   ⚠ snapshot skipped (Redis unavailable) — proceeding\n`);
  }

  const { rows: groups } = await pool.query(
    `SELECT relation_type,
            target_key,
            count(DISTINCT source_file)                                 AS n_files,
            array_agg(DISTINCT source_file ORDER BY source_file)        AS members
       FROM code_relations
      WHERE relation_type = ANY($1)
      GROUP BY relation_type, target_key
     HAVING count(DISTINCT source_file) BETWEEN $2 AND $3
      ORDER BY count(DISTINCT source_file) DESC
      LIMIT $4`,
    [Object.keys(RELATION_TO_KIND), MIN_MEMBERS, MAX_MEMBERS, LIMIT],
  );
  console.log(`   ${groups.length} resource group(s) eligible (size ${MIN_MEMBERS}-${MAX_MEMBERS})\n`);

  let inserted = 0, updated = 0, skipped = 0, totalMembers = 0;
  let membersRewritten = 0, membersUnchanged = 0;
  const byKind = {};

  for (const g of groups) {
    const memberKeys = (g.members ?? []).filter(Boolean);
    if (memberKeys.length < MIN_MEMBERS) { skipped++; continue; }

    const kind   = RELATION_TO_KIND[g.relation_type];
    const grade  = gradeFor(memberKeys.length);
    const hash   = edgeHash(kind, g.target_key, memberKeys);
    const label  = `${kind}:${g.target_key}`;
    const title  = `Files sharing ${kind} ${g.target_key} (${memberKeys.length})`;
    const top3   = memberKeys.slice(0, 3).map(m => m.split('/').pop()).join(', ');
    const summary = `${memberKeys.length} files all access ${kind} \`${g.target_key}\`. Top: ${top3}`;
    const weight = Math.min(1, Math.log(memberKeys.length) / Math.log(40));
    byKind[kind] = (byKind[kind] ?? 0) + 1;

    if (DRY) {
      console.log(`   [dry] ${kind.padEnd(18)} ${g.target_key.slice(0, 28).padEnd(28)} n=${String(memberKeys.length).padStart(3)} grade=${grade.label} hash=${hash.slice(0,8)}…`);
      inserted++;
      totalMembers += memberKeys.length;
      continue;
    }

    const { rows: edgeRows, rowCount } = await pool.query(
      `INSERT INTO hypergraph_edges (
         edge_hash, edge_type, member_ids, title, summary,
         grade_label, grade_score, confidence, source,
         weight, run_id, label, metadata
       ) VALUES ($1, 'shared_resource', $2, $3, $4, $5, $6, 0.80, 'code_relations',
                 $7, $8, $9, $10::jsonb)
       ON CONFLICT (edge_hash) DO UPDATE SET
         member_ids  = EXCLUDED.member_ids,
         title       = EXCLUDED.title,
         summary     = EXCLUDED.summary,
         grade_label = EXCLUDED.grade_label,
         grade_score = EXCLUDED.grade_score,
         weight      = EXCLUDED.weight,
         run_id      = EXCLUDED.run_id,
         updated_at  = now()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        hash, memberKeys, title, summary,
        grade.label, grade.score,
        weight, RUN_ID, label,
        JSON.stringify({
          source:      'code_relations',
          kind,
          target_key:  g.target_key,
          n_members:   memberKeys.length,
          run_id:      RUN_ID,
        }),
      ],
    );
    if (rowCount === 0) { skipped++; continue; }
    const edgeId = edgeRows[0].id;
    if (edgeRows[0].was_inserted) inserted++; else updated++;

    if (!edgeRows[0].was_inserted) {
      const { rows: [{ existing_n }] } = await pool.query(
        'SELECT count(*)::int AS existing_n FROM hypergraph_edge_members WHERE edge_id = $1',
        [edgeId],
      );
      if (existing_n === memberKeys.length) {
        totalMembers     += memberKeys.length;
        membersUnchanged += memberKeys.length;
        continue;
      }
    }

    await pool.query('DELETE FROM hypergraph_edge_members WHERE edge_id = $1', [edgeId]);
    const memberScore  = 1 / Math.sqrt(memberKeys.length);
    const memberValues = memberKeys
      .map((_, i) => `($1, 'file', $${i + 2}, 'shared_resource_member', $${memberKeys.length + 2})`)
      .join(', ');
    await pool.query(
      `INSERT INTO hypergraph_edge_members (edge_id, member_kind, member_key, role, score)
       VALUES ${memberValues}`,
      [edgeId, ...memberKeys, memberScore],
    );
    totalMembers     += memberKeys.length;
    membersRewritten += memberKeys.length;
  }

  console.log(`\n   inserted:           ${inserted}`);
  console.log(`   updated:            ${updated}`);
  console.log(`   skipped:            ${skipped}`);
  console.log(`   members rewritten:  ${membersRewritten}  (DELETE+INSERT executed)`);
  console.log(`   members unchanged:  ${membersUnchanged}  (skipped via edge_hash + count match)`);
  console.log(`   total members:      ${totalMembers}`);
  console.log(`   by kind:           `, byKind);

  if (!DRY) {
    const { rows: counts } = await pool.query(
      `SELECT
         (SELECT count(*) FROM hypergraph_edges WHERE edge_type = 'shared_resource') AS edges,
         (SELECT count(*) FROM hypergraph_edge_members hem
          JOIN hypergraph_edges he ON he.id = hem.edge_id
          WHERE he.edge_type = 'shared_resource') AS members`,
    );
    console.log(`\n   DB state: ${counts[0].edges} shared_resource edges, ${counts[0].members} member rows`);
  }

  await pool.end();
  console.log(`\n${DRY ? '🔍 Dry-run complete — re-run with --apply to write.' : '✅ Lane B seeder complete.'}\n`);
}

main().catch(async err => {
  console.error('❌ Seeder failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
