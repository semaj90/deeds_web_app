#!/usr/bin/env node
/**
 * seed-hypergraph-edges-lane-c.mjs
 *
 * Lane C — agents-context tag-neighborhood edges from
 * `agent_context_relations` where relation = 'SHARES_TAGS'.
 *
 * SHARES_TAGS is a pairwise edge between AGENTS.md scopes with a Jaccard
 * weight. Lane C lifts pairwise → hyperedge by computing approximate
 * connected components at weight ≥ THRESHOLD (one-pass min-of-neighbors
 * label propagation; cheap, deterministic, good enough for the agent's
 * tag-neighborhood retrieval signal).
 *
 * Edge type: 'agents_context'  (already in EDGE_TYPE_VALUES)
 *
 * Members: the AGENTS.md scope keys themselves (member_kind='agents_md').
 * The scopes resolve back to file sets via agent_context_files +
 * directory_context_bindings, so MCP tools that follow the hyperedge
 * land on directory context, not raw files — same retrieval surface as
 * the existing AGENTS.md spine.
 *
 * Pre-run defensive Redis archive (same pattern as Lanes A/B): every
 * existing hypergraph_edges row is snapshotted to
 * hypergraph:edges:archive:{day} with 30-day TTL before any mutation.
 *
 * edge_hash convention: sha256('agents_context:tag_neighborhood:'
 *                              + sorted_member_keys.join('|'))
 *
 * Usage:
 *   node scripts/seed-hypergraph-edges-lane-c.mjs --dry-run
 *   node scripts/seed-hypergraph-edges-lane-c.mjs --apply
 *   node scripts/seed-hypergraph-edges-lane-c.mjs --apply --threshold 0.5 --min-members 4
 */
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY   = !APPLY;
const numArg = (name, def) => {
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return parseFloat(eq.split('=')[1]) || def;
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return parseFloat(args[idx + 1]) || def;
  return def;
};
const THRESHOLD   = numArg('--threshold', 0.4);
const MIN_MEMBERS = numArg('--min-members', 3);
const MAX_MEMBERS = numArg('--max-members', 200);
const LIMIT       = numArg('--limit', 9999);

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const pool   = new pg.Pool({ connectionString: DB_URL, max: 4 });
const RUN_ID = randomUUID();

console.log(`\n🔗 Hypergraph edge seeder — Lane C (tag-neighborhoods)${DRY ? ' [DRY]' : ''}`);
console.log(`   threshold=${THRESHOLD}  min_members=${MIN_MEMBERS}  max_members=${MAX_MEMBERS}  limit=${LIMIT}`);
console.log(`   run_id=${RUN_ID}\n`);

function gradeFor(n) {
  if (n >= 25) return { label: 'A', score: 0.95 };
  if (n >= 12) return { label: 'B', score: 0.78 };
  if (n >= 6)  return { label: 'C', score: 0.55 };
  return         { label: 'D', score: 0.32 };
}

