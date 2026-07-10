#!/usr/bin/env node
/**
 * compute-hmm-transition-matrix.mjs
 *
 * Builds HMM transition matrix directly from error_feedback + error_logs
 * using SQL aggregation. No training, no PyTorch — just statistics.
 *
 * Output: JSON object mapping (previous_state, next_state) → success_probability
 */

import { config } from 'dotenv';
import pg from 'pg';

config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/legal_ai_db',
});

async function computeTransitionMatrix() {
  console.log('[HMM] Computing transition matrix from error_feedback...\n');

  // SQL: group error_feedback by inferred state transition
  // Inferred from fix_strategy + outcome (helpful/worksSoon)
  const query = `
    SELECT
      CASE
        WHEN el.fix_strategy ILIKE '%retrieve%' THEN 'RETRIEVE'
        WHEN el.fix_strategy ILIKE '%validate%' THEN 'VALIDATE'
        WHEN el.fix_strategy ILIKE '%recover%' THEN 'RECOVER'
        WHEN el.fix_strategy ILIKE '%graph%' THEN 'GRAPH'
        WHEN el.fix_strategy ILIKE '%synthesize%' THEN 'SYNTHESIZE'
        ELSE 'START'
      END AS previous_state,
      CASE
        WHEN ef.works_soon = true OR (el.fix_confidence::numeric > 0.7) THEN 'DONE'
        WHEN el.fix_strategy ILIKE '%retry%' THEN 'RETRIEVE'
        WHEN el.fix_strategy ILIKE '%validate%' THEN 'VALIDATE'
        WHEN el.fix_strategy ILIKE '%recover%' THEN 'RECOVER'
        WHEN el.fix_strategy ILIKE '%expand%' THEN 'GRAPH'
        WHEN el.fix_strategy ILIKE '%summarize%' THEN 'SYNTHESIZE'
        ELSE 'ERROR'
      END AS next_state,
      COUNT(*) AS transitions,
      SUM(CASE WHEN ef.works_soon = true OR (el.fix_confidence::numeric > 0.7) THEN 1 ELSE 0 END) AS successes,
      AVG(EXTRACT(EPOCH FROM (el.fixed_at - el.created_at))::numeric * 1000) AS avg_latency_ms,
      AVG(el.fix_confidence::numeric) AS avg_confidence
    FROM error_logs el
    LEFT JOIN error_feedback ef ON ef.suggestion_id = (
      SELECT es.id FROM error_suggestions es
      JOIN error_clusters ec ON es.cluster_id = ec.id
      WHERE ec.pattern = el.error_category
      LIMIT 1
    )
    WHERE el.created_at > NOW() - INTERVAL '90 days'
    GROUP BY previous_state, next_state
    ORDER BY transitions DESC;
  `;

  try {
    const result = await pool.query(query);
    const transitions = result.rows;

    if (transitions.length === 0) {
      console.log('[HMM] No transitions found in error_feedback table.');
      console.log('[HMM] Populate error_logs, error_feedback with historical data first.\n');
      return null;
    }

    // Build transition matrix: (prev, next) → probability
    const matrix = {};
    const totalByPrevious = {};

    for (const row of transitions) {
      const key = `${row.previous_state} → ${row.next_state}`;
      const count = parseInt(row.transitions, 10) || 1;
      const successes = parseInt(row.successes, 10) || 0;
      const prob = successes / count; // P(next_state | previous_state)

      matrix[key] = {
        count,
        successes,
        successRate: prob.toFixed(3),
        avgLatencyMs: Math.round(parseFloat(row.avg_latency_ms || '0')),
        avgConfidence: (parseFloat(row.avg_confidence || '0.5')).toFixed(2),
      };

      const prevKey = row.previous_state;
      totalByPrevious[prevKey] = (totalByPrevious[prevKey] || 0) + count;
    }

    // Print summary
    console.log('[HMM] Transition Matrix (90-day window)\n');
    console.log('State Transition                    | Count | Success% | Latency(ms) | Confidence');
    console.log('-'.repeat(85));

    for (const [key, stats] of Object.entries(matrix)) {
      const successPct = (parseFloat(stats.successRate) * 100).toFixed(0);
      console.log(
        `${key.padEnd(35)} | ${String(stats.count).padStart(5)} | ${successPct.padStart(7)}% | ` +
        `${String(stats.avgLatencyMs).padStart(11)} | ${stats.avgConfidence}`
      );
    }

    console.log('\n[HMM] State Distribution (total transitions by from-state):');
    for (const [state, count] of Object.entries(totalByPrevious).sort()) {
      console.log(`  ${state.padEnd(15)} ${count} transitions`);
    }

    console.log('\n[HMM] Emission Probabilities (Viterbi uses these to pick next state):\n');
    const emission = {};
    for (const state of ['START', 'RETRIEVE', 'VALIDATE', 'RECOVER', 'GRAPH', 'SYNTHESIZE', 'ERROR']) {
      const nexts = Object.entries(matrix)
        .filter(([k]) => k.startsWith(state + ' →'))
        .map(([, v]) => parseFloat(v.successRate));
      if (nexts.length > 0) {
        emission[state] = Math.max(...nexts); // Pick best transition from this state
      }
    }
    console.log(JSON.stringify(emission, null, 2));

    return {
      matrix,
      emission,
      totalTransitions: result.rows.reduce((sum, r) => sum + parseInt(r.transitions, 10), 0),
      windowDays: 90,
    };
  } catch (err) {
    console.error('[HMM] Query failed:', err.message);
    return null;
  } finally {
    await pool.end();
  }
}

const result = await computeTransitionMatrix();
if (result) {
  console.log('\n[HMM] Matrix computed successfully.');
  console.log(`[HMM] Total transitions: ${result.totalTransitions}`);
  console.log('[HMM] Ready for Viterbi decoding.\n');
}
