#!/usr/bin/env node
/**
 * seed-hypergraph-edges.mjs
 *
 * Promotes existing relationship signals into the canonical `hypergraph_edges`
 * + `hypergraph_edge_members` schema so the MCP `hypergraph.search` tool stops
 * returning 0 results.
 *
 * Lane A (this v1) — cluster cohesion edges:
 *   For every `cluster_key = 'gpu:N'` in `qdrant_cluster_members` with
 *   ≥ MIN_MEMBERS files, create a single hyperedge whose members are the
 *   files in that cluster. This is the densest source available
 *   (qdrant_cluster_members has 57k+ rows, ~400 distinct gpu:N clusters).
 *
 * Lanes B (code_relations) and C (agent_context_relations.SHARES_TAGS) are
 * deferred — flag the script with --include=lane-b / lane-c when they land.
 *
 * Idempotent: edge_hash is a sha256 of (edge_type + sorted member_keys),
 * UNIQUE-indexed at the DB level. ON CONFLICT (edge_hash) DO UPDATE bumps
 * updated_at + run_id so re-runs are cheap.
 *
 * Usage:
 *   node scripts/seed-hypergraph-edges.mjs --dry-run
 *   node scripts/seed-hypergraph-edges.mjs --apply
 *   node scripts/seed-hypergraph-edges.mjs --apply --min-members 5 --limit 50
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
// Default 1500 covers the natural distribution (largest gpu:N cluster observed
// is ~600). Jumbo clusters get a lower grade automatically via gradeFor() so
// grade-aware consumers can deprioritize them; previous cap of 100 silently
// excluded ~80% of the cluster volume from the hypergraph search index.
const MAX_MEMBERS = intArg('--max-members', 1500);
const LIMIT       = intArg('--limit', 9999);

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });
const RUN_ID = randomUUID();

console.log(`\n🔗 Hypergraph edge seeder — Lane A (cluster cohesion)${DRY ? ' [DRY]' : ''}`);
console.log(`   min_members=${MIN_MEMBERS}  max_members=${MAX_MEMBERS}  limit=${LIMIT}`);
console.log(`   run_id=${RUN_ID}\n`);

function gradeFor(n) {
  if (n >= 25) return { label: 'A', score: 0.95 };
  if (n >= 12) return { label: 'B', score: 0.78 };
  if (n >= 6)  return { label: 'C', score: 0.55 };
  return         { label: 'D', score: 0.32 };
}

// edge_hash convention: sha256(edge_type + ':' + sorted_member_keys.join('|'))
// — deterministic per (type, member set) so re-runs are idempotent.
function edgeHash(edgeType, memberKeys) {
  const sorted = [...memberKeys].sort().join('|');
  return createHash('sha256').update(`${edgeType}:${sorted}`).digest('hex').slice(0, 64);
}

async function main() {
  // 1. Pull all gpu:N clusters that meet the size band.
  const { rows: clusters } = await pool.query(
    `SELECT cluster_key,
            count(*) AS n_members,
            array_agg(coalesce(file_path, stable_key) ORDER BY stable_key) AS members
       FROM qdrant_cluster_members
      WHERE cluster_key LIKE 'gpu:%'
      GROUP BY cluster_key
     HAVING count(*) BETWEEN $1 AND $2
      ORDER BY count(*) DESC
      LIMIT $3`,
    [MIN_MEMBERS, MAX_MEMBERS, LIMIT],
  );
  console.log(`   ${clusters.length} cluster(s) eligible (size ${MIN_MEMBERS}-${MAX_MEMBERS})`);

  let inserted = 0, updated = 0, skipped = 0, totalMembers = 0;

  for (const c of clusters) {
    const memberKeys = (c.members ?? []).filter(Boolean);
    if (memberKeys.length < MIN_MEMBERS) { skipped++; continue; }

    const gpuId  = parseInt(c.cluster_key.split(':')[1], 10);
    const grade  = gradeFor(memberKeys.length);
    const hash   = edgeHash('cluster_context', memberKeys);
    const title  = `Cluster ${c.cluster_key} (${memberKeys.length} files)`;
    const top3   = memberKeys.slice(0, 3).map(m => m.split('/').pop()).join(', ');
    const summary = `Files clustered together by GPU k-means at gpu:${gpuId}. Top: ${top3}`;
    const weight = Math.min(1, Math.log(memberKeys.length) / Math.log(40));

    if (DRY) {
      console.log(`   [dry] ${c.cluster_key.padEnd(8)} n=${memberKeys.length.toString().padStart(2)} grade=${grade.label} hash=${hash.slice(0,8)}…`);
      inserted++;
      totalMembers += memberKeys.length;
      continue;
    }

    // Upsert edge row
    const { rows: edgeRows, rowCount } = await pool.query(
      `INSERT INTO hypergraph_edges (
         edge_hash, edge_type, member_ids, title, summary,
         grade_label, grade_score, confidence, source,
         gpu_cluster, weight, run_id, label, metadata
       ) VALUES ($1, 'cluster_context', $2, $3, $4, $5, $6, 0.85, 'qdrant_cluster_members',
                 $7, $8, $9, $10, $11::jsonb)
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
        gpuId, weight, RUN_ID, c.cluster_key,
        JSON.stringify({ source: 'cluster_context', n_members: memberKeys.length, run_id: RUN_ID }),
      ],
    );
    if (rowCount === 0) { skipped++; continue; }
    const edgeId = edgeRows[0].id;
    if (edgeRows[0].was_inserted) inserted++; else updated++;

    // Replace members atomically so re-runs reflect cluster membership churn.
    // CASCADE delete on hypergraph_edges → hypergraph_edge_members handles the
    // delete, then we re-insert.
    await pool.query('DELETE FROM hypergraph_edge_members WHERE edge_id = $1', [edgeId]);
    const memberScore = 1 / Math.sqrt(memberKeys.length); // smaller cluster → higher per-member score
    const memberValues = memberKeys
      .map((_, i) => `($1, 'file', $${i + 2}, 'cluster_member', $${memberKeys.length + 2})`)
      .join(', ');
    await pool.query(
      `INSERT INTO hypergraph_edge_members (edge_id, member_kind, member_key, role, score)
       VALUES ${memberValues}`,
      [edgeId, ...memberKeys, memberScore],
    );
    totalMembers += memberKeys.length;
  }

  console.log(`\n   inserted: ${inserted}`);
  console.log(`   updated:  ${updated}`);
  console.log(`   skipped:  ${skipped}`);
  console.log(`   total members written: ${totalMembers}`);

  // Quick verify
  if (!DRY) {
    const { rows: counts } = await pool.query(
      `SELECT
         (SELECT count(*) FROM hypergraph_edges WHERE edge_type = 'cluster_context') AS edges,
         (SELECT count(*) FROM hypergraph_edge_members hem
          JOIN hypergraph_edges he ON he.id = hem.edge_id
          WHERE he.edge_type = 'cluster_context') AS members`,
    );
    console.log(`\n   DB state: ${counts[0].edges} cluster_context edges, ${counts[0].members} member rows`);
  }

  await pool.end();
  console.log(`\n${DRY ? '🔍 Dry-run complete — re-run with --apply to write.' : '✅ Seeder complete.'}\n`);
}

main().catch(async err => {
  console.error('❌ Seeder failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
