#!/usr/bin/env node
/**
 * seed-hypergraph-edges-lane-d.mjs
 *
 * Lane D — vault wiki-link reference edges from `vault_md_index.links_out`.
 * Each wiki-link target attracts a hyperedge whose members are all vault md
 * files that link TO it. This is the "shared reference" lane: documents
 * pointing at the same target form a hyperedge.
 *
 * Edge type: 'vault_link'  (added to EDGE_TYPE_VALUES)
 *
 * Members: the vault_md_index.vault_path values that contain the target in
 * their links_out array (member_kind='file').
 *
 * Pre-run defensive Redis archive (same pattern as Lanes A/B/C).
 *
 * edge_hash convention: sha256('vault_link:' + target + ':'
 *                              + sorted_member_paths.join('|'))
 *
 * Usage:
 *   node scripts/seed-hypergraph-edges-lane-d.mjs --dry-run
 *   node scripts/seed-hypergraph-edges-lane-d.mjs --apply
 *   node scripts/seed-hypergraph-edges-lane-d.mjs --apply --min-members 5 --limit 100
 */
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY   = !APPLY;
const intArg = (name, def) => {
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return parseInt(eq.split('=')[1], 10) || def;
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10) || def;
  return def;
};
const MIN_MEMBERS = intArg('--min-members', 3);
const MAX_MEMBERS = intArg('--max-members', 800);
const LIMIT       = intArg('--limit', 9999);

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const pool   = new pg.Pool({ connectionString: DB_URL, max: 4 });
const RUN_ID = randomUUID();

console.log(`\n🔗 Hypergraph edge seeder — Lane D (vault wiki-links)${DRY ? ' [DRY]' : ''}`);
console.log(`   min_members=${MIN_MEMBERS}  max_members=${MAX_MEMBERS}  limit=${LIMIT}`);
console.log(`   run_id=${RUN_ID}\n`);

function gradeFor(n) {
  if (n >= 100) return { label: 'A', score: 0.95 };
  if (n >= 25)  return { label: 'B', score: 0.78 };
  if (n >= 6)   return { label: 'C', score: 0.55 };
  return          { label: 'D', score: 0.32 };
}

function edgeHash(target, memberKeys) {
  const sorted = [...memberKeys].sort().join('|');
  return createHash('sha256')
    .update(`vault_link:${target}:${sorted}`)
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

  const { rows: targets } = await pool.query(
    `SELECT link AS target,
            count(*)                                            AS n_members,
            array_agg(v.vault_path ORDER BY v.vault_path)       AS members
       FROM vault_md_index v, unnest(v.links_out) AS link
      WHERE array_length(v.links_out, 1) > 0
      GROUP BY link
     HAVING count(*) BETWEEN $1 AND $2
      ORDER BY count(*) DESC
      LIMIT $3`,
    [MIN_MEMBERS, MAX_MEMBERS, LIMIT],
  );
  console.log(`   ${targets.length} link target(s) eligible (size ${MIN_MEMBERS}-${MAX_MEMBERS})\n`);

  let inserted = 0, updated = 0, skipped = 0, totalMembers = 0;
  let membersRewritten = 0, membersUnchanged = 0;

  for (const t of targets) {
    const memberKeys = (t.members ?? []).filter(Boolean);
    if (memberKeys.length < MIN_MEMBERS) { skipped++; continue; }

    const grade   = gradeFor(memberKeys.length);
    const hash    = edgeHash(t.target, memberKeys);
    const label   = `vault_link:${t.target}`;
    const title   = `Vault docs linking to ${t.target} (${memberKeys.length})`;
    const top3    = memberKeys.slice(0, 3).map(m => m.split(/[\\/]/).pop()).join(', ');
    const summary = `${memberKeys.length} vault md docs reference \`${t.target}\`. Top: ${top3}`;
    const weight  = Math.min(1, Math.log(memberKeys.length) / Math.log(100));

    if (DRY) {
      console.log(`   [dry] ${t.target.slice(0, 38).padEnd(38)} n=${String(memberKeys.length).padStart(4)} grade=${grade.label} hash=${hash.slice(0,8)}…`);
      inserted++;
      totalMembers += memberKeys.length;
      continue;
    }

    const { rows: edgeRows, rowCount } = await pool.query(
      `INSERT INTO hypergraph_edges (
         edge_hash, edge_type, member_ids, title, summary,
         grade_label, grade_score, confidence, source,
         weight, run_id, label, metadata
       ) VALUES ($1, 'vault_link', $2, $3, $4, $5, $6, 0.70, 'vault_md_index',
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
          source:    'vault_md_index',
          target:    t.target,
          n_members: memberKeys.length,
          run_id:    RUN_ID,
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
    // Insert in batches of 500 to keep parameter count under Postgres' 65535 limit.
    const BATCH = 500;
    for (let i = 0; i < memberKeys.length; i += BATCH) {
      const slice = memberKeys.slice(i, i + BATCH);
      const memberValues = slice
        .map((_, j) => `($1, 'file', $${j + 2}, 'vault_link_member', $${slice.length + 2})`)
        .join(', ');
      await pool.query(
        `INSERT INTO hypergraph_edge_members (edge_id, member_kind, member_key, role, score)
         VALUES ${memberValues}`,
        [edgeId, ...slice, memberScore],
      );
    }
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
         (SELECT count(*) FROM hypergraph_edges WHERE edge_type = 'vault_link') AS edges,
         (SELECT count(*) FROM hypergraph_edge_members hem
          JOIN hypergraph_edges he ON he.id = hem.edge_id
          WHERE he.edge_type = 'vault_link') AS members`,
    );
    console.log(`\n   DB state: ${counts[0].edges} vault_link edges, ${counts[0].members} member rows`);
  }

  await pool.end();
  console.log(`\n${DRY ? '🔍 Dry-run complete — re-run with --apply to write.' : '✅ Lane D seeder complete.'}\n`);
}

main().catch(async err => {
  console.error('❌ Seeder failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
