#!/usr/bin/env node
/**
 * audit-ranking-signal-coverage.mjs
 *
 * Measures ranking signal density across atlas_packets and agent_traces.
 * Gate rule: do not train XGBoost until thresholds pass.
 *
 * Thresholds:
 *   bm25_text      >= 85%
 *   community_conf >= 95%
 *   concept_ids    >= 60%
 *   reward_history >= 20% (optional)
 *
 * Usage:
 *   node scripts/atlas/audit-ranking-signal-coverage.mjs
 *   node scripts/atlas/audit-ranking-signal-coverage.mjs --save
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const SAVE = process.argv.includes('--save');

const THRESHOLDS = {
  bm25_text:          0.85,
  community_conf:     0.95,
  concept_ids:        0.60,
  reward_history:     0.20,  // optional — does not block gate
};

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

  try {
    // ── atlas_packets signals ─────────────────────────────────────────────────
    const { rows: [pk] } = await pool.query(`
      SELECT
        COUNT(*)                                                                       AS total,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref != '')            AS with_source_ref,
        COUNT(*) FILTER (WHERE length(summary) > 20)                                  AS bm25_summary,
        COUNT(*) FILTER (WHERE length(payload->>'bm25_text') > 20)                    AS bm25_payload,
        COUNT(*) FILTER (WHERE community_source IS NOT NULL)                           AS community_source,
        COUNT(*) FILTER (WHERE community_confidence > 0)                               AS community_conf_any,
        COUNT(*) FILTER (WHERE community_confidence >= 0.65)                           AS community_conf_high,
        -- concept_ids gate: scoped to packets with a non-empty source_ref (addressable packets)
        COUNT(*) FILTER (WHERE concept_ids IS NOT NULL AND cardinality(concept_ids)>0 AND source_ref IS NOT NULL AND source_ref != '') AS concept_ids_sourced,
        COUNT(*) FILTER (WHERE concept_ids IS NOT NULL AND cardinality(concept_ids)>0) AS concept_ids,
        COUNT(*) FILTER (WHERE payload->>'reward_score' IS NOT NULL)                   AS reward_payload
      FROM atlas_packets
    `);

    // ── agent_traces signals ──────────────────────────────────────────────────
    const { rows: [tr] } = await pool.query(`
      SELECT
        COUNT(*)                                                                            AS total,
        COUNT(*) FILTER (WHERE jsonb_array_length(selected_concepts) > 0)                  AS selected_concepts,
        COUNT(*) FILTER (WHERE score > 0)                                                   AS score_gt0,
        COUNT(*) FILTER (WHERE outcome = 'success')                                         AS success
      FROM agent_traces
    `);

    const pktTotal     = Number(pk.total);
    const srcTotal     = Number(pk.with_source_ref);  // addressable packets (non-empty source_ref)
    const trTotal      = Number(tr.total);

    function pct(n)     { return pktTotal > 0 ? Number(n) / pktTotal : 0; }
    function srcPct(n)  { return srcTotal  > 0 ? Number(n) / srcTotal  : 0; }
    function tpct(n)    { return trTotal   > 0 ? Number(n) / trTotal   : 0; }

    const signals = {
      // BM25 text: whichever coverage is higher (summary vs payload bm25_text)
      bm25_text:            Math.max(pct(pk.bm25_summary), pct(pk.bm25_payload)),
      bm25_summary_only:    pct(pk.bm25_summary),
      bm25_payload_only:    pct(pk.bm25_payload),
      community_source:     pct(pk.community_source),
      community_conf_any:   pct(pk.community_conf_any),
      community_conf_high:  pct(pk.community_conf_high),
      // concept_ids gate: scoped to addressable packets (non-empty source_ref)
      concept_ids:          srcPct(pk.concept_ids_sourced),
      concept_ids_all:      pct(pk.concept_ids),   // informational — includes empty-ref rows
      reward_payload:       pct(pk.reward_payload),
      // agent_traces
      selected_concepts:    tpct(tr.selected_concepts),
      trace_score:          tpct(tr.score_gt0),
      trace_success:        tpct(tr.success),
    };

    // ── Gate evaluation ───────────────────────────────────────────────────────
    const gateChecks = {
      bm25_text:      signals.bm25_text      >= THRESHOLDS.bm25_text,
      community_conf: signals.community_conf_any >= THRESHOLDS.community_conf,
      concept_ids:    signals.concept_ids    >= THRESHOLDS.concept_ids,
      reward_history: signals.reward_payload >= THRESHOLDS.reward_history,  // optional
    };

    const blockers = ['bm25_text', 'community_conf', 'concept_ids'].filter(k => !gateChecks[k]);
    const gate     = blockers.length === 0 ? 'PASS' : 'FAIL_UNTIL_SIGNAL_DENSITY';

    // ── Print ─────────────────────────────────────────────────────────────────
    const pf = (v) => (v * 100).toFixed(1) + '%';
    console.log('\n═══ Ranking Signal Coverage Audit ═══');
    console.log(`\nPackets: ${pktTotal.toLocaleString()} (${srcTotal.toLocaleString()} addressable)  |  Traces: ${trTotal.toLocaleString()}`);
    console.log('\nAtlas Packets:');
    console.log(`  BM25 text (summary)    ${pf(signals.bm25_summary_only).padStart(6)}  (threshold ≥${pf(THRESHOLDS.bm25_text)})  ${gateChecks.bm25_text ? '✅' : '❌'}`);
    console.log(`  BM25 text (payload)    ${pf(signals.bm25_payload_only).padStart(6)}`);
    console.log(`  community_source       ${pf(signals.community_source).padStart(6)}`);
    console.log(`  community_conf (any)   ${pf(signals.community_conf_any).padStart(6)}  (threshold ≥${pf(THRESHOLDS.community_conf)})  ${gateChecks.community_conf ? '✅' : '❌'}`);
    console.log(`  community_conf ≥0.65   ${pf(signals.community_conf_high).padStart(6)}`);
    console.log(`  concept_ids            ${pf(signals.concept_ids).padStart(6)}  (threshold ≥${pf(THRESHOLDS.concept_ids)}, scoped to addressable)  ${gateChecks.concept_ids ? '✅' : '❌'}`);
    console.log(`  reward_score (payload) ${pf(signals.reward_payload).padStart(6)}  (optional ≥${pf(THRESHOLDS.reward_history)})  ${gateChecks.reward_history ? '✅' : '⚠️ '}`);
    console.log('\nAgent Traces:');
    console.log(`  selected_concepts      ${pf(signals.selected_concepts).padStart(6)}`);
    console.log(`  score > 0              ${pf(signals.trace_score).padStart(6)}`);
    console.log(`  outcome = success      ${pf(signals.trace_success).padStart(6)}`);
    console.log(`\n  Gate: ${gate}`);
    if (blockers.length) console.log(`  Blocking gaps: ${blockers.join(', ')}`);

    // ── Output ────────────────────────────────────────────────────────────────
    const report = {
      generated_at: new Date().toISOString(),
      total_packets: pktTotal,
      total_traces:  trTotal,
      signals,
      thresholds: THRESHOLDS,
      gate_checks: gateChecks,
      gate,
      blockers,
    };

    if (SAVE) {
      const outDir = join(ROOT, 'docs', 'reports');
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, 'ranking-signal-coverage.json');
      writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
      console.log(`\n  Report: docs/reports/ranking-signal-coverage.json`);
    }

    return report;
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
