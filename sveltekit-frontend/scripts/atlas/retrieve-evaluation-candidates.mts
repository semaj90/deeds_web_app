#!/usr/bin/env node
/**
 * Phase 2: Candidate Retrieval for Evaluation
 *
 * For each seed query, retrieve top-128 candidates via unified-orchestrator.
 * Stores (query_id, packet_key, candidate_rank, retrieval_score).
 *
 * Output: evaluation_candidates table (ready for grading)
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('\nPhase 2: Candidate Retrieval for Evaluation');
  console.log('Retrieve top-128 candidates per query\n');

  try {
    console.log('[1/3] LOADING SEED QUERIES');
    console.log('');

    const queries = await pool.query(`
      SELECT query_id, query_text, source_type
      FROM evaluation_seed_queries
      ORDER BY confidence DESC;
    `);

    console.log(`Loaded ${queries.rows.length} seed queries`);
    console.log('');

    // Create table
    console.log('[2/3] CREATING CANDIDATES TABLE');
    console.log('');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evaluation_candidates (
        id SERIAL PRIMARY KEY,
        query_id VARCHAR(12) NOT NULL,
        packet_key VARCHAR(100) NOT NULL,
        candidate_rank INT NOT NULL,
        retrieval_score FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(query_id, packet_key),
        FOREIGN KEY (query_id) REFERENCES evaluation_seed_queries(query_id) ON DELETE CASCADE
      );
    `);

    console.log('Table created');
    console.log('');

    // Simulate retrieval (in real impl: call unified-orchestrator API)
    console.log('[3/3] SIMULATING CANDIDATE RETRIEVAL');
    console.log('');
    console.log('Note: This simulates retrieval. In production, fetch from /api/retrieval/unified');
    console.log('');

    let totalCandidates = 0;
    let queriesProcessed = 0;

    for (const queryRow of queries.rows) {
      const queryId = queryRow.query_id;

      // Simulate retrieval: fetch random packets as candidates
      // In production: call unified-orchestrator.search(queryRow.query_text)
      const candidates = await pool.query(
        `
        SELECT
          packet_key,
          ROW_NUMBER() OVER (ORDER BY RANDOM()) as rank,
          RANDOM() * 0.5 + 0.5 as score
        FROM atlas_packets
        WHERE packet_key NOT IN (
          SELECT packet_key FROM evaluation_candidates WHERE query_id = $1
        )
        ORDER BY RANDOM()
        LIMIT 128;
      `,
        [queryId]
      );

      // Insert candidates
      if (candidates.rows.length > 0) {
        const placeholders = candidates.rows
          .map((_, idx) => `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`)
          .join(',');

        const params = candidates.rows.flatMap((row) => [queryId, row.packet_key, row.rank, row.score]);

        await pool.query(
          `
          INSERT INTO evaluation_candidates (query_id, packet_key, candidate_rank, retrieval_score)
          VALUES ${placeholders}
          ON CONFLICT DO NOTHING;
        `,
          params
        );

        totalCandidates += candidates.rows.length;
        queriesProcessed++;
      }
    }

    console.log(`Processed ${queriesProcessed} queries`);
    console.log(`Retrieved ${totalCandidates} candidates total`);
    console.log('');

    // Summary stats
    console.log('PHASE 2 SUMMARY\n');

    const stats = await pool.query(`
      SELECT
        COUNT(DISTINCT query_id) as total_queries,
        COUNT(*) as total_candidates,
        ROUND(AVG(candidate_count)) as avg_candidates_per_query,
        MIN(candidate_count) as min_candidates,
        MAX(candidate_count) as max_candidates
      FROM (
        SELECT
          query_id,
          COUNT(*) as candidate_count
        FROM evaluation_candidates
        GROUP BY query_id
      ) subq;
    `);

    const s = stats.rows[0];
    console.log(`  Queries with candidates:   ${s.total_queries}`);
    console.log(`  Total candidates:          ${s.total_candidates}`);
    console.log(`  Avg candidates per query:  ${s.avg_candidates_per_query}`);
    console.log(`  Range:                     ${s.min_candidates}-${s.max_candidates}`);
    console.log('');

    console.log('PHASE 2 COMPLETE: Candidates ready for manual grading\n');
    console.log('Next: Phase 3 - Manual grading (50 queries x 20 candidates = 1000 pairs)');
    console.log('       Phase 4 - Gemma4 weak labels (100 queries x 30 candidates = 3000 pairs)');
    console.log('');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
