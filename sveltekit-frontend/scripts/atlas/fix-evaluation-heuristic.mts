#!/usr/bin/env node
/**
 * Fix evaluation heuristic grades
 *
 * Previous heuristic was too aggressive. Use a simpler approach:
 * - Rank position determines initial bias (top candidates more likely to be relevant)
 * - Score provides confidence adjustment
 * - Add variance across grades
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('\nFixing Evaluation Heuristic Grades\n');

  try {
    console.log('[1/2] CLEARING OLD HEURISTIC GRADES');
    console.log('');

    await pool.query(`TRUNCATE evaluation_judgments;`);
    console.log('Cleared evaluation_judgments table');
    console.log('');

    console.log('[2/2] APPLYING IMPROVED HEURISTIC');
    console.log('');

    const candidates = await pool.query(`
      SELECT
        ec.query_id,
        ec.packet_key,
        ec.candidate_rank,
        ec.retrieval_score
      FROM evaluation_candidates ec
      ORDER BY ec.query_id, ec.candidate_rank;
    `);

    console.log(`Processing ${candidates.rows.length} candidates`);

    let grade0 = 0, grade1 = 0, grade2 = 0, grade3 = 0;

    for (const row of candidates.rows) {
      // Improved heuristic: rank + score determine grade distribution
      const rank = row.candidate_rank;
      const score = row.retrieval_score;

      let grade: number;

      // Top 5: more likely to be grade 2-3
      if (rank <= 5) {
        if (score > 0.85) grade = 3;
        else if (score > 0.75) grade = 2;
        else if (score > 0.65) grade = 1;
        else grade = 0;
      }
      // Rank 6-30: mix of grades
      else if (rank <= 30) {
        if (score > 0.85) grade = 2;
        else if (score > 0.75) grade = 1;
        else if (score > 0.65) grade = 1;
        else grade = 0;
      }
      // Rank 31-80: mostly grade 0-1
      else if (rank <= 80) {
        if (score > 0.80) grade = 1;
        else if (score > 0.70) grade = 1;
        else grade = 0;
      }
      // Rank 81+: mostly grade 0
      else {
        grade = score > 0.75 ? 1 : 0;
      }

      await pool.query(
        `
        INSERT INTO evaluation_judgments (query_id, packet_key, relevance_grade, is_gold, graded_by, confidence)
        VALUES ($1, $2, $3, false, 'pending', $4)
        ON CONFLICT (query_id, packet_key) DO NOTHING;
      `,
        [row.query_id, row.packet_key, grade, row.retrieval_score]
      );

      if (grade === 0) grade0++;
      else if (grade === 1) grade1++;
      else if (grade === 2) grade2++;
      else if (grade === 3) grade3++;
    }

    console.log(`Inserted ${candidates.rows.length} improved judgments`);
    console.log('');

    // Validate distribution
    console.log('IMPROVED GRADE DISTRIBUTION\n');

    const total = grade0 + grade1 + grade2 + grade3;
    console.log(`  Grade 0: ${grade0} (${(grade0 / total * 100).toFixed(1)}%) [target: 30-36%]`);
    console.log(`  Grade 1: ${grade1} (${(grade1 / total * 100).toFixed(1)}%) [target: 28-34%]`);
    console.log(`  Grade 2: ${grade2} (${(grade2 / total * 100).toFixed(1)}%) [target: 20-25%]`);
    console.log(`  Grade 3: ${grade3} (${(grade3 / total * 100).toFixed(1)}%) [target: 10-15%]`);
    console.log('');

    const queryVariance = await pool.query(`
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

    const qv = queryVariance.rows[0];
    console.log('QUERY-LEVEL VARIANCE\n');
    console.log(`  Total queries: ${qv.total_queries}`);
    console.log(`  With span >= 2: ${qv.with_variance} (${qv.variance_pct}%) [target: >= 80%]`);
    console.log('');

    console.log('Heuristic grades fixed. Ready for Phase 4 (Gemma4 refinement)');
    console.log('');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
