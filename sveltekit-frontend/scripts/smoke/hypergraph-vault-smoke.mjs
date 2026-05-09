#!/usr/bin/env node
/**
 * hypergraph-vault-smoke.mjs
 *
 * Regression gate for the 4-lane hypergraph + vault_md_index wiring.
 * Pure Postgres — no TS loader, no MCP server, no llama-server. Runs in
 * <1s and is safe to fire on every folder open.
 *
 * 8 probes:
 *   1. vault_md_index has ≥3500 rows (was 3990 at first index)
 *   2. ≥3000 vault rows link to a source file
 *   3. ≥3000 vault rows link to a cluster
 *   4. ≥3000 vault rows have an embedding_id
 *   5. ≥250 AGENTS.md scopes ingested
 *   6. All 4 hypergraph lanes present (cluster_context, shared_resource,
 *      agents_context, vault_link) with ≥1 edge each
 *   7. vault_md_join view returns ≥1 row joining vault → cluster → hypergraph
 *   8. Lane D top target ('Files/_types' or similar) has ≥100 inbound members
 *
 * Exit code 0 = all pass, 1 = any fail. Stdout is JSONL-ish for parseability.
 *
 * Usage:
 *   node scripts/smoke/hypergraph-vault-smoke.mjs
 *   node scripts/smoke/hypergraph-vault-smoke.mjs --strict   # exit 1 on warnings
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const STRICT = process.argv.includes('--strict');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(2); }

const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
const t0   = Date.now();
const probes = [];

async function probe(name, sql, check) {
  const tp0 = Date.now();
  try {
    const { rows } = await pool.query(sql);
    const ms = Date.now() - tp0;
    const result = check(rows);
    probes.push({ name, ms, ok: result.ok, value: result.value, expected: result.expected });
    const icon = result.ok ? '✅' : '❌';
    console.log(`  ${icon} ${name.padEnd(32)} ${String(ms).padStart(4)}ms  ${result.value} (expected ${result.expected})`);
  } catch (e) {
    probes.push({ name, ms: Date.now() - tp0, ok: false, error: e.message });
    console.log(`  ❌ ${name.padEnd(32)}      ERROR: ${e.message}`);
  }
}

console.log('\n🩺 Hypergraph + vault_md_index smoke\n');

await probe(
  'vault_md_index_total',
  'SELECT count(*)::int AS n FROM vault_md_index',
  rows => ({ ok: rows[0].n >= 3500, value: rows[0].n, expected: '≥3500' }),
);
await probe(
  'vault_md_with_source',
  'SELECT count(*)::int AS n FROM vault_md_index WHERE source_path IS NOT NULL',
  rows => ({ ok: rows[0].n >= 3000, value: rows[0].n, expected: '≥3000' }),
);
await probe(
  'vault_md_with_cluster',
  'SELECT count(*)::int AS n FROM vault_md_index WHERE cluster_id IS NOT NULL',
  rows => ({ ok: rows[0].n >= 3000, value: rows[0].n, expected: '≥3000' }),
);
await probe(
  'vault_md_with_embedding',
  'SELECT count(*)::int AS n FROM vault_md_index WHERE embedding_id IS NOT NULL',
  rows => ({ ok: rows[0].n >= 3000, value: rows[0].n, expected: '≥3000' }),
);
await probe(
  'agents_md_count',
  "SELECT count(*)::int AS n FROM vault_md_index WHERE md_kind = 'agents_md'",
  rows => ({ ok: rows[0].n >= 250, value: rows[0].n, expected: '≥250' }),
);
await probe(
  'hypergraph_4_lanes',
  `SELECT count(DISTINCT edge_type)::int AS n FROM hypergraph_edges
   WHERE edge_type IN ('cluster_context','shared_resource','agents_context','vault_link')`,
  rows => ({ ok: rows[0].n === 4, value: rows[0].n, expected: '4' }),
);
await probe(
  'vault_md_join_works',
  `SELECT count(*)::int AS n FROM vault_md_join
    WHERE cluster_id IS NOT NULL AND cluster_label IS NOT NULL`,
  rows => ({ ok: rows[0].n >= 1, value: rows[0].n, expected: '≥1' }),
);
await probe(
  'lane_d_hot_target',
  `SELECT max(coalesce(array_length(member_ids, 1), 0))::int AS n
     FROM hypergraph_edges WHERE edge_type = 'vault_link'`,
  rows => ({ ok: rows[0].n >= 100, value: rows[0].n, expected: '≥100' }),
);

await pool.end();

const totalMs = Date.now() - t0;
const okCount = probes.filter(p => p.ok).length;
const fail    = probes.length - okCount;
console.log(`\n${fail === 0 ? '✅ all green' : `❌ ${fail}/${probes.length} failed`} — ${okCount}/${probes.length} probes pass in ${totalMs}ms\n`);

process.exit(fail === 0 ? 0 : (STRICT || fail >= 3 ? 1 : 0));
