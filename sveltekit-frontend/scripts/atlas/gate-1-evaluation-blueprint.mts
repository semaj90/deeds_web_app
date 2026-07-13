#!/usr/bin/env node
/**
 * Gate 1: Evaluation Data Blueprint
 *
 * Current state: 33,216 judgments, all grade 1 (100% uniform)
 * Impact: Mathematically unusable for training a discriminative reranker
 *
 * This script outputs the blueprint for collecting proper training signal.
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  GATE 1: EVALUATION DATA BLUEPRINT                            ║');
  console.log('║  Current: All grade 1 (unusable) → Target: Balanced 0-3       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // Current state
    console.log('[1/5] CURRENT STATE ANALYSIS\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const state = await pool.query(`
      SELECT
        COUNT(*) as total_pairs,
        COUNT(DISTINCT query_id) as unique_queries,
        COUNT(DISTINCT packet_key) as unique_packets,
        MIN(relevance_grade) as min_grade,
        MAX(relevance_grade) as max_grade,
        COUNT(CASE WHEN relevance_grade = 0 THEN 1 END) as grade_0,
        COUNT(CASE WHEN relevance_grade = 1 THEN 1 END) as grade_1,
        COUNT(CASE WHEN relevance_grade = 2 THEN 1 END) as grade_2,
        COUNT(CASE WHEN relevance_grade = 3 THEN 1 END) as grade_3
      FROM evaluation_relevance_corrected;
    `);

    const s = state.rows[0];
    console.log(`Total pairs:                 ${s.total_pairs}`);
    console.log(`Unique queries:              ${s.unique_queries}`);
    console.log(`Unique packets:              ${s.unique_packets}`);
    console.log(`Grade range:                 ${s.min_grade}–${s.max_grade}`);
    console.log(`\nGrade distribution:`);
    console.log(`  Grade 0 (irrelevant):      ${s.grade_0} (${(s.grade_0 / s.total_pairs * 100).toFixed(1)}%)`);
    console.log(`  Grade 1 (somewhat):        ${s.grade_1} (${(s.grade_1 / s.total_pairs * 100).toFixed(1)}%)`);
    console.log(`  Grade 2 (relevant):        ${s.grade_2} (${(s.grade_2 / s.total_pairs * 100).toFixed(1)}%)`);
    console.log(`  Grade 3 (highly):          ${s.grade_3} (${(s.grade_3 / s.total_pairs * 100).toFixed(1)}%)`);
    console.log('');

    // Query variance
    console.log('[2/5] QUERY VARIANCE ANALYSIS\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const variance = await pool.query(`
      SELECT
        query_id,
        COUNT(*) as candidates,
        COUNT(DISTINCT relevance_grade) as unique_grades,
        MAX(relevance_grade) - MIN(relevance_grade) as grade_span,
        STDDEV(relevance_grade::float) as stddev
      FROM evaluation_relevance_corrected
      GROUP BY query_id
      ORDER BY grade_span DESC, stddev DESC;
    `);

    let span_2_plus = 0;
    for (const row of variance.rows) {
      if (row.grade_span >= 2) span_2_plus++;
    }

    console.log(`Total queries:               ${variance.rows.length}`);
    console.log(`Queries with span ≥2:       ${span_2_plus} (${(span_2_plus / variance.rows.length * 100).toFixed(1)}%)`);
    console.log(`Expected for discriminative: ≥${Math.ceil(variance.rows.length * 0.75)} (75%)\n`);

    // Blueprint section
    console.log('[3/5] REQUIRED CHARACTERISTICS FOR RERANKER TRAINING\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    console.log('❌ CURRENT (Unusable):');
    console.log('   • Single grade (1 only) — model learns P(grade=1) = 1.0 regardless of features');
    console.log('   • No variance — cannot compute gradient for ranking signal');
    console.log('   • 50 queries — insufficient diversity, high overfitting risk');
    console.log('   • Uniform confidence (0.5) — all candidates equally weighted\n');

    console.log('✅ REQUIRED (Discriminative):');
    console.log('   • 4 grades (0, 1, 2, 3) — balanced distribution');
    console.log('   • Grade distribution: ~33% grade 0, ~30% grade 1, ~23% grade 2, ~14% grade 3');
    console.log('   • Query span ≥2 for ≥80% of queries — enables ranking learning');
    console.log('   • 150–300 queries — sufficient for generalization');
    console.log('   • Feature-grade correlation ≥0.3 — proves features discriminate\n');

    // Collection blueprint
    console.log('[4/5] COLLECTION STRATEGY BLUEPRINT\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    console.log('Phase 1: Seed Query Generation (Day 1)');
    console.log('  Source: Code comments, feature descriptions, summaries, Gemma4 synthetic');
    console.log('  Target: 150–300 diverse queries');
    console.log('  Validation: Query coverage check (no duplicates, distinct intent patterns)\n');

    console.log('Phase 2: Candidate Retrieval (Day 1–2)');
    console.log('  Method: unified-orchestrator (semantic + lexical + structural fusion)');
    console.log('  Top-K: Retrieve top-128 candidates per query');
    console.log('  Output: (query_id, packet_key, candidate_rank, retrieval_score)\n');

    console.log('Phase 3: Hybrid Grading (Day 2–4)');
    console.log('  Manual grading: 50 queries × ~20 top candidates = ~1,000 pairs (GOLD)');
    console.log('    • Grade rubric:');
    console.log('      0 = Irrelevant to query intent');
    console.log('      1 = Tangentially related, weak connection');
    console.log('      2 = Directly addresses query, useful result');
    console.log('      3 = Best possible match, ideal result');
    console.log('    • Target grade distribution per query: one grade 3, 2-3 grade 2, 3-5 grade 1, rest grade 0');
    console.log('  Gemma4 weak labels: 100 queries × ~30 candidates = ~3,000 pairs (WEAK)');
    console.log('    • Use Gemma4 with prompt: "Rate relevance of [packet] to query [q]: 0=none, 1=weak, 2=good, 3=best"');
    console.log('    • Mark all Gemma4 judgments as is_gold=false, graded_by=gemma4\n');

    console.log('Phase 4: Validation Gates (Day 4)');
    console.log('  Gate 1: Grade distribution check');
    console.log('    ✓ Grade 0: 30–36%');
    console.log('    ✓ Grade 1: 28–34%');
    console.log('    ✓ Grade 2: 20–25%');
    console.log('    ✓ Grade 3: 10–15%\n');
    console.log('  Gate 2: Query variance (span ≥2)');
    console.log('    ✓ ≥80% of queries must have span ≥2\n');
    console.log('  Gate 3: Feature-grade correlation');
    console.log('    ✓ Compute corr(dense_score, grade) → must be ≥0.30');
    console.log('    ✓ Compute corr(lexical_score, grade) → must be ≥0.30');
    console.log('    ✓ At least 2 features must show ≥0.30 correlation\n');
    console.log('  Gate 4: Sample diversity');
    console.log('    ✓ No single (query, packet) pair should dominate');
    console.log('    ✓ Max pairs per query: 1000 (enforce uniform sampling)\n');

    // Capacity estimate
    console.log('[5/5] CAPACITY ESTIMATE\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const totalPackets = 58365;
    const seedQueries = 200;
    const avgCandidatesPerQuery = 128;
    const manualQueries = 50;
    const manualCandidatesPerQuery = 20;
    const gemma4Queries = 100;
    const gemma4CandidatesPerQuery = 30;

    console.log(`Total codebase packets:      ${totalPackets.toLocaleString()}`);
    console.log(`\nProposed evaluation dataset:`);
    console.log(`  Seed queries:              ${seedQueries}`);
    console.log(`  Manual grading:            ${manualQueries} queries × ${manualCandidatesPerQuery} candidates = ${manualQueries * manualCandidatesPerQuery} pairs (GOLD)`);
    console.log(`  Gemma4 grading:            ${gemma4Queries} queries × ${gemma4CandidatesPerQuery} candidates = ${gemma4Queries * gemma4CandidatesPerQuery} pairs (WEAK)`);
    console.log(`  Total training pairs:      ${manualQueries * manualCandidatesPerQuery + gemma4Queries * gemma4CandidatesPerQuery}\n`);

    console.log(`Effort estimate:`);
    console.log(`  Seed generation:           2–4h (scripted + Gemma4)`);
    console.log(`  Candidate retrieval:       1–2h (batch query, parallelizable)`);
    console.log(`  Manual grading (50q):      10–15h (1000 pairs ÷ 80–100 pairs/hour)`);
    console.log(`  Gemma4 weak labels:        2–3h (API calls parallelizable)`);
    console.log(`  Validation gates:          1–2h (post-processing, analysis)`);
    console.log(`  Total:                     16–26h\n`);

    console.log('═════════════════════════════════════════════════════════════\n');
    console.log('GATE 1 VERDICT: ❌ FAILED\n');
    console.log('Current evaluation_relevance_corrected is MATHEMATICALLY UNUSABLE');
    console.log('for training a discriminative reranker (all grade 1, zero variance).\n');
    console.log('ACTION:');
    console.log('  1. Rename current rows: judgment_source = "derived_blend_v1", is_gold = false');
    console.log('  2. Use as bootstrap cache only (fallback for zero queries in new schema)');
    console.log('  3. Collect new training data per blueprint above');
    console.log('  4. Re-run Gate 1 audit once new data collected');
    console.log('  5. Proceed to XGBoost training only after all 4 gates pass\n');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
