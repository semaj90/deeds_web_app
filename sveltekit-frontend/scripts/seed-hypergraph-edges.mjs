#!/usr/bin/env node
/**
 * seed-hypergraph-edges.mjs
 *
 * Promotes existing relationship signals into the canonical `hypergraph_edges`
 * + `hypergraph_edge_members` schema so the MCP `hypergraph.search` tool stops
 * returning 0 results.
 *
 * Lane A (default) — cluster cohesion edges (edge_type='cluster_context'):
 *   For every `cluster_key = 'gpu:N'` in `qdrant_cluster_members` with
 *   ≥ MIN_MEMBERS files, create a single hyperedge whose members are the
 *   files in that cluster. This is the densest source available
 *   (qdrant_cluster_members has 57k+ rows, ~400 distinct gpu:N clusters).
 *
 * Lane B (--lane-b, opt-in) — shared-resource edges (edge_type='shared_resource'):
 *   For every (relation_type, target_key) in `code_relations` with ≥ 2 source
 *   files, emit one hyperedge listing those source files as members. Captures
 *   producer/consumer adjacency that GPU k-means misses — two files in distant
 *   gpu:N clusters that both QUERIES_TABLE → 'cases' are functionally adjacent
 *   regardless of how their embeddings cluster. Covered relation_types:
 *     QUERIES_TABLE, QUERIES_QDRANT_COLLECTION, QUERIES_NEO4J_LABEL,
 *     READS_REDIS_KEY, WRITES_REDIS_KEY
 *   (EXPORTS_SYMBOL excluded — too noisy at 7966 rows; HAS_AGENTS_SCOPE
 *   excluded — already lives on the AGENTS.md spine.)
 *
 * Lane C (agent_context_relations.SHARES_TAGS) is deferred — opt-in via --lane-c
 * when it lands.
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

// Lane toggles. Lane A runs by default for backward compat; Lane B is opt-in
// for now until the producer/consumer noise floor is characterized in prod.
const LANE_A = !args.includes('--no-lane-a');
const LANE_B = args.includes('--lane-b') || args.includes('--all-lanes');
// Lane B uses a smaller floor — typical (table, file) sharing cohort is 2-5.
const LANE_B_MIN_MEMBERS = intArg('--lane-b-min-members', 2);
const LANE_B_LIMIT       = intArg('--lane-b-limit', 5000);

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });
const RUN_ID = randomUUID();

const lanesActive = [LANE_A && 'A', LANE_B && 'B'].filter(Boolean).join('+') || '(none)';
console.log(`\n🔗 Hypergraph edge seeder — Lanes ${lanesActive}${DRY ? ' [DRY]' : ''}`);
console.log(`   Lane A: min=${MIN_MEMBERS}  max=${MAX_MEMBERS}  limit=${LIMIT}`);
if (LANE_B) console.log(`   Lane B: min=${LANE_B_MIN_MEMBERS}  limit=${LANE_B_LIMIT}`);
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

// ── Pre-run Redis snapshot ───────────────────────────────────────────────────
//
// AST scan + GPU k-means + qdrant_cluster_members repopulation is a 20+ min
// pipeline. If the seeder ever deletes orphan edges (or a downstream cleanup
// query does), a stale state with no recovery path means the operator has to
// re-run the whole upstream chain to get back to a known-good edge set.
//
// Pre-snapshot the entire current hypergraph_edges + member_ids state into
// Redis BEFORE any mutation. Hash key = hypergraph:edges:archive:{ISO date}
// — survives 30 days, idempotent (same key per day = atomic replace).
//
// Recovery path documented in next_steps for future operators.
async function snapshotToRedis(pool) {
  let Redis;
  try { ({ default: Redis } = await import('ioredis')); } catch { return null; }
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const redis    = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 3000 });
  try {
    await redis.connect();
    const day      = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
    const key      = `hypergraph:edges:archive:${day}`;
    const { rows } = await pool.query(
      `SELECT id, edge_hash, edge_type, member_ids, title, summary,
              grade_label, grade_score, gpu_cluster, som_cluster, som_cell,
              manifold4, topo_class, weight, run_id, label, metadata
       FROM hypergraph_edges`,
    );
    if (rows.length === 0) {
      await redis.quit();
      return { archived: 0, key };
    }
    const pipe = redis.pipeline();
    pipe.del(key);
    for (const r of rows) {
      pipe.hset(key, r.edge_hash, JSON.stringify(r));
    }
    pipe.expire(key, 30 * 24 * 3600);  // 30 days
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

/**
 * Lane B — Shared-resource edges (edge_type = 'shared_resource').
 *
 * Promotes producer/consumer adjacency from `code_relations` into the hypergraph.
 * Each emitted edge groups every source_file that touches the same
 * (relation_type, target_key) — e.g. all files that QUERIES_TABLE → 'cases'
 * become one shared_resource edge labeled `QUERIES_TABLE:cases`.
 *
 * Why this is signal:
 *   GPU k-means groups files by embedding similarity. Two files in distant
 *   gpu:N clusters that both write to the same Redis key, hit the same
 *   Postgres table, or share a Qdrant collection are functionally adjacent
 *   regardless of how their text embeddings cluster. Lane A misses them.
 *
 * edge_hash convention for Lane B:
 *   sha256('shared_resource:<relation_type>:<target_key>:' + sorted_members.join('|'))
 *   The relation_type+target_key prefix ensures two unrelated resources with
 *   the same member set never collide.
 *
 * Adaptive guard: same as Lane A. The upsert hits on edge_hash; when the
 * member-count probe matches, we skip the DELETE/INSERT into edge_members.
 */
