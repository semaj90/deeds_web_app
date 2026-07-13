#!/usr/bin/env node
/**
 * Gate 1: Evaluation Data Audit
 *
 * Requirement: 100–300 representative queries, manually/LLM graded, with all grades 0–3 present
 * Current state: 33K rows, all grade 1 (unusable)
 *
 * Action: Document the gap, propose collection strategy
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('GATE 1: EVALUATION DATA AUDIT');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  try {
    // Current state
    console.log('[1/4] Current evaluation_relevance_corrected state:');
    const countResult = await pool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT query_id) as unique_queries,
        COUNT(DISTINCT packet_key) as unique_packets,
        judgment_source
      FROM evaluation_relevance_corrected
      GROUP BY judgment_source
      ORDER BY judgment_source;
    `);

    for (const row of countResult.rows) {
      console.log(`  ${row.judgment_source}: ${row.total_rows} rows (${row.unique_queries} queries, ${row.unique_packets} packets)`);
    }
    console.log('');

    // Grade distribution
    console.log('[2/4] Grade distribution:');
    const gradeResult = await pool.query(`
      SELECT
        relevance_grade,
        COUNT(*) as count,
        COUNT(DISTINCT query_id) as unique_queries,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM evaluation_relevance_corrected
      GROUP BY relevance_grade
      ORDER BY relevance_grade;
    `);

    if (gradeResult.rows.length === 0) {
      console.log('  ❌ NO ROWS');
    } else {
      for (const row of gradeResult.rows) {
        console.log(`  Grade ${row.relevance_grade}: ${row.count} rows (${row.unique_queries} queries, ${row.pct}%)`);
      }
    }
    console.log('');

    // Confidence distribution
    console.log('[3/4] Confidence distribution:');
    const confResult = await pool.query(`
      SELECT
        ROUND(confidence::numeric, 1) as conf_bucket,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM evaluation_relevance_corrected
      GROUP BY ROUND(confidence::numeric, 1)
      ORDER BY ROUND(confidence::numeric, 1);
    `);

    for (const row of confResult.rows) {
      console.log(`  Confidence ${row.conf_bucket}: ${row.count} (${row.pct}%)`);
    }
    console.log('');

    // GATE 1 VERDICT
    console.log('[4/4] GATE 1 ASSESSMENT:');
    console.log('');

    const hasGrade0 = gradeResult.rows.some((r) => r.relevance_grade === 0);
    const hasGrade1 = gradeResult.rows.some((r) => r.relevance_grade === 1);
    const hasGrade2 = gradeResult.rows.some((r) => r.relevance_grade === 2);
    const hasGrade3 = gradeResult.rows.some((r) => r.relevance_grade === 3);

    const uniqueQueries = countResult.rows.reduce((sum, r) => sum + r.unique_queries, 0);

    if (!hasGrade0 || !hasGrade1 || !hasGrade2 || !hasGrade3) {
      console.log('❌ GATE 1 FAILED');
      console.log('');
      console.log('Reason: Grade distribution incomplete');
      console.log(`  Grade 0 (irrelevant): ${hasGrade0 ? '✓' : '❌ MISSING'}`);
      console.log(`  Grade 1 (somewhat relevant): ${hasGrade1 ? '✓' : '❌ MISSING'}`);
      console.log(`  Grade 2 (relevant): ${hasGrade2 ? '✓' : '❌ MISSING'}`);
      console.log(`  Grade 3 (highly relevant): ${hasGrade3 ? '✓' : '❌ MISSING'}`);
      console.log('');
      console.log('Current row (33,216) comes from blend formula (all grade 1). Not usable for reranker training.');
    } else if (uniqueQueries < 100) {
      console.log('⚠️  GATE 1 PARTIAL');
      console.log(`  Only ${uniqueQueries} unique queries. Need ≥100 for representative coverage.`);
    } else {
      console.log('✓ GATE 1 PASSED');
      console.log(`  ${uniqueQueries} queries with grades 0–3.`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('RECOMMENDATION');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('1. Rename current 33K rows:');
    console.log('     UPDATE evaluation_relevance_corrected');
    console.log('     SET judgment_source = "derived_blend_v1", is_gold = false');
    console.log('     WHERE judgment_source = "derived"');
    console.log('');
    console.log('2. Generate NEW training data:');
    console.log('');
    console.log('   a) Sample 150 representative queries from:');
    console.log('      - User search logs (if available)');
    console.log('      - Feature-request text');
    console.log('      - Code comments + docstrings');
    console.log('      - Natural language descriptions from atlas_packets.summary');
    console.log('');
    console.log('   b) For each query, retrieve top-128 candidates');
    console.log('');
    console.log('   c) Grade each candidate:');
    console.log('      Grade 0: Irrelevant to query intent');
    console.log('      Grade 1: Somewhat relevant, tangentially related');
    console.log('      Grade 2: Relevant, directly addresses query');
    console.log('      Grade 3: Highly relevant, best possible match');
    console.log('');
    console.log('   d) Use Gemma4 for weak labels on uncertain cases');
    console.log('');
    console.log('3. Ensure balanced distribution:');
    console.log('      ~33% grade 0 (hard negatives)');
    console.log('      ~33% grade 1 (soft negatives)');
    console.log('      ~20% grade 2 (positives)');
    console.log('      ~14% grade 3 (gold positives)');
    console.log('');
    console.log('4. Add audit metadata:');
    console.log('      is_gold: boolean (manual or Gemma4-weak)');
    console.log('      graded_by: "human" | "gemma4"');
    console.log('      graded_at: timestamp');
    console.log('      gold_query_id: uuid (for grouping by query)');
    console.log('');
    console.log('Without quality training data, XGBoost cannot learn discriminative patterns.');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
