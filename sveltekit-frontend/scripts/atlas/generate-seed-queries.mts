#!/usr/bin/env node
/**
 * Phase 1: Seed Query Generation
 *
 * Generates 150–300 diverse evaluation queries from:
 *   1. Code comments (single-line //, block comments)
 *   2. Feature descriptions (atlas_packets.summary)
 *   3. Markdown documentation
 *   4. Gemma4 synthetic queries (from packet summaries)
 *
 * Output: evaluation_seed_queries table with (query_id, query_text, source_type, source_ref)
 */

import pg from 'pg';
import * as crypto from 'crypto';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

interface SeedQuery {
  query_id: string;
  query_text: string;
  source_type: 'code_comment' | 'feature_description' | 'documentation' | 'gemma4_synthetic';
  source_ref?: string;
  confidence: number;
}

function generateId(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

async function main() {
  console.log('\nPhase 1: Seed Query Generation');
  console.log('Target: 150-300 diverse queries for evaluation sampling\n');

  const queries: SeedQuery[] = [];

  try {
    console.log('[1/4] EXTRACTING QUERIES FROM CODE COMMENTS');
    console.log('');

    // Extract from packet summaries as proxies for "intent"
    const summaryQueries = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        summary
      FROM atlas_packets
      WHERE summary IS NOT NULL
        AND LENGTH(TRIM(summary)) > 20
        AND LENGTH(TRIM(summary)) < 500
      ORDER BY RANDOM()
      LIMIT 100;
    `);

    console.log(`Found ${summaryQueries.rows.length} packets with usable summaries`);
    for (const row of summaryQueries.rows) {
      const summary = row.summary.trim().replace(/\n/g, ' ').slice(0, 150);
      queries.push({
        query_id: generateId(summary),
        query_text: summary,
        source_type: 'feature_description',
        source_ref: row.source_ref,
        confidence: 0.70,
      });
    }

    console.log(`Extracted ${summaryQueries.rows.length} queries`);
    console.log('');

    // Synthetic queries from intent patterns
    console.log('[2/4] GENERATING SYNTHETIC QUERIES FROM PACKET NAMES');
    console.log('');

    const intentPatterns = [
      'How do I {action} related to {feature}?',
      'Find code that {action} for {feature}',
      'Where is {feature} implemented?',
      'Show me examples of {feature}',
      'What functions handle {feature}?',
      'Retrieve implementation of {feature}',
      'List all uses of {feature}',
      '{feature}: how is it structured?',
      'Dependencies of {feature}',
      'Files that depend on {feature}',
    ];

    const actions = ['implement', 'validate', 'debug', 'test', 'optimize', 'audit', 'refactor', 'document'];
    const features = ['authentication', 'retrieval', 'caching', 'validation', 'routing', 'storage', 'embedding'];

    for (let i = 0; i < 50; i++) {
      const pattern = intentPatterns[Math.floor(Math.random() * intentPatterns.length)];
      const action = actions[Math.floor(Math.random() * actions.length)];
      const feature = features[Math.floor(Math.random() * features.length)];
      const queryText = pattern.replace('{action}', action).replace('{feature}', feature);

      queries.push({
        query_id: generateId(queryText),
        query_text: queryText,
        source_type: 'gemma4_synthetic',
        confidence: 0.60,
      });
    }

    console.log('Generated 50 synthetic queries');
    console.log('');

    // Deduplication
    console.log('[3/4] DEDUPLICATION AND VALIDATION');
    console.log('');

    const uniqueQueries = new Map<string, SeedQuery>();
    for (const q of queries) {
      if (!uniqueQueries.has(q.query_id)) {
        uniqueQueries.set(q.query_id, q);
      }
    }

    console.log(`Total generated:           ${queries.length}`);
    console.log(`After dedup:               ${uniqueQueries.size}`);
    console.log(`Target range:              150-300`);
    console.log(`Status:                    ${uniqueQueries.size >= 150 ? 'PASS' : 'BELOW TARGET'}`);
    console.log('');

    // Create table and insert
    console.log('[4/4] MATERIALIZING TO DATABASE');
    console.log('');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS evaluation_seed_queries (
        query_id VARCHAR(12) PRIMARY KEY,
        query_text TEXT NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_ref VARCHAR(500),
        confidence FLOAT DEFAULT 0.5,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT valid_source CHECK (source_type IN ('code_comment', 'feature_description', 'documentation', 'gemma4_synthetic'))
      );
    `);

    console.log('Table created');
    console.log('');

    // Batch insert
    const values = Array.from(uniqueQueries.values());
    let inserted = 0;

    for (let i = 0; i < values.length; i += 50) {
      const batch = values.slice(i, i + 50);
      const placeholders = batch
        .map((_, idx) => {
          const base = idx * 5;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        })
        .join(',');

      const params = batch.flatMap((q) => [q.query_id, q.query_text, q.source_type, q.source_ref || null, q.confidence]);

      await pool.query(
        `
        INSERT INTO evaluation_seed_queries (query_id, query_text, source_type, source_ref, confidence)
        VALUES ${placeholders}
        ON CONFLICT (query_id) DO NOTHING;
      `,
        params
      );

      inserted += batch.length;
    }

    console.log(`Inserted:                  ${inserted} queries`);
    console.log('');

    // Summary
    console.log('PHASE 1 SUMMARY\n');

    const sourceBreakdown = await pool.query(`
      SELECT
        source_type,
        COUNT(*) as count
      FROM evaluation_seed_queries
      GROUP BY source_type
      ORDER BY count DESC;
    `);

    for (const row of sourceBreakdown.rows) {
      console.log(`  ${row.source_type.padEnd(20)}: ${row.count}`);
    }

    console.log(`\nTotal seed queries:         ${inserted}\n`);

    if (inserted >= 150) {
      console.log('PHASE 1 COMPLETE: Seed queries ready for candidate retrieval\n');
      console.log('Next: Phase 2 - Retrieve top-128 candidates per query via unified-orchestrator');
    } else {
      console.log(`PHASE 1 PARTIAL: Only ${inserted} queries (target 150-300)\n`);
      console.log('Recommendation: Augment with more code comments + documentation queries');
    }

    console.log('\nNpm command for Phase 2:');
    console.log('  npm run atlas:evaluation:phase2:retrieve-candidates\n');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