async function runLaneB(pool, runId, dry) {
  const RELATION_TYPES = [
    'QUERIES_TABLE',
    'QUERIES_QDRANT_COLLECTION',
    'QUERIES_NEO4J_LABEL',
    'READS_REDIS_KEY',
    'WRITES_REDIS_KEY',
  ];

  const { rows: groups } = await pool.query(
    `WITH dedup AS (
       SELECT relation_type,
              target_key,
              source_file,
              avg(confidence)::real AS conf
         FROM code_relations
        WHERE relation_type = ANY($1::text[])
          AND source_file   IS NOT NULL
          AND target_key    IS NOT NULL
        GROUP BY relation_type, target_key, source_file
     ),
     grouped AS (
       SELECT relation_type,
              target_key,
              array_agg(source_file ORDER BY source_file) AS members,
              count(*)::int                                AS n_members,
              avg(conf)::real                              AS avg_confidence
         FROM dedup
        GROUP BY relation_type, target_key
       HAVING count(*) >= $2
        ORDER BY count(*) DESC
        LIMIT $3
     )
     SELECT * FROM grouped`,
    [RELATION_TYPES, LANE_B_MIN_MEMBERS, LANE_B_LIMIT],
  );
  console.log(`\n   Lane B: ${groups.length} shared-resource group(s) eligible (≥${LANE_B_MIN_MEMBERS} files)`);

  let inserted = 0, updated = 0, skipped = 0;
  let membersRewritten = 0, membersUnchanged = 0, totalMembers = 0;
  const byType = {};

  for (const g of groups) {
    const memberKeys = (g.members ?? []).filter(Boolean);
    if (memberKeys.length < LANE_B_MIN_MEMBERS) { skipped++; continue; }
    byType[g.relation_type] = (byType[g.relation_type] ?? 0) + 1;

    // Hash includes the resource identifier so e.g. QUERIES_TABLE:cases and
    // QUERIES_TABLE:users with overlapping members get distinct edges.
    const hashKey = [`shared_resource:${g.relation_type}:${g.target_key}`, ...memberKeys];
    const hash    = createHash('sha256').update(hashKey.join('|')).digest('hex').slice(0, 64);
    const grade   = gradeFor(memberKeys.length);
    const conf    = Math.min(1, Math.max(0, Number(g.avg_confidence) || 0.7));
    const weight  = Math.min(1, conf * Math.log(memberKeys.length + 1) / Math.log(20));
    const label   = `${g.relation_type}:${g.target_key}`;
    const top3    = memberKeys.slice(0, 3).map(m => m.split('/').pop()).join(', ');
    const title   = `${memberKeys.length} files share ${g.relation_type} '${g.target_key}'`;
    const summary = `Producer/consumer cohort: files routing through ${g.target_key} via ${g.relation_type}. Top: ${top3}`;

    if (dry) {
      console.log(`   [dry] ${g.relation_type.padEnd(26)} → ${g.target_key.slice(0, 32).padEnd(32)} n=${memberKeys.length.toString().padStart(2)} grade=${grade.label} hash=${hash.slice(0, 8)}…`);
      inserted++;
      totalMembers += memberKeys.length;
      continue;
    }

    const { rows: edgeRows, rowCount } = await pool.query(
      `INSERT INTO hypergraph_edges (
         edge_hash, edge_type, member_ids, title, summary,
         grade_label, grade_score, confidence, source,
         weight, run_id, label, metadata
       ) VALUES ($1, 'shared_resource', $2, $3, $4, $5, $6, $7, 'code_relations',
                 $8, $9, $10, $11::jsonb)
       ON CONFLICT (edge_hash) DO UPDATE SET
         member_ids  = EXCLUDED.member_ids,
         title       = EXCLUDED.title,
         summary     = EXCLUDED.summary,
         grade_label = EXCLUDED.grade_label,
         grade_score = EXCLUDED.grade_score,
         confidence  = EXCLUDED.confidence,
         weight      = EXCLUDED.weight,
         run_id      = EXCLUDED.run_id,
         updated_at  = now()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        hash, memberKeys, title, summary,
        grade.label, grade.score, conf,
        weight, runId, label,
        JSON.stringify({
          source:        'code_relations',
          relation_type: g.relation_type,
          target_key:    g.target_key,
          n_members:     memberKeys.length,
          avg_confidence: conf,
          run_id:        runId,
        }),
      ],
    );
    if (rowCount === 0) { skipped++; continue; }
    const edgeId = edgeRows[0].id;
    if (edgeRows[0].was_inserted) inserted++; else updated++;

    // Adaptive guard: skip member rebuild when count matches existing
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

  console.log(`   Lane B inserted:     ${inserted}`);
  console.log(`   Lane B updated:      ${updated}`);
  console.log(`   Lane B skipped:      ${skipped}`);
  console.log(`   Lane B members:      ${totalMembers}  (rewritten=${membersRewritten}, unchanged=${membersUnchanged})`);
  if (Object.keys(byType).length) {
    console.log(`   Lane B by type:      ${Object.entries(byType).map(([t, n]) => `${t}=${n}`).join('  ')}`);
  }

  if (!dry) {
    const { rows: counts } = await pool.query(
      `SELECT
         (SELECT count(*) FROM hypergraph_edges WHERE edge_type = 'shared_resource') AS edges,
         (SELECT count(*) FROM hypergraph_edge_members hem
          JOIN hypergraph_edges he ON he.id = hem.edge_id
          WHERE he.edge_type = 'shared_resource') AS members`,
    );
    console.log(`   DB state: ${counts[0].edges} shared_resource edges, ${counts[0].members} member rows`);
  }
}

async function main() {
  // 0. Snapshot current hypergraph_edges to Redis with 30-day TTL.
  //    Defensive guard: AST + GPU + qdrant_cluster_members repopulation
  //    is a 20+ min pipeline. If a future cleanup deletes orphan edges,
  //    this archive lets the operator restore without re-running the
  //    whole chain. Recovery: redis-cli HGETALL hypergraph:edges:archive:YYYY-MM-DD
  if (!DRY) {
    const snap = await snapshotToRedis(pool);
    if (snap) {
      console.log(`   📦 archived ${snap.archived} edges → ${snap.key} (30d TTL)`);
    } else {
      console.log(`   ⚠ snapshot skipped (Redis unavailable) — proceeding`);
    }
  }

  if (!LANE_A) {
    console.log(`   Lane A: skipped (--no-lane-a)`);
  }

  // 1. Pull all gpu:N clusters that meet the size band, joined to
  //    code_retrieval_chunks so we can aggregate the cluster's SOM cell
  //    centroid + dominant topo_class + manifold4 centroid in one pass.
  //
  //    Why join here: the hypergraph_edges schema has slots for som_cluster,
  //    som_cell, manifold4, topo_class — but Lane A only wrote gpu_cluster.
  //    Filling these turns each cluster_context edge into a full 4D node so
  //    topology.search_4d / topology.same_som_cluster / atlas dir cards can
  //    all use the same edge as the join key.
  const { rows: clusters } = LANE_A ? await pool.query(
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
  ) : { rows: [] };
  if (LANE_A) console.log(`   Lane A: ${clusters.length} cluster(s) eligible (size ${MIN_MEMBERS}-${MAX_MEMBERS})`);

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
  if (LANE_A && !DRY) {
    const { rows: counts } = await pool.query(
      `SELECT
         (SELECT count(*) FROM hypergraph_edges WHERE edge_type = 'cluster_context') AS edges,
         (SELECT count(*) FROM hypergraph_edge_members hem
          JOIN hypergraph_edges he ON he.id = hem.edge_id
          WHERE he.edge_type = 'cluster_context') AS members`,
    );
    console.log(`\n   DB state: ${counts[0].edges} cluster_context edges, ${counts[0].members} member rows`);
  }

  // Lane B — shared-resource edges from code_relations
  if (LANE_B) {
    await runLaneB(pool, RUN_ID, DRY);
  }

  await pool.end();
  console.log(`\n${DRY ? '🔍 Dry-run complete — re-run with --apply to write.' : '✅ Seeder complete.'}\n`);
}

main().catch(async err => {
  console.error('❌ Seeder failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