function edgeHash(memberKeys) {
  const sorted = [...memberKeys].sort().join('|');
  return createHash('sha256')
    .update(`agents_context:tag_neighborhood:${sorted}`)
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

  // Connected-components via min-of-neighbors label propagation.
  // 3-iteration fixpoint: each pass replaces a node's label with the min
  // label among itself + neighbors. For SHARES_TAGS subgraphs in this
  // codebase (max diameter ~4), 3 passes converge in practice.
  const { rows: components } = await pool.query(
    `WITH edges AS (
       SELECT source_key AS a, target_key AS b
         FROM agent_context_relations
        WHERE relation = 'SHARES_TAGS' AND weight >= $1
       UNION
       SELECT target_key AS a, source_key AS b
         FROM agent_context_relations
        WHERE relation = 'SHARES_TAGS' AND weight >= $1
     ),
     nodes AS (
       SELECT DISTINCT a AS k FROM edges
     ),
     pass1 AS (
       SELECT n.k, LEAST(n.k, COALESCE(MIN(e.b), n.k)) AS lbl
         FROM nodes n
         LEFT JOIN edges e ON e.a = n.k
        GROUP BY n.k
     ),
     pass2 AS (
       SELECT p.k,
              LEAST(p.lbl,
                    COALESCE(MIN(p2.lbl), p.lbl)) AS lbl
         FROM pass1 p
         LEFT JOIN edges e   ON e.a = p.k
         LEFT JOIN pass1 p2  ON p2.k = e.b
        GROUP BY p.k, p.lbl
     ),
     pass3 AS (
       SELECT p.k,
              LEAST(p.lbl,
                    COALESCE(MIN(p2.lbl), p.lbl)) AS lbl
         FROM pass2 p
         LEFT JOIN edges e   ON e.a = p.k
         LEFT JOIN pass2 p2  ON p2.k = e.b
        GROUP BY p.k, p.lbl
     )
     SELECT lbl AS component_id,
            count(*)            AS n_members,
            array_agg(k ORDER BY k) AS members
       FROM pass3
      GROUP BY lbl
     HAVING count(*) BETWEEN $2 AND $3
      ORDER BY count(*) DESC
      LIMIT $4`,
    [THRESHOLD, MIN_MEMBERS, MAX_MEMBERS, LIMIT],
  );
  console.log(`   ${components.length} component(s) eligible (size ${MIN_MEMBERS}-${MAX_MEMBERS})\n`);

  let inserted = 0, updated = 0, skipped = 0, totalMembers = 0;
  let membersRewritten = 0, membersUnchanged = 0;

  for (const c of components) {
    const memberKeys = (c.members ?? []).filter(Boolean);
    if (memberKeys.length < MIN_MEMBERS) { skipped++; continue; }

    const grade   = gradeFor(memberKeys.length);
    const hash    = edgeHash(memberKeys);
    const labelId = c.component_id.replace(/^agents:/, '').replace(/\/AGENTS\.md$/, '');
    const label   = `tag_nbhd:${labelId}`;
    const title   = `Tag-neighborhood centered on ${labelId} (${memberKeys.length})`;
    const top3    = memberKeys.slice(0, 3).map(m =>
      m.replace(/^agents:/, '').replace(/\/AGENTS\.md$/, '').split('/').slice(-2).join('/')
    ).join(', ');
    const summary = `${memberKeys.length} AGENTS.md scopes share tags above Jaccard ${THRESHOLD}. Top: ${top3}`;
    const weight  = Math.min(1, Math.log(memberKeys.length) / Math.log(40));

    if (DRY) {
      console.log(`   [dry] ${labelId.slice(0, 50).padEnd(50)} n=${String(memberKeys.length).padStart(3)} grade=${grade.label} hash=${hash.slice(0,8)}…`);
      inserted++;
      totalMembers += memberKeys.length;
      continue;
    }

    const { rows: edgeRows, rowCount } = await pool.query(
      `INSERT INTO hypergraph_edges (
         edge_hash, edge_type, member_ids, title, summary,
         grade_label, grade_score, confidence, source,
         weight, run_id, label, metadata
       ) VALUES ($1, 'agents_context', $2, $3, $4, $5, $6, 0.75, 'agent_context_relations',
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
          source:        'agent_context_relations',
          relation:      'SHARES_TAGS',
          threshold:     THRESHOLD,
          component_id:  c.component_id,
          n_members:     memberKeys.length,
          run_id:        RUN_ID,
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
      .map((_, i) => `($1, 'agents_md', $${i + 2}, 'tag_neighborhood_member', $${memberKeys.length + 2})`)
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
  console.log(`   members rewritten:  ${membersRewritten}`);
  console.log(`   members unchanged:  ${membersUnchanged}  (skipped via edge_hash + count match)`);
  console.log(`   total members:      ${totalMembers}`);

  if (!DRY) {
    const { rows: counts } = await pool.query(
      `SELECT
         (SELECT count(*) FROM hypergraph_edges WHERE edge_type = 'agents_context') AS edges,
         (SELECT count(*) FROM hypergraph_edge_members hem
          JOIN hypergraph_edges he ON he.id = hem.edge_id
          WHERE he.edge_type = 'agents_context') AS members`,
    );
    console.log(`\n   DB state: ${counts[0].edges} agents_context edges, ${counts[0].members} member rows`);
  }

  await pool.end();
  console.log(`\n${DRY ? '🔍 Dry-run complete — re-run with --apply to write.' : '✅ Lane C seeder complete.'}\n`);
}

main().catch(async err => {
  console.error('❌ Seeder failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
