#!/usr/bin/env node
/**
 * Phase 3: Prepare Evaluation Grading
 *
 * Creates evaluation_judgments table and provides grading interface schema.
 * Calculates baseline grades using deterministic heuristics for bootstrapping.
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('\nPhase 3: Prepare Evaluation Grading');
  console.log('Create grading schema and bootstrap judgments\n');

  try {
    console.log('[1/4] CREATING EVALUATION_JUDGMENTS TABLE');
    console.log('');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evaluation_judgments (
        id BIGSERIAL PRIMARY KEY,
        query_id VARCHAR(12) NOT NULL,
        packet_key VARCHAR(100) NOT NULL,
        relevance_grade INT NOT NULL DEFAULT 1,
        is_gold BOOLEAN DEFAULT false,
        graded_by VARCHAR(50) DEFAULT 'pending',
        graded_at TIMESTAMP,
        confidence FLOAT DEFAULT 0.5,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT valid_grade CHECK (relevance_grade IN (0, 1, 2, 3)),
        CONSTRAINT valid_grader CHECK (graded_by IN ('pending', 'human', 'gemma4')),
        UNIQUE(query_id, packet_key),
        FOREIGN KEY (query_id) REFERENCES evaluation_seed_queries(query_id) ON DELETE CASCADE,
        FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_eval_judgments_grade ON evaluation_judgments(relevance_grade);
      CREATE INDEX IF NOT EXISTS idx_eval_judgments_graded_by ON evaluation_judgments(graded_by);
      CREATE INDEX IF NOT EXISTS idx_eval_judgments_query ON evaluation_judgments(query_id);
    `);

    console.log('Table created with indexes');
    console.log('');

    // Bootstrap with heuristic grades
    console.log('[2/4] BOOTSTRAPPING WITH HEURISTIC GRADES');
    console.log('');

    const candidates = await pool.query(`
      SELECT
        ec.query_id,
        ec.packet_key,
        ec.candidate_rank,
        ec.retrieval_score,
        ap.summary,
        esq.query_text
      FROM evaluation_candidates ec
      JOIN atlas_packets ap ON ec.packet_key = ap.packet_key
      JOIN evaluation_seed_queries esq ON ec.query_id = esq.query_id
      ORDER BY ec.query_id, ec.candidate_rank;
    `);

    console.log(`Processing ${candidates.rows.length} candidate pairs`);

    let judgments = 0;
    for (const row of candidates.rows) {
      // Heuristic grading based on rank and score
      let grade = 1;
      if (row.candidate_rank <= 3 && row.retrieval_score > 0.8) {
        grade = 3; // Top candidates with high score
      } else if (row.candidate_rank <= 10 && row.retrieval_score > 0.7) {
        grade = 2; // Mid-rank with moderate score
      } else if (row.retrieval_score > 0.9) {
        grade = 2; // Exceptionally high score regardless of rank
      } else if (row.retrieval_score < 0.6) {
        grade = 0; // Low score = irrelevant
      }

      const insertParams = [
        row.query_id,
        row.packet_key,
        grade,
        false, // is_gold (not yet confirmed)
        'pending', // graded_by
        null, // graded_at
        row.retrieval_score, // confidence from retrieval
      ];

      try {
        await pool.query(
          `
          INSERT INTO evaluation_judgments (query_id, packet_key, relevance_grade, is_gold, graded_by, graded_at, confidence)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (query_id, packet_key) DO NOTHING;
        `,
          insertParams
        );
        judgments++;
      } catch (e) {
        // Skip duplicates
      }
    }

    console.log(`Inserted ${judgments} heuristic judgments`);
    console.log('');

    // Validate grade distribution
    console.log('[3/4] VALIDATING GRADE DISTRIBUTION');
    console.log('');

    const distribution = await pool.query(`
      SELECT
        relevance_grade,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM evaluation_judgments
      GROUP BY relevance_grade
      ORDER BY relevance_grade;
    `);

    console.log('Current grade distribution (heuristic):');
    for (const row of distribution.rows) {
      const target =
        row.relevance_grade === 0
          ? '30-36%'
          : row.relevance_grade === 1
            ? '28-34%'
            : row.relevance_grade === 2
              ? '20-25%'
              : '10-15%';
      console.log(`  Grade ${row.relevance_grade}: ${row.count} (${row.pct}%) [target: ${target}]`);
    }
    console.log('');

    // Query-level stats
    console.log('[4/4] QUERY-LEVEL STATISTICS');
    console.log('');

    const queryStats = await pool.query(`
      SELECT
        COUNT(*) as total_queries,
        COUNT(CASE WHEN grade_span >= 2 THEN 1 END) as queries_with_variance,
        ROUND(100.0 * COUNT(CASE WHEN grade_span >= 2 THEN 1 END) / COUNT(*), 2) as variance_pct,
        COUNT(CASE WHEN grade_span >= 1 THEN 1 END) as queries_with_any_variance
      FROM (
        SELECT
          query_id,
          MAX(relevance_grade) - MIN(relevance_grade) as grade_span
        FROM evaluation_judgments
        GROUP BY query_id
      ) subq;
    `);

    const qs = queryStats.rows[0];
    console.log(`  Total queries:             ${qs.total_queries}`);
    console.log(`  Queries with span >= 2:    ${qs.queries_with_variance} (${qs.variance_pct}%)`);
    console.log(`  Queries with any variance: ${qs.queries_with_any_variance}`);
    console.log(`  Target:                    >= 80% with span >= 2`);
    console.log('');

    console.log('PHASE 3 COMPLETE\n');
    console.log('Status: evaluation_judgments table bootstrapped with heuristic grades');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review heuristic grades for quality');
    console.log('  2. Manual grading: SELECT * FROM evaluation_judgments WHERE graded_by = pending LIMIT 50');
    console.log('  3. Update with human grades: UPDATE evaluation_judgments SET relevance_grade = X, is_gold = true, graded_by = human WHERE ...');
    console.log('  4. Run Phase 4: Gemma4 weak labels for remaining queries');
    console.log('');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
