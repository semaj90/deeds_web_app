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
  // 1. Pull all gpu:N clusters that meet the size band, joined to
  //    code_retrieval_chunks so we can aggregate the cluster's SOM cell
  //    centroid + dominant topo_class + manifold4 centroid in one pass.
  //
  //    Why join here: the hypergraph_edges schema has slots for som_cluster,
  //    som_cell, manifold4, topo_class — but Lane A only wrote gpu_cluster.
  //    Filling these turns each cluster_context edge into a full 4D node so
  //    topology.search_4d / topology.same_som_cluster / atlas dir cards can
  //    all use the same edge as the join key.
  const { rows: clusters } = await pool.query(
    `WITH per_cluster AS (
       SELECT m.cluster_key,
              count(*)                                            AS n_members,
              array_agg(coalesce(m.file_path, m.stable_key)
                        ORDER BY m.stable_key)                    AS members,
              -- SOM centroid (cell = "row,col" stringified)
              avg(c.manifold4_x)::real                            AS m4x,
              avg(c.manifold4_y)::real                            AS m4y,
              avg(c.manifold4_z)::real                            AS m4z,
              avg(c.manifold4_w)::real                            AS m4w,
              -- Dominant topo_class (most-common across members)
              mode() WITHIN GROUP (ORDER BY c.topo_class)         AS topo_class,
              -- Topo_byte mode for the SOM-cell stub (when manifold4 missing)
              mode() WITHIN GROUP (ORDER BY c.topo_byte)          AS topo_byte
         FROM qdrant_cluster_members m
         LEFT JOIN code_retrieval_chunks c ON c.file_path = m.file_path
        WHERE m.cluster_key LIKE 'gpu:%'
        GROUP BY m.cluster_key
       HAVING count(*) BETWEEN $1 AND $2
        ORDER BY count(*) DESC
        LIMIT $3
     )
     SELECT * FROM per_cluster`,
    [MIN_MEMBERS, MAX_MEMBERS, LIMIT],
  );
  console.log(`   ${clusters.length} cluster(s) eligible (size ${MIN_MEMBERS}-${MAX_MEMBERS})`);

  let inserted = 0, updated = 0, skipped = 0, totalMembers = 0;
  // Adaptive-guard counters: members are only "rewritten" when we actually
  // hit the DELETE/INSERT branch. When the unchanged-edge short-circuit
  // fires, we count the same rows under `membersUnchanged` so the operator
  // can tell at a glance how much work the guard saved.
  let membersRewritten = 0, membersUnchanged = 0;

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

    // Topology centroid (k-means cluster IS the SOM cluster — gpu:N labels
    // come from the unified k-means+SOM pipeline). When manifold4 is null
    // (file not yet topo-tagged), we leave the slot null so callers can tell
    // the difference between "centroid is origin" and "no data".
    const manifold4 = (c.m4x != null && c.m4y != null && c.m4z != null && c.m4w != null)
      ? [Number(c.m4x), Number(c.m4y), Number(c.m4z), Number(c.m4w)]
      : null;
    const somCluster = gpuId;                                   // shared label space
    const somCell    = manifold4
      ? `${manifold4[0].toFixed(2)},${manifold4[1].toFixed(2)}` // x,y centroid as the cell key
      : null;
    const topoClass  = c.topo_class || null;

    // Upsert edge row
    const { rows: edgeRows, rowCount } = await pool.query(
      `INSERT INTO hypergraph_edges (
         edge_hash, edge_type, member_ids, title, summary,
         grade_label, grade_score, confidence, source,
         gpu_cluster, som_cluster, som_cell, manifold4, topo_class,
         weight, run_id, label, metadata
       ) VALUES ($1, 'cluster_context', $2, $3, $4, $5, $6, 0.85, 'qdrant_cluster_members',
                 $7, $8, $9, $10::real[], $11,
                 $12, $13, $14, $15::jsonb)
       ON CONFLICT (edge_hash) DO UPDATE SET
         member_ids  = EXCLUDED.member_ids,
         title       = EXCLUDED.title,
         summary     = EXCLUDED.summary,
         grade_label = EXCLUDED.grade_label,
         grade_score = EXCLUDED.grade_score,
         som_cluster = EXCLUDED.som_cluster,
         som_cell    = EXCLUDED.som_cell,
         manifold4   = EXCLUDED.manifold4,
         topo_class  = EXCLUDED.topo_class,
         weight      = EXCLUDED.weight,
         run_id      = EXCLUDED.run_id,
         updated_at  = now()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        hash, memberKeys, title, summary,
        grade.label, grade.score,
        gpuId, somCluster, somCell, manifold4, topoClass,
        weight, RUN_ID, c.cluster_key,
        JSON.stringify({
          source: 'cluster_context',
          n_members: memberKeys.length,
          run_id: RUN_ID,
          topo_class: topoClass,
          som_centroid: manifold4,
        }),
      ],
    );
    if (rowCount === 0) { skipped++; continue; }
    const edgeId = edgeRows[0].id;
    if (edgeRows[0].was_inserted) inserted++; else updated++;

    // ── Adaptive guard: skip DELETE/INSERT when membership unchanged ──────
    // edge_hash = sha256(edge_type + sorted member_keys), so when the upsert
    // hits an existing row (was_inserted=false) the member set is provably
    // identical to what's already in hypergraph_edge_members. Skip the
    // DELETE/INSERT cycle to avoid 16k+ wasted row touches per re-run.
    //
    // Edge case: a previous run may have died mid-way, leaving the edge row
    // but with zero or partial members. We probe the count and only short-
    // circuit when the existing member count matches what we'd write.
    if (!edgeRows[0].was_inserted) {
      const { rows: [{ existing_n }] } = await pool.query(
        'SELECT count(*)::int AS existing_n FROM hypergraph_edge_members WHERE edge_id = $1',
        [edgeId],
      );
      if (existing_n === memberKeys.length) {
        // Membership unchanged — skip the DELETE/INSERT entirely.
        totalMembers      += memberKeys.length;
        membersUnchanged  += memberKeys.length;
        continue;
      }
      // Otherwise fall through to the rebuild — partial state from a
      // failed previous run.
    }

    // Replace members atomically (new edge OR detected partial member set).
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
    totalMembers      += memberKeys.length;
    membersRewritten  += memberKeys.length;
  }

  console.log(`\n   inserted:           ${inserted}`);
  console.log(`   updated:            ${updated}`);
  console.log(`   skipped:            ${skipped}`);
  console.log(`   members rewritten:  ${membersRewritten}  (DELETE+INSERT executed)`);
  console.log(`   members unchanged:  ${membersUnchanged}  (skipped via edge_hash + count match)`);
  console.log(`   total members:      ${totalMembers}      (= rewritten + unchanged)`);

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
