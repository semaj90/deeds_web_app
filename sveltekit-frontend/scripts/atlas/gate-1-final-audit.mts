#!/usr/bin/env node
/**
 * Gate 1: Final Audit
 *
 * Complete audit of evaluation data quality against all 4 gates.
 * Outputs: pass/fail status, remediation recommendations
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  GATE 1: EVALUATION DATA QUALITY AUDIT (FINAL)                 ║');
  console.log('║  Discriminative signal validation for reranker training        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('GATE 1: Grade Distribution Check\n');

    const distribution = await pool.query(`
      SELECT
        relevance_grade,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM evaluation_judgments
      GROUP BY relevance_grade
      ORDER BY relevance_grade;
    `);

    const targets: Record<number, [number, number]> = {
      0: [30, 36],
      1: [28, 34],
      2: [20, 25],
      3: [10, 15],
    };

    let gate1Pass = true;
    for (const row of distribution.rows) {
      const [minPct, maxPct] = targets[row.relevance_grade];
      const status = row.pct >= minPct && row.pct <= maxPct ? 'OK' : 'FAIL';
      if (status === 'FAIL') gate1Pass = false;

      console.log(
        `  Grade ${row.relevance_grade}: ${row.count.toLocaleString()} (${row.pct}%) ` +
          `[target: ${minPct}-${maxPct}%] ${status}`
      );
    }

    console.log(`\n  Gate 1: ${gate1Pass ? 'PASS' : 'FAIL'}\n`);

    // Gate 2: Query variance
    console.log('GATE 2: Query Variance Check (span >= 2)\n');

    const variance = await pool.query(`
      SELECT
        COUNT(*) as total_queries,
        COUNT(CASE WHEN grade_span >= 2 THEN 1 END) as with_variance,
        ROUND(100.0 * COUNT(CASE WHEN grade_span >= 2 THEN 1 END) / COUNT(*), 2) as variance_pct
      FROM (
        SELECT
          query_id,
          MAX(relevance_grade) - MIN(relevance_grade) as grade_span
        FROM evaluation_judgments
        GROUP BY query_id
      ) sq;
    `);

    const v = variance.rows[0];
    const gate2Pass = v.variance_pct >= 80;

    console.log(`  Total queries: ${v.total_queries}`);
    console.log(`  With span >= 2: ${v.with_variance} (${v.variance_pct}%)`);
    console.log(`  Target: >= 80%`);
    console.log(`\n  Gate 2: ${gate2Pass ? 'PASS' : 'FAIL'}\n`);

    // Gate 3: Feature-grade correlation
    console.log('GATE 3: Feature-Grade Correlation Check\n');

    // Check correlation between candidate rank and grade
    const correlation = await pool.query(`
      SELECT
        CORR(candidate_rank::float, relevance_grade::float) as rank_grade_corr,
        CORR(retrieval_score::float, relevance_grade::float) as score_grade_corr
      FROM evaluation_judgments ej
      JOIN evaluation_candidates ec ON ej.query_id = ec.query_id AND ej.packet_key = ec.packet_key;
    `);

    const corr = correlation.rows[0];
    const rankCorr = Math.abs(corr.rank_grade_corr || 0);
    const scoreCorr = Math.abs(corr.score_grade_corr || 0);
    const gate3Pass = rankCorr >= 0.20 || scoreCorr >= 0.30; // At least one shows correlation

    console.log(`  Rank vs Grade correlation: ${rankCorr.toFixed(3)} [target: >0.20] ${rankCorr >= 0.20 ? 'OK' : 'WEAK'}`);
    console.log(`  Score vs Grade correlation: ${scoreCorr.toFixed(3)} [target: >0.30] ${scoreCorr >= 0.30 ? 'OK' : 'WEAK'}`);
    console.log(`\n  Gate 3: ${gate3Pass ? 'PASS' : 'WEAK'}\n`);

    // Gate 4: Sample diversity
    console.log('GATE 4: Sample Diversity Check\n');

    const diversity = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM evaluation_judgments) as total_judgments,
        (SELECT COUNT(DISTINCT query_id) FROM evaluation_judgments) as unique_queries,
        (SELECT COUNT(DISTINCT packet_key) FROM evaluation_judgments) as unique_packets,
        MAX(pairs_per_query) as max_pairs_per_query,
        ROUND(AVG(pairs_per_query)) as avg_pairs_per_query
      FROM (
        SELECT
          query_id,
          COUNT(*) as pairs_per_query
        FROM evaluation_judgments
        GROUP BY query_id
      ) sq;
    `);

    const div = diversity.rows[0];
    const maxPairsOk = div.max_pairs_per_query <= 1000;
    const gate4Pass = maxPairsOk && div.unique_packets > 100;

    console.log(`  Total judgments: ${div.total_judgments.toLocaleString()}`);
    console.log(`  Unique queries: ${div.unique_queries}`);
    console.log(`  Unique packets: ${div.unique_packets}`);
    console.log(`  Avg pairs per query: ${div.avg_pairs_per_query}`);
    console.log(`  Max pairs per query: ${div.max_pairs_per_query} [target: <= 1000] ${maxPairsOk ? 'OK' : 'FAIL'}`);
    console.log(`\n  Gate 4: ${gate4Pass ? 'PASS' : 'FAIL'}\n`);

    // Summary
    console.log('═════════════════════════════════════════════════════════════\n');
    console.log('GATE 1 FINAL VERDICT\n');

    const allPass = gate1Pass && gate2Pass && gate3Pass && gate4Pass;
    const partialPass = (gate2Pass && gate3Pass && gate4Pass) && !gate1Pass;

    if (allPass) {
      console.log('✅ ALL GATES PASS\n');
      console.log('Evaluation data is READY for XGBoost training.\n');
      console.log('Recommended next steps:');
      console.log('  1. Rename current evaluation_judgments to evaluation_judgments_bootstrap');
      console.log('  2. Collect manual + Gemma4 grades (Phase 4)');
      console.log('  3. Merge manual grades into evaluation_judgments with is_gold=true');
      console.log('  4. Train Stage 2 XGBoost reranker');
      console.log('  5. Implement Runtime Reranker interface');
    } else if (partialPass) {
      console.log('⚠️  PARTIAL PASS (Gates 2-4 pass, Gate 1 needs distribution adjustment)\n');
      console.log('Recommendation: Grade distribution can be tuned via manual review phase.');
      console.log('Current data is SUFFICIENT for initial training with operator acceptance.\n');
      console.log('To fix Gate 1 distribution (30-36% grade 0):');
      console.log('  • Review queries with low variance (rare grade 3)');
      console.log('  • Adjust heuristic thresholds to assign more grade 3 to top-5 candidates');
      console.log('  • Manual graders: prioritize top candidates for "best match" grades');
    } else {
      console.log('❌ GATE 1 FAILED - Insufficient evaluation data quality\n');
      console.log('Recommendation: Return to Phase 3-4 (manual + Gemma4 grading)');
    }

    console.log('\nCurrent evaluation state:');
    console.log(`  Table size: ${div.total_judgments.toLocaleString()} judgments`);
    console.log(`  Gold labels: ${(await pool.query(`SELECT COUNT(*) FROM evaluation_judgments WHERE is_gold=true;`)).rows[0].count} (manual)`);
    console.log(`  Weak labels: ${(await pool.query(`SELECT COUNT(*) FROM evaluation_judgments WHERE is_gold=false;`)).rows[0].count} (heuristic)`);
    console.log('');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
