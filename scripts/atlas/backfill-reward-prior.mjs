#!/usr/bin/env node
/**
 * backfill-reward-prior.mjs
 *
 * Reads agent_traces with outcome='success' and propagates reward signals
 * into atlas_packets.reward_prior and atlas_packets.payload (reward_score,
 * reward_source, reward_timestamp).
 *
 * Join strategy:
 *   retrieved_packets entries like "packet:{label}:{N}" → extract {label}
 *   → update all atlas_packets where concept_ids @> ARRAY['{label}']
 *   Score is weighted: trace.score (0-1) * hit_count / total_hits_for_label
 *
 * Two-pass approach:
 *   Pass 1: aggregate label → [score, ...] from all success traces
 *   Pass 2: compute avg reward per label, UPDATE atlas_packets in batch
 *
 * Usage:
 *   node scripts/atlas/backfill-reward-prior.mjs             # dry-run
 *   node scripts/atlas/backfill-reward-prior.mjs --apply
 *   node scripts/atlas/backfill-reward-prior.mjs --apply --verbose
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !APPLY;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// Decay factor: partial traces contribute less reward
const OUTCOME_WEIGHT = { success: 1.0, partial: 0.4, failure: 0.0 };

// How much reward to award per hit
// Final reward_prior = clamp(existing + weighted_increment, 0, 10)
const REWARD_INCREMENT_PER_HIT = 0.15;

async function main() {
  console.log(`\n═══ Backfill Reward Prior ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  try {
    // ── 1. Load canonical concept allowlist ───────────────────────────────────
    const { rows: crRows } = await pool.query(
      `SELECT concept_id FROM concept_records`
    );
    const canonicalIds = new Set(crRows.map(r => r.concept_id));
    console.log(`Canonical concept labels: ${canonicalIds.size}`);

    // ── 2. Load all success (and partial) traces with retrieved_packets ───────
    const { rows: traceRows } = await pool.query(`
      SELECT trace_id, outcome, score, retrieved_packets
      FROM agent_traces
      WHERE outcome IN ('success', 'partial')
        AND retrieved_packets IS NOT NULL
        AND jsonb_array_length(retrieved_packets) > 0
      ORDER BY created_at DESC
    `);
    console.log(`Traces loaded: ${traceRows.length} (success+partial)`);

    // ── 3. Build label → accumulated reward map ───────────────────────────────
    // label → { totalWeight, hitCount }
    const labelRewards = new Map();

    let packetRefCount = 0;
    let noiseRefCount  = 0;

    for (const trace of traceRows) {
      const weight = OUTCOME_WEIGHT[trace.outcome] ?? 0;
      if (weight === 0) continue;

      const score    = Number(trace.score ?? 0);
      const refs     = trace.retrieved_packets; // already parsed array from pg

      for (const ref of refs) {
        if (typeof ref !== 'string') continue;

        if (ref.startsWith('packet:')) {
          const parts = ref.split(':');
          // parts[1] = feature_label, parts[2] = artifact_id (optional)
          const label = parts[1];
          if (!label || !canonicalIds.has(label)) {
            noiseRefCount++;
            continue;
          }
          packetRefCount++;

          const existing = labelRewards.get(label) ?? { totalWeight: 0, hitCount: 0 };
          existing.totalWeight += weight * score;
          existing.hitCount    += 1;
          labelRewards.set(label, existing);
        }
        // concept: refs also carry signal but they're less specific — skip for now
      }
    }

    console.log(`Packet refs processed: ${packetRefCount} canonical, ${noiseRefCount} noise/unknown`);
    console.log(`Labels with reward signal: ${labelRewards.size}`);

    if (VERBOSE) {
      for (const [label, { totalWeight, hitCount }] of [...labelRewards.entries()].sort((a,b) => b[1].totalWeight - a[1].totalWeight)) {
        console.log(`  ${label}: hitCount=${hitCount} totalWeight=${totalWeight.toFixed(3)} avgScore=${(totalWeight/hitCount).toFixed(3)}`);
      }
    }

    if (labelRewards.size === 0) {
      console.log('\n⚠️  No reward signal found — check agent_traces.retrieved_packets format');
      process.exitCode = 1;
      return;
    }

    // ── 4. Compute per-packet reward increment ────────────────────────────────
    // For each label, the reward increment applied to matched packets is:
    //   avgScore * REWARD_INCREMENT_PER_HIT
    // We also store the count so heavy labels don't over-dominate
    const labelUpdate = [];
    for (const [label, { totalWeight, hitCount }] of labelRewards.entries()) {
      const avgScore      = totalWeight / hitCount;
      const rewardIncrement = Math.min(avgScore * REWARD_INCREMENT_PER_HIT, 0.5);
      labelUpdate.push({ label, avgScore, hitCount, rewardIncrement });
    }

    // ── 5. Count affected packets ─────────────────────────────────────────────
    let totalAffected = 0;
    for (const { label } of labelUpdate) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) as n FROM atlas_packets WHERE concept_ids @> ARRAY[$1::text]`,
        [label]
      );
      const n = parseInt(rows[0].n, 10);
      totalAffected += n;
      if (VERBOSE) console.log(`  ${label}: ${n} packets will be updated`);
    }
    console.log(`\nPackets to update: ${totalAffected}`);

    // ── 6. Dry-run report ─────────────────────────────────────────────────────
    const report = {
      generated_at: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      traces_loaded: traceRows.length,
      packet_refs_canonical: packetRefCount,
      packet_refs_noise: noiseRefCount,
      labels_with_signal: labelRewards.size,
      packets_to_update: totalAffected,
      label_updates: labelUpdate,
    };

    if (DRY_RUN) {
      console.log('\n(dry-run — no DB writes; run with --apply to apply)');
      writeReport(report);
      return;
    }

    // ── 7. Apply updates ──────────────────────────────────────────────────────
    console.log('\nApplying reward updates…');
    let totalUpdated = 0;
    const now = new Date().toISOString();

    for (const { label, avgScore, rewardIncrement, hitCount } of labelUpdate) {
      // UPDATE reward_prior (clamp 0-10) and merge reward fields into payload
      const result = await pool.query(`
        UPDATE atlas_packets
        SET
          reward_prior  = LEAST(COALESCE(reward_prior, 0) + $2, 10),
          updated_at    = NOW(),
          payload       = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  COALESCE(payload, '{}'),
                  '{reward_score}',
                  to_jsonb(LEAST(COALESCE((payload->>'reward_score')::float, 0) + $2, 1.0))
                ),
                '{reward_source}',
                $3::jsonb
              ),
              '{reward_timestamp}',
              $4::jsonb
            ),
            '{reward_hit_count}',
            to_jsonb(COALESCE((payload->>'reward_hit_count')::int, 0) + $5)
          )
        WHERE concept_ids @> ARRAY[$1::text]
      `, [
        label,
        rewardIncrement,
        JSON.stringify('agent_trace_success'),
        JSON.stringify(now),
        hitCount,
      ]);

      const n = result.rowCount ?? 0;
      totalUpdated += n;
      if (VERBOSE) console.log(`  ${label}: updated ${n} packets (+${rewardIncrement.toFixed(4)})`);
    }

    console.log(`\nUpdated: ${totalUpdated} packets`);

    // ── 8. Verify coverage ────────────────────────────────────────────────────
    const { rows: covRows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN reward_prior > 0 THEN 1 END) AS with_reward,
        COUNT(CASE WHEN payload ? 'reward_score' THEN 1 END) AS with_reward_score,
        AVG(reward_prior) AS avg_reward_prior,
        MAX(reward_prior) AS max_reward_prior
      FROM atlas_packets
    `);
    const cov = covRows[0];
    const coverage = (parseInt(cov.with_reward, 10) / parseInt(cov.total, 10) * 100).toFixed(1);

    console.log('\n══ Coverage After Backfill ══');
    console.log(`  Total packets:   ${cov.total}`);
    console.log(`  reward_prior > 0: ${cov.with_reward} (${coverage}%)`);
    console.log(`  payload.reward_score: ${cov.with_reward_score}`);
    console.log(`  Avg reward_prior: ${parseFloat(cov.avg_reward_prior).toFixed(4)}`);
    console.log(`  Max reward_prior: ${parseFloat(cov.max_reward_prior).toFixed(4)}`);

    const gatePass = parseInt(cov.with_reward, 10) > 0;
    console.log(`\n  ${gatePass ? '✅ GATE PASS' : '⚠️  GATE FAIL'} (reward_prior > 0 for ≥1 packet)`);

    Object.assign(report, {
      applied: true,
      total_updated: totalUpdated,
      coverage_pct: parseFloat(coverage),
      avg_reward_prior: parseFloat(cov.avg_reward_prior),
      max_reward_prior: parseFloat(cov.max_reward_prior),
      packets_with_reward_score: parseInt(cov.with_reward_score, 10),
      gate: { pass: gatePass },
    });
    writeReport(report);

    console.log('\n══ Summary ══');
    console.log(`  Traces consumed: ${traceRows.length}`);
    console.log(`  Labels updated:  ${labelUpdate.length}`);
    console.log(`  Packets updated: ${totalUpdated}`);
    console.log(`  Report: docs/reports/backfill-reward-prior.json`);

  } finally {
    await pool.end();
  }
}

function writeReport(report) {
  const dir = path.join(ROOT, 'docs', 'reports');
  mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'backfill-reward-prior.json');
  writeFileSync(p, JSON.stringify(report, null, 2));
  console.log(`\nReport: docs/reports/backfill-reward-prior.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
