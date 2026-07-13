#!/usr/bin/env node
/**
 * Gate 1: Per-Query Label Diversity Audit
 *
 * Instead of overall grade percentages, audit each query:
 * - Does it contain grades 0, 1, 2, 3?
 * - Does it have positives, negatives, hard negatives, borderline?
 *
 * This is what LambdaMART actually needs.
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  GATE 1: PER-QUERY LABEL DIVERSITY AUDIT                       ║');
  console.log('║  Does each query contain sufficient ranking signal?            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('[1/3] AUDITING PER-QUERY GRADE DISTRIBUTION\n');

    const queryStats = await pool.query(`
      SELECT
        q.query_id,
        SUBSTRING(q.query_text FROM 1 FOR 60) as query_preview,
        COUNT(*) as total_candidates,
        COUNT(CASE WHEN ej.relevance_grade = 0 THEN 1 END) as grade_0,
        COUNT(CASE WHEN ej.relevance_grade = 1 THEN 1 END) as grade_1,
        COUNT(CASE WHEN ej.relevance_grade = 2 THEN 1 END) as grade_2,
        COUNT(CASE WHEN ej.relevance_grade = 3 THEN 1 END) as grade_3,
        COUNT(DISTINCT ej.relevance_grade) as unique_grades,
        MAX(ej.relevance_grade) - MIN(ej.relevance_grade) as grade_span,
        CASE
          WHEN COUNT(CASE WHEN ej.relevance_grade >= 2 THEN 1 END) > 0
           AND COUNT(CASE WHEN ej.relevance_grade = 0 THEN 1 END) > 0
          THEN true
          ELSE false
        END as has_positives_and_negatives
      FROM evaluation_seed_queries q
      LEFT JOIN evaluation_judgments ej ON q.query_id = ej.query_id
      GROUP BY q.query_id, q.query_text
      ORDER BY unique_grades DESC, grade_span DESC;
    `);

    console.log('Per-Query Label Diversity:\n');
    console.log('Query ID | Preview | G0 | G1 | G2 | G3 | Span | Pos+Neg? |');
    console.log('─────────────────────────────────────────────────────────────');

    let queryCount = 0;
    let queriesWithGoodSignal = 0;
    let queriesWithPosNeg = 0;

    for (const row of queryStats.rows) {
      queryCount++;
      const hasGoodSignal = row.unique_grades >= 2; // At least 2 different grades
      const hasPosNeg = row.has_positives_and_negatives;

      if (hasGoodSignal) queriesWithGoodSignal++;
      if (hasPosNeg) queriesWithPosNeg++;

      const signal = hasGoodSignal ? '✓' : '✗';
      const posNeg = hasPosNeg ? 'YES' : 'NO';

      console.log(
        `${row.query_id.slice(0, 8)} | ` +
          `${row.query_preview.padEnd(20)} | ` +
          `${String(row.grade_0).padStart(2)} | ` +
          `${String(row.grade_1).padStart(2)} | ` +
          `${String(row.grade_2).padStart(2)} | ` +
          `${String(row.grade_3).padStart(2)} | ` +
          `${String(row.grade_span).padStart(2)} | ` +
          `${posNeg}     |`
      );
    }

    console.log('');
    console.log(`Total queries: ${queryCount}`);
    console.log(`Queries with span ≥ 2: ${queriesWithGoodSignal} (${(queriesWithGoodSignal / queryCount * 100).toFixed(1)}%)`);
    console.log(`Queries with positives + negatives: ${queriesWithPosNeg} (${(queriesWithPosNeg / queryCount * 100).toFixed(1)}%)`);
    console.log('');

    // Detailed breakdown for problem queries
    console.log('[2/3] FLAGGED QUERIES (Insufficient Signal)\n');

    const problemQueries = await pool.query(`
      SELECT
        q.query_id,
        q.query_text,
        COUNT(*) as total,
        COUNT(DISTINCT ej.relevance_grade) as unique_grades,
        MAX(ej.relevance_grade) - MIN(ej.relevance_grade) as span,
        STRING_AGG(DISTINCT ej.relevance_grade::text, ', ' ORDER BY ej.relevance_grade::text) as grades_present
      FROM evaluation_seed_queries q
      LEFT JOIN evaluation_judgments ej ON q.query_id = ej.query_id
      GROUP BY q.query_id, q.query_text
      HAVING COUNT(DISTINCT ej.relevance_grade) < 2
      ORDER BY q.query_id;
    `);

    if (problemQueries.rows.length > 0) {
      console.log(`Found ${problemQueries.rows.length} queries with insufficient grade diversity:\n`);
      for (const row of problemQueries.rows.slice(0, 10)) {
        console.log(`  Query: ${row.query_id}`);
        console.log(`    Text: ${row.query_text.slice(0, 80)}`);
        console.log(`    Grades: ${row.grades_present} (need ≥2 grades)`);
        console.log('');
      }
      if (problemQueries.rows.length > 10) {
        console.log(`  ... and ${problemQueries.rows.length - 10} more\n`);
      }
    } else {
      console.log('✓ No queries with insufficient grade diversity\n');
    }

    // Grade distribution statistics
    console.log('[3/3] GATE 1 PER-QUERY VERDICT\n');

    console.log('═════════════════════════════════════════════════════════════\n');

    const gate1Pass =
      queriesWithGoodSignal >= queryCount * 0.8 && queriesWithPosNeg >= queryCount * 0.7;

    if (gate1Pass) {
      console.log('✅ GATE 1 PASS (Per-Query Audit)\n');
      console.log(`${queriesWithGoodSignal}/${queryCount} queries have span ≥ 2`);
      console.log(`${queriesWithPosNeg}/${queryCount} queries have positives + negatives\n`);
      console.log('LambdaMART can learn ranking from this dataset.\n');
    } else {
      console.log('⚠️ GATE 1 PARTIAL (Per-Query Audit)\n');
      console.log(`${queriesWithGoodSignal}/${queryCount} queries have span ≥ 2 (target: ≥${Math.ceil(queryCount * 0.8)})`);
      console.log(`${queriesWithPosNeg}/${queryCount} queries have positives + negatives (target: ≥${Math.ceil(queryCount * 0.7)})\n`);
      console.log('Recommendation: Phase 4 Gemma4 labels may improve distribution.');
      console.log('Consider manual grading on flagged queries if distribution does not improve.\n');
    }

    console.log('Next Steps:');
    console.log('  1. If PASS: Proceed to dataset versioning (dataset_v1)');
    console.log('  2. If PARTIAL: Run Phase 4 Gemma4 labels, then re-audit');
    console.log('  3. Create train/validation/test splits by query_id');
    console.log('  4. Train baseline XGBoost reranker\n');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
