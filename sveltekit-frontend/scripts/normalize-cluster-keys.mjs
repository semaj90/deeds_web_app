#!/usr/bin/env node
/**
 * normalize-cluster-keys.mjs
 *
 * Non-destructive migration of malformed agent_context_relations
 * target_keys (e.g. "cluster::50" with empty namespace → "cluster:gpu:50").
 *
 * Approach (RL-replay style — preserve every transition):
 *   1. Snapshot every malformed row into context_timeline as
 *      'cluster_key_normalize' events with payload { from, to, weight, ts }
 *      (becomes the audit/replay buffer for the change).
 *   2. UPSERT the normalized row, merging evidence and taking max(weight)
 *      when a row at the canonical key already exists.
 *   3. DELETE only the malformed source row after the normalized row is
 *      confirmed in place.
 *
 * Idempotent: re-runnable. Each run only touches rows that still match
 * the malformed pattern.
 *
 * Usage:
 *   node scripts/normalize-cluster-keys.mjs              # apply
 *   node scripts/normalize-cluster-keys.mjs --dry-run    # preview
 */

import { createHash } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const DB_URL  = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool    = new pg.Pool({ connectionString: DB_URL, max: 4 });

const RUN_HASH = createHash('sha256').update(`cluster-normalize:${Date.now()}`).digest('hex').slice(0, 12);
console.log(`\n[normalize-cluster-keys] ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}  run=${RUN_HASH}`);

// ── 1. Find malformed rows ──────────────────────────────────────────────────
// Pattern: target_key starts with "cluster:" followed by another ":" +digits
//          (i.e. namespace slot is empty).
const { rows: malformed } = await pool.query(`
  SELECT id, source_key, target_key, relation, weight, evidence, created_at
  FROM agent_context_relations
  WHERE target_key ~ '^cluster:[^a-zA-Z]'
`);
console.log(`  malformed rows found: ${malformed.length}`);

if (malformed.length === 0) {
  console.log('  ✓ nothing to normalize');
  await pool.end();
  process.exit(0);
}

function normalize(target_key) {
  // "cluster::50" → "cluster:gpu:50"
  // "cluster::"   → null (drop — pure noise)
  const m = target_key.match(/^cluster:(:?)(\d+)$/);
  if (m) return `cluster:gpu:${m[2]}`;
  // already normalized but slipped through pattern (shouldn't happen)
  return target_key;
}

// Group by (source, normalized_target, relation) to merge duplicates
const merged = new Map(); // key → { source, target, relation, weight, evidence_array, source_ids }
for (const r of malformed) {
  const newTarget = normalize(r.target_key);
  if (!newTarget) continue;
  const k = `${r.source_key}\0${newTarget}\0${r.relation}`;
  const ex = merged.get(k);
  if (ex) {
    ex.weight = Math.max(ex.weight, r.weight);
    ex.evidence_array.push({ ...r.evidence, _from: r.target_key });
    ex.source_ids.push(r.id);
  } else {
    merged.set(k, {
      source: r.source_key,
      target: newTarget,
      relation: r.relation,
      weight: r.weight,
      evidence_array: [{ ...r.evidence, _from: r.target_key }],
      source_ids: [r.id],
    });
  }
}
console.log(`  → ${merged.size} normalized targets after dedup`);

if (DRY_RUN) {
  console.log(`\n  [dry-run] would log ${malformed.length} timeline events,`);
  console.log(`           upsert ${merged.size} normalized rows,`);
  console.log(`           delete ${malformed.length} malformed source rows`);
  console.log(`\n  Sample mappings:`);
  let i = 0;
  for (const [, v] of merged) {
    if (i++ >= 5) break;
    console.log(`    ${v.evidence_array[0]._from.padEnd(15)} → ${v.target}  (weight=${v.weight.toFixed(3)})`);
  }
  await pool.end();
  process.exit(0);
}

// ── 2. Log every transition to context_timeline (audit/replay buffer) ──────
let logged = 0;
for (const r of malformed) {
  const newTarget = normalize(r.target_key);
  await pool.query(
    `INSERT INTO context_timeline (event_type, pipeline, signal, payload)
     VALUES ('cluster_key_normalize', 'agents-md', $1, $2::jsonb)`,
    [
      r.source_key,
      JSON.stringify({
        run: RUN_HASH,
        relation_id: r.id,
        from: r.target_key,
        to: newTarget,
        relation: r.relation,
        weight: r.weight,
        original_created_at: r.created_at,
      }),
    ],
  ).then(() => logged++).catch(() => { /* non-fatal */ });
}
console.log(`  ✓ logged ${logged} timeline events`);

// ── 3. UPSERT normalized rows with merged evidence ─────────────────────────
let upserted = 0;
for (const v of merged.values()) {
  const evidence = v.evidence_array.length === 1
    ? v.evidence_array[0]
    : { _merged_from: v.evidence_array, _merge_run: RUN_HASH };
  await pool.query(
    `INSERT INTO agent_context_relations (source_key, target_key, relation, weight, evidence)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (source_key, target_key, relation) DO UPDATE SET
       weight   = GREATEST(agent_context_relations.weight, EXCLUDED.weight),
       evidence = agent_context_relations.evidence || EXCLUDED.evidence`,
    [v.source, v.target, v.relation, v.weight, JSON.stringify(evidence)],
  );
  upserted++;
}
console.log(`  ✓ upserted ${upserted} normalized rows`);

// ── 4. Delete malformed source rows AFTER normalized rows are in place ─────
const malformedIds = malformed.map(r => r.id);
const { rowCount: deleted } = await pool.query(
  `DELETE FROM agent_context_relations WHERE id = ANY($1::bigint[])`,
  [malformedIds],
);
console.log(`  ✓ deleted ${deleted} malformed rows (history preserved in context_timeline)`);

// ── 5. Final summary ──────────────────────────────────────────────────────
const { rows: stillBad } = await pool.query(
  `SELECT count(*) AS c FROM agent_context_relations WHERE target_key ~ '^cluster:[^a-zA-Z]'`,
);
const { rows: totals } = await pool.query(
  `SELECT relation, count(*) FROM agent_context_relations GROUP BY relation ORDER BY 2 DESC`,
);
console.log(`\n  remaining malformed: ${stillBad[0].c}`);
console.log(`  Final breakdown:`);
for (const c of totals) console.log(`    ${c.relation.padEnd(20)} ${c.count}`);

await pool.end();
console.log(`\n  Replay query:  SELECT * FROM context_timeline WHERE event_type='cluster_key_normalize' AND payload->>'run'='${RUN_HASH}';`);
