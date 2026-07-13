#!/usr/bin/env node
/**
 * Deep Evaluation Signal Quality Audit
 *
 * Analyzes what proper training signal looks like for a discriminative reranker.
 * Maps query → candidate → grade distribution → learned patterns.
 *
 * Output: blueprint for collection strategy that produces measurable ranking improvements.
 */

import pg from 'pg';
import * as fs from 'fs';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

interface EvaluationInsight {
  metric: string;
  value: number | string;
  interpretation: string;
  impact: 'critical' | 'high' | 'medium' | 'low';
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  DEEP EVALUATION SIGNAL QUALITY AUDIT                         ║');
  console.log('║  What makes a reranker training dataset discriminative?       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const insights: EvaluationInsight[] = [];

  try {
    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION 1: Current State Analysis
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('SECTION 1: CURRENT STATE ANALYSIS\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const currentState = await pool.query(`
      SELECT
        COUNT(*) as total_pairs,
        COUNT(DISTINCT query_id) as unique_queries,
        COUNT(DISTINCT packet_key) as unique_packets,
        COUNT(DISTINCT chunk_id) as unique_chunks,
        MIN(relevance_grade) as min_grade,
        MAX(relevance_grade) as max_grade,
        COUNT(CASE WHEN relevance_grade = 0 THEN 1 END) as grade_0_count,
        COUNT(CASE WHEN relevance_grade = 1 THEN 1 END) as grade_1_count,
        COUNT(CASE WHEN relevance_grade = 2 THEN 1 END) as grade_2_count,
        COUNT(CASE WHEN relevance_grade = 3 THEN 1 END) as grade_3_count
      FROM evaluation_relevance_corrected;
    `);

    const state = currentState.rows[0];

    console.log(`Total training pairs:        ${state.total_pairs}`);
    console.log(`Unique queries:              ${state.unique_queries}`);
    console.log(`Pairs per query (avg):       ${(state.total_pairs / state.unique_queries).toFixed(1)}`);
    console.log(`Unique packets:              ${state.unique_packets}`);
    console.log(`Grade range:                 ${state.min_grade}–${state.max_grade}`);
    console.log(`\nGrade distribution:\n`);
    console.log(`  Grade 0 (irrelevant):      ${state.grade_0_count} (${(state.grade_0_count / state.total_pairs * 100).toFixed(1)}%)`);
    console.log(`  Grade 1 (somewhat):        ${state.grade_1_count} (${(state.grade_1_count / state.total_pairs * 100).toFixed(1)}%)`);
    console.log(`  Grade 2 (relevant):        ${state.grade_2_count} (${(state.grade_2_count / state.total_pairs * 100).toFixed(1)}%)`);
    console.log(`  Grade 3 (highly):          ${state.grade_3_count} (${(state.grade_3_count / state.total_pairs * 100).toFixed(1)}%)`);
    console.log('');

    insights.push({
      metric: 'Grade diversity',
      value: `${state.max_grade - state.min_grade + 1} unique grades`,
      interpretation:
        state.max_grade - state.min_grade < 2
          ? 'CRITICAL: Only one grade present. Reranker cannot learn ranking differences.'
          : 'Multiple grades present. Can learn relative ranking.',
      impact: 'critical',
    });

    insights.push({
      metric: 'Query coverage',
      value: `${state.unique_queries} queries`,
      interpretation:
        state.unique_queries < 50
          ? 'LOW: Insufficient query diversity. Risk of overfitting to specific query patterns.'
          : state.unique_queries < 150
            ? 'MEDIUM: Acceptable but could be higher for robustness.'
            : 'GOOD: Sufficient diversity for generalizable patterns.',
      impact: 'high',
    });

    insights.push({
      metric: 'Candidates per query',
      value: `${(state.total_pairs / state.unique_queries).toFixed(1)} avg`,
      interpretation:
        (state.total_pairs / state.unique_queries).toFixed(1) < 20
          ? 'LOW: Need ≥20 candidates per query to capture ranking patterns.'
          : 'GOOD: Sufficient candidates for rank learning.',
      impact: 'high',
    });

    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION 2: Signal Variance Analysis
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('SECTION 2: SIGNAL VARIANCE ANALYSIS\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const variance = await pool.query(`
      SELECT
        query_id,
        COUNT(*) as candidates_per_query,
        COUNT(DISTINCT relevance_grade) as grades_per_query,
        MAX(relevance_grade) - MIN(relevance_grade) as grade_span,
        STDDEV(relevance_grade::float) as grade_stddev
      FROM evaluation_relevance_corrected
      GROUP BY query_id
      ORDER BY grade_span DESC, grade_stddev DESC
      LIMIT 20;
    `);

    console.log('Top 20 queries by grade variance (best for learning):\n');

    let discriminativeQueries = 0;
    for (const row of variance.rows) {
      const discriminative = row.grade_span >= 2;
      if (discriminative) discriminativeQueries++;

      const marker = row.grade_span >= 2 ? '✓' : '✗';
      console.log(
        `${marker} Query: ${row.query_id.substring(0, 8)}... | ` +
          `${row.candidates_per_query} candidates | ` +
          `${row.grades_per_query} grades | ` +
          `span: ${row.grade_span} | ` +
          `σ: ${row.grade_stddev?.toFixed(2) || 'N/A'}`
      );
    }

    console.log(`\nDiscriminative queries (span ≥2): ${discriminativeQueries}/20`);
    console.log('');

    insights.push({
      metric: 'Discriminative queries',
      value: `${discriminativeQueries}/20 in top-20`,
      interpretation:
        discriminativeQueries < 5
          ? 'CRITICAL: Queries lack grade variance. Model cannot learn rankings.'
          : discriminativeQueries < 15
            ? 'MEDIUM: Some queries have variance, others uniform.'
            : 'GOOD: Most queries span multiple grades.',
      impact: 'critical',
    });

    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION 3: Feature Signal Quality
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('SECTION 3: FEATURE SIGNAL QUALITY\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const features = await pool.query(`
      SELECT
        relevance_grade,
        COUNT(*) as grade_count,
        AVG((COALESCE(feature_envelope::json->'dense', '0.5')::text::float)) as avg_dense,
        AVG((COALESCE(feature_envelope::json->'lexical', '0.5')::text::float)) as avg_lexical,
        AVG((COALESCE(feature_envelope::json->'ast', '0.5')::text::float)) as avg_ast,
        AVG((COALESCE(feature_envelope::json->'graph', '0.5')::text::float)) as avg_graph,
        COUNT(DISTINCT packet_key) as unique_packets
      FROM evaluation_relevance_corrected
      WHERE feature_envelope IS NOT NULL
      GROUP BY relevance_grade
      ORDER BY relevance_grade;
    `);

    console.log('Feature envelope means by grade:\n');
    console.log('Grade | Count    | Dense | Lexical | AST   | Graph | Packets');
    console.log('─────────────────────────────────────────────────────────────');

    for (const row of features.rows) {
      console.log(
        `  ${row.relevance_grade}   | ${String(row.grade_count).padEnd(8)} | ` +
          `${(row.avg_dense || 0).toFixed(3)} | ${(row.avg_lexical || 0).toFixed(3)} | ` +
          `${(row.avg_ast || 0).toFixed(3)} | ${(row.avg_graph || 0).toFixed(3)} | ${row.unique_packets}`
      );
    }

    console.log('');

    // Check if features correlate with grades
    const correlation = await pool.query(`
      SELECT
        CORR((COALESCE(feature_envelope::json->'dense', '0.5')::text::float), relevance_grade::float) as dense_corr,
        CORR((COALESCE(feature_envelope::json->'lexical', '0.5')::text::float), relevance_grade::float) as lexical_corr,
        CORR((COALESCE(feature_envelope::json->'ast', '0.5')::text::float), relevance_grade::float) as ast_corr,
        CORR((COALESCE(feature_envelope::json->'graph', '0.5')::text::float), relevance_grade::float) as graph_corr
      FROM evaluation_relevance_corrected
      WHERE feature_envelope IS NOT NULL;
    `);

    const corr = correlation.rows[0];
    console.log('Feature-Grade Correlations (should be >0.3 for predictive power):\n');
    console.log(`  Dense:   ${(corr.dense_corr || 0).toFixed(3)} ${(corr.dense_corr || 0) > 0.3 ? '✓' : '✗'}`);
    console.log(`  Lexical: ${(corr.lexical_corr || 0).toFixed(3)} ${(corr.lexical_corr || 0) > 0.3 ? '✓' : '✗'}`);
    console.log(`  AST:     ${(corr.ast_corr || 0).toFixed(3)} ${(corr.ast_corr || 0) > 0.3 ? '✓' : '✗'}`);
    console.log(`  Graph:   ${(corr.graph_corr || 0).toFixed(3)} ${(corr.graph_corr || 0) > 0.3 ? '✓' : '✗'}`);
    console.log('');

    insights.push({
      metric: 'Feature-grade correlation',
      value:
        Math.max(
          corr.dense_corr || 0,
          corr.lexical_corr || 0,
          corr.ast_corr || 0,
          corr.graph_corr || 0
        ).toFixed(3),
      interpretation:
        Math.max(
          corr.dense_corr || 0,
          corr.lexical_corr || 0,
          corr.ast_corr || 0,
          corr.graph_corr || 0
        ) < 0.2
          ? 'WEAK: Features do not correlate with grades. Reranker signal is random.'
          : 'MODERATE: Some feature-grade alignment exists.',
      impact: 'critical',
    });

    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION 4: Required Signal Characteristics
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('SECTION 4: PROPER EVALUATION DATASET SPECIFICATION\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    console.log('For a discriminative reranker to learn, you need:\n');

    console.log('1. QUERY DIVERSITY');
    console.log('   ├─ Count: 150–300 unique queries');
    console.log('   ├─ Source: Code comments, feature descriptions, summaries');
    console.log('   ├─ Requirement: Each query must have ≥20 candidates');
    console.log('   └─ Why: Captures different retrieval intents & patterns\n');

    console.log('2. GRADE DISTRIBUTION (balanced)');
    console.log('   ├─ Grade 0 (irrelevant):    30–35% [hard negatives]');
    console.log('   ├─ Grade 1 (somewhat):      30–35% [soft negatives]');
    console.log('   ├─ Grade 2 (relevant):      20–25% [positives]');
    console.log('   ├─ Grade 3 (highly):        10–15% [gold positives]');
    console.log('   └─ Why: Balanced classes prevent model collapse to majority class\n');

    console.log('3. DISCRIMINATIVE SIGNAL');
    console.log('   ├─ Grade span per query: ≥2 (e.g., 0 and 2, or 1 and 3)');
    console.log('   ├─ Feature-grade correlation: ≥0.3 for ≥1 feature');
    console.log('   ├─ Per-query grade variance: σ ≥0.5');
    console.log('   └─ Why: Model learns to distinguish relevant from irrelevant\n');

    console.log('4. GRADING RUBRIC (deterministic)');
    console.log('   ├─ Grade 0: Not related to query topic, different domain');
    console.log('   ├─ Grade 1: Related but tangential, partial overlap');
    console.log('   ├─ Grade 2: Directly addresses query, solves stated problem');
    console.log('   ├─ Grade 3: Best possible match, complete + authoritative');
    console.log('   └─ Why: Consistent grading prevents label noise\n');

    console.log('5. HARD NEGATIVES & EDGE CASES');
    console.log('   ├─ False positives: High BM25/dense but actually irrelevant');
    console.log('   ├─ Ranking inversions: Grade 0 ranked above grade 3');
    console.log('   ├─ Ambiguous cases: Grade 1 vs 2 boundary (LLM-assisted)');
    console.log('   └─ Why: Forces reranker to learn subtle distinctions\n');

    console.log('6. GOLD VS WEAK LABELS');
    console.log('   ├─ Gold (human): 50–100 queries (expensive, high quality)');
    console.log('   ├─ Weak (Gemma4): 50–200 queries (cheap, LLM-assisted)');
    console.log('   ├─ Gemma4 rubric: Few-shot examples + query context');
    console.log('   └─ Why: Hybrid approach balances quality & cost\n');

    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION 5: Collection Blueprint
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('SECTION 5: COLLECTION BLUEPRINT\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    console.log('Step 1: Generate 150 Seed Queries');
    console.log('  1a. Extract from atlas_packets.summary (natural language)');
    console.log('  1b. Extract from code comments (intent/purpose)');
    console.log('  1c. Extract from feature requests (user queries)');
    console.log('  1d. Generate synthetic queries via Gemma4 (domain coverage)');
    console.log('  1e. Filter: ≥20 char, ≤200 char, English\n');

    console.log('Step 2: Retrieve Top-128 Candidates per Query');
    console.log('  2a. Use unified-orchestrator (content_384 + lexical + AST)');
    console.log('  2b. Return feature_envelope + source_ref + summary');
    console.log('  2c. Dedup by source_ref (no multiple chunks from same file)');
    console.log('  2d. Sample stratified: top-10, mid-50, tail-68\n');

    console.log('Step 3: Grade Candidates (hybrid approach)');
    console.log('  3a. Gold set (50 queries × 20 candidates = 1000 pairs):');
    console.log('      - Manual grading by domain expert');
    console.log('      - Time: ~2-3 hours');
    console.log('  3b. Weak set (100 queries × 30 candidates = 3000 pairs):');
    console.log('      - Gemma4 with few-shot rubric + query context');
    console.log('      - Time: ~5 min (parallel batching)');
    console.log('  3c. Hybrid set (training on gold, validating on weak)');
    console.log('  3d. Test set (remaining): locked for final eval\n');

    console.log('Step 4: Validate Distribution');
    console.log('  4a. Run this audit script on new data');
    console.log('  4b. Check: all 4 grades present, ≥0.3 feature-grade correlation');
    console.log('  4c. Verify: ≥15/20 queries have grade_span ≥2\n');

    console.log('Step 5: Train & Evaluate Reranker');
    console.log('  5a. Split: gold (1000) → train, weak (3000) → validation');
    console.log('  5b. Reranker: XGBoost on feature_envelope + confidence');
    console.log('  5c. Metric: NDCG@5, Recall@20, MRR');
    console.log('  5d. Baseline: DeterministicReranker (feature blend only)\n');

    // ════════════════════════════════════════════════════════════════════════════════
    // SECTION 6: Summary & Recommendations
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('SECTION 6: AUDIT SUMMARY & RECOMMENDATIONS\n');
    console.log('─────────────────────────────────────────────────────────────\n');

    const criticalInsights = insights.filter((i) => i.impact === 'critical');
    const highInsights = insights.filter((i) => i.impact === 'high');

    console.log(`CRITICAL ISSUES: ${criticalInsights.length}`);
    for (const insight of criticalInsights) {
      console.log(`  ✗ ${insight.metric}: ${insight.value}`);
      console.log(`    → ${insight.interpretation}\n`);
    }

    console.log(`HIGH PRIORITY: ${highInsights.length}`);
    for (const insight of highInsights) {
      console.log(`  ⚠ ${insight.metric}: ${insight.value}`);
      console.log(`    → ${insight.interpretation}\n`);
    }

    console.log('IMMEDIATE ACTIONS:');
    console.log('  1. Label current 33K as "derived_blend_v1" (weak labels, bootstrap only)');
    console.log('  2. Create collection pipeline for 150 seed queries');
    console.log('  3. Implement Gemma4 grading with few-shot rubric');
    console.log('  4. Collect 1000 gold labels (manual) + 3000 weak labels (Gemma4)');
    console.log('  5. Re-run this audit on new data to verify signal quality');
    console.log('  6. Train XGBoost only after audit passes all critical gates\n');

    console.log('EXPECTED OUTCOME:');
    console.log('  ├─ Reranker learns to rank grade 3 > grade 2 > grade 1 > grade 0');
    console.log('  ├─ NDCG@5 improvement: 15–25% over DeterministicReranker');
    console.log('  ├─ Recall@20 improvement: 10–20%');
    console.log('  └─ Quality now measurable, reproducible, defensible\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
