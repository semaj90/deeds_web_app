#!/usr/bin/env node
/**
 * backfill-reward-prior.mjs
 *
 * Populates reward_prior on atlas_packets for packets where
 * reward_prior IS NULL or reward_prior = 0.
 *
 * Two strategies applied in priority order:
 *
 *   A) TRACE-BACKED (packets whose feature_id was referenced in agent_traces)
 *      Reward = weighted-average of trace scores across all outcomes:
 *        success weight 1.0  |  partial weight 0.5  |  failure weight 0.1
 *      Match: retrieved_packets entries "packet:feature_id:N" or
 *             "concept:feature_id" -> extract base feature_id label.
 *
 *   B) HEURISTIC (no trace signal for this packet's feature_id)
 *      Reward = clamp(sum of weighted signals, 0, 0.95):
 *        community_confidence        * 0.30
 *        has_bm25_summary (>20 chars)* 0.30
 *        has_concept_ids (len > 0)   * 0.20
 *        domain_confidence (payload) * 0.20
 *
 * Gate: >= 50% of ALL packets must have reward_prior >= 0.1 after backfill.
 *
 * Usage:
 *   node scripts/atlas/backfill-reward-prior.mjs             # dry-run (default)
 *   node scripts/atlas/backfill-reward-prior.mjs --dry-run   # explicit dry-run
 *   node scripts/atlas/backfill-reward-prior.mjs --apply     # write to DB
 *   node scripts/atlas/backfill-reward-prior.mjs --apply --verbose
 *   node scripts/atlas/backfill-reward-prior.mjs --apply --limit 1000
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Flags ─────────────────────────────────────────────────────────────────────

const APPLY   = process.argv.includes('--apply');
const DRY_RUN = !APPLY || process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT   = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx >= 0 ? Number(process.argv[idx + 1]) || 0 : 0;
})();

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// Trace outcome weights
const OUTCOME_WEIGHT = { success: 1.0, partial: 0.5, failure: 0.1 };

// Heuristic component weights (must sum to 1.0)
const W_COMMUNITY_CONF = 0.30;
const W_BM25_SUMMARY   = 0.30;
const W_CONCEPT_IDS    = 0.20;
const W_DOMAIN_CONF    = 0.20;
const HEURISTIC_CAP    = 0.95;

// Gate threshold
const GATE_PCT = 0.50;   // >= 50% of all packets must have reward_prior >= 0.1

// DB write batch size
const BATCH_SIZE = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
function round4(v)                 { return Math.round(v * 10000) / 10000; }
function pct(n, d)                 { return d ? (n / d * 100).toFixed(1) + '%' : '0.0%'; }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });

  try {
    console.log('');
    console.log('=== backfill-reward-prior ===');
    console.log('Mode   :', APPLY ? 'APPLY (writing to DB)' : 'DRY-RUN (no writes)');
    console.log('DB     :', DATABASE_URL.replace(/:([^:@]+)@/, ':***@'));
    console.log('');

    // ── Step 1: Baseline snapshot ─────────────────────────────────────────────

    const { rows: [snap] } = await pool.query(`
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE reward_prior > 0)                        AS already_set,
        COUNT(*) FILTER (WHERE reward_prior IS NULL OR reward_prior = 0) AS needs_backfill,
        COUNT(*) FILTER (WHERE reward_prior >= 0.1)                     AS high_reward
      FROM atlas_packets
    `);

    const total         = Number(snap.total);
    const alreadySet    = Number(snap.already_set);
    const needsBackfill = Number(snap.needs_backfill);
    const highBefore    = Number(snap.high_reward);

    console.log('IC. Baseline:');
    console.log(`    Total packets     : ${total.toLocaleString()}`);
    console.log(`    Already set (>0)  : ${alreadySet.toLocaleString()} (${pct(alreadySet, total)})`);
    console.log(`    Needs backfill    : ${needsBackfill.toLocaleString()} (${pct(needsBackfill, total)})`);
    console.log(`    High reward (>=.1): ${highBefore.toLocaleString()} (${pct(highBefore, total)})`);
    console.log('');

    if (needsBackfill === 0) {
      console.log('IC. Nothing to do -- all packets already have reward_prior > 0.');
      return;
    }

    // ── Step 2: Build trace-reward map per feature_id ─────────────────────────
    // retrieved_packets entries look like "packet:agent_intelligence:13"
    // or "concept:ui_components". We strip the leading segment type prefix and
    // trailing ":N" numeric suffix to get the base feature_id label.

    console.log('IC. Aggregating trace scores per feature_id ...');

    const { rows: traceRows } = await pool.query(`
      SELECT
        -- Strip "packet:" or "concept:" prefix, then strip trailing ":digits"
        regexp_replace(
          regexp_replace(elem, '^(packet|concept):', ''),
          ':\\d+$', ''
        )                                                              AS fid_base,
        SUM(
          CASE t.outcome
            WHEN 'success' THEN t.score * ${OUTCOME_WEIGHT.success}
            WHEN 'partial' THEN t.score * ${OUTCOME_WEIGHT.partial}
            WHEN 'failure' THEN t.score * ${OUTCOME_WEIGHT.failure}
            ELSE 0
          END
        )                                                              AS weighted_sum,
        SUM(
          CASE t.outcome
            WHEN 'success' THEN ${OUTCOME_WEIGHT.success}
            WHEN 'partial' THEN ${OUTCOME_WEIGHT.partial}
            WHEN 'failure' THEN ${OUTCOME_WEIGHT.failure}
            ELSE 0
          END
        )                                                              AS weight_total,
        COUNT(*)                                                       AS trace_count
      FROM agent_traces t,
           jsonb_array_elements_text(t.retrieved_packets) elem
      WHERE (elem LIKE 'packet:%' OR elem LIKE 'concept:%')
        AND t.score IS NOT NULL
      GROUP BY fid_base
    `);

    // Build Map: feature_id_base -> { reward, trace_count }
    const traceMap = new Map();
    for (const row of traceRows) {
      const wTotal = Number(row.weight_total);
      if (wTotal <= 0) continue;
      const reward = clamp(Number(row.weighted_sum) / wTotal);
      traceMap.set(row.fid_base, { reward: round4(reward), count: Number(row.trace_count) });
    }
    console.log(`    Distinct feature refs in traces : ${traceMap.size}`);
    console.log('');

    // ── Step 3: Load packets needing backfill ─────────────────────────────────

    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
    const { rows: packets } = await pool.query(`
      SELECT
        packet_id,
        feature_id,
        community_confidence,
        summary,
        concept_ids,
        (payload->>'domain_confidence')::double precision AS domain_confidence
      FROM atlas_packets
      WHERE reward_prior IS NULL OR reward_prior = 0
      ORDER BY feature_id NULLS LAST, packet_id
      ${limitClause}
    `);

    console.log(`IC. Packets to process: ${packets.length.toLocaleString()}`);
    console.log('');

    // ── Step 4: Compute rewards ───────────────────────────────────────────────

    let traceBackedCount = 0;
    let heuristicCount   = 0;
    let highCount        = 0;     // reward >= 0.1

    const updates = [];

    for (const pkt of packets) {
      const fid = (pkt.feature_id || '').trim();

      // Strategy A: trace-backed (try exact feature_id, then strip trailing :N)
      const traceHit =
        (fid && traceMap.get(fid)) ||
        (fid && traceMap.get(fid.replace(/:\d+$/, '')));

      let reward;
      let strategy;

      if (traceHit) {
        reward   = traceHit.reward;
        strategy = 'trace';
        traceBackedCount++;
      } else {
        // Strategy B: heuristic
        const commConf   = clamp(pkt.community_confidence ?? 0);
        const hasSummary = (pkt.summary && pkt.summary.trim().length > 20) ? 1 : 0;
        const hasConcept = (Array.isArray(pkt.concept_ids) && pkt.concept_ids.length > 0) ? 1 : 0;
        const domConf    = clamp(pkt.domain_confidence ?? 0);

        reward = clamp(
          commConf   * W_COMMUNITY_CONF +
          hasSummary * W_BM25_SUMMARY   +
          hasConcept * W_CONCEPT_IDS    +
          domConf    * W_DOMAIN_CONF,
          0,
          HEURISTIC_CAP
        );
        strategy = 'heuristic';
        heuristicCount++;
      }

      reward = round4(reward);
      if (reward >= 0.1) highCount++;

      updates.push({ packet_id: pkt.packet_id, reward_prior: reward, strategy });

      if (VERBOSE) {
        const fidLabel = fid.slice(0, 35).padEnd(36);
        console.log(`  [${strategy.padEnd(9)}] fid=${fidLabel} -> ${reward}`);
      }
    }

    // ── Step 5: Projected gate check ─────────────────────────────────────────

    // Conservative: assume already-set packets that were >= 0.1 before still are.
    // We don't know exactly how many of the already-set are >= 0.1, so we use the
    // pre-run highBefore count (which includes only packets with reward_prior >= 0.1
    // that were already set before this run).
    const projectedHigh = highBefore + highCount;
    const gateProjected = projectedHigh / total >= GATE_PCT;

    console.log('IC. Computed rewards:');
    console.log(`    Trace-backed      : ${traceBackedCount.toLocaleString()}`);
    console.log(`    Heuristic         : ${heuristicCount.toLocaleString()}`);
    console.log(`    New reward >= 0.1 : ${highCount.toLocaleString()} (${pct(highCount, packets.length)} of backfill batch)`);
    console.log('');
    console.log('IC. Gate projection (>= 50% of all packets with reward_prior >= 0.1):');
    console.log(`    Before            : ${highBefore.toLocaleString()} / ${total.toLocaleString()} (${pct(highBefore, total)})`);
    console.log(`    After (projected) : ${projectedHigh.toLocaleString()} / ${total.toLocaleString()} (${pct(projectedHigh, total)})`);
    console.log(`    Gate              : ${gateProjected ? 'PASS' : 'FAIL (check signal density)'}`);

    if (!gateProjected) {
      console.log('');
      console.log('WARN: Gate will FAIL. Enrich community_confidence, summaries, or');
      console.log('      concept_ids before XGBoost training.');
    }

    // ── Step 6: Dry-run exit or apply ─────────────────────────────────────────

    if (DRY_RUN) {
      console.log('');
      console.log('IC. DRY-RUN complete -- no writes performed.');
      console.log('    Re-run with --apply to write to DB.');

      // Sample preview
      if (!VERBOSE && updates.length > 0) {
        const sample = updates.slice(0, 8);
        console.log('');
        console.log('IC. Sample (first 8):');
        for (const u of sample) {
          const label = u.packet_id.slice(0, 55).padEnd(56);
          console.log(`    [${u.strategy.padEnd(9)}] ${label} -> ${u.reward_prior}`);
        }
      }
      return;
    }

    // ── Step 7: Write to DB ───────────────────────────────────────────────────

    console.log('');
    console.log(`IC. Writing ${updates.length.toLocaleString()} rows to atlas_packets.reward_prior ...`);

    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch       = updates.slice(i, i + BATCH_SIZE);
      const placeholders = batch
        .map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}::double precision)`)
        .join(', ');
      const values = batch.flatMap(u => [u.packet_id, u.reward_prior]);

      await pool.query(`
        UPDATE atlas_packets AS p
        SET    reward_prior = v.reward,
               updated_at  = NOW()
        FROM   (VALUES ${placeholders}) AS v(pid, reward)
        WHERE  p.packet_id = v.pid
          AND (p.reward_prior IS NULL OR p.reward_prior = 0)
      `, values);

      written += batch.length;
      process.stdout.write(`\r    Progress: ${written.toLocaleString()} / ${updates.length.toLocaleString()}`);
    }
    console.log('');

    // ── Step 8: Post-apply snapshot ───────────────────────────────────────────

    const { rows: [snap2] } = await pool.query(`
      SELECT
        COUNT(*)                                     AS total,
        COUNT(*) FILTER (WHERE reward_prior > 0)     AS has_reward,
        COUNT(*) FILTER (WHERE reward_prior >= 0.1)  AS high_reward,
        COUNT(*) FILTER (WHERE reward_prior IS NULL OR reward_prior = 0) AS still_zero,
        ROUND(AVG(reward_prior)::numeric, 4)          AS avg_reward
      FROM atlas_packets
    `);

    const t2    = Number(snap2.total);
    const hr2   = Number(snap2.has_reward);
    const high2 = Number(snap2.high_reward);
    const zero2 = Number(snap2.still_zero);
    const avg2  = Number(snap2.avg_reward);
    const gateActual = high2 / t2 >= GATE_PCT;

    console.log('');
    console.log('IC. Post-apply state:');
    console.log(`    Total packets      : ${t2.toLocaleString()}`);
    console.log(`    reward_prior > 0   : ${hr2.toLocaleString()} (${pct(hr2, t2)})`);
    console.log(`    reward_prior >= 0.1: ${high2.toLocaleString()} (${pct(high2, t2)})`);
    console.log(`    Still zero / null  : ${zero2.toLocaleString()} (${pct(zero2, t2)})`);
    console.log(`    Avg reward_prior   : ${avg2}`);
    console.log('');
    console.log(`    Gate (>= 50% >= 0.1): ${gateActual ? 'PASS' : 'FAIL'}`);

    // ── Step 9: Write report ──────────────────────────────────────────────────

    const reportDir = path.join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'backfill-reward-prior.json');
    const report = {
      generated_at:         new Date().toISOString(),
      mode:                 'apply',
      packets_processed:    updates.length,
      trace_backed:         traceBackedCount,
      heuristic:            heuristicCount,
      trace_feature_refs:   traceMap.size,
      new_high_reward:      highCount,
      post_apply: {
        total:         t2,
        has_reward:    hr2,
        high_reward:   high2,
        still_zero:    zero2,
        avg_reward:    avg2,
        gate_pass:     gateActual,
      },
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('');
    console.log('IC. Done.');
    console.log(`    Report: docs/reports/backfill-reward-prior.json`);

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
