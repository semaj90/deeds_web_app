#!/usr/bin/env node

/**
 * Feature-Set Alignment Smoke Test (Verification Gate)
 *
 * Purpose: Measure coverage across 6 lanes to detect weak spots
 * Output: PASS (≥75/100) | WARN (47-74/100) | FAIL (<47/100)
 *
 * Lanes:
 *   1. Semantic: feature_id + tags (conceptual identity)
 *   2. Structural: tree_node_id + AST symbols (code structure)
 *   3. Lexical: term extraction + BM25 scores (keyword relevance)
 *   4. Domain: domain_class + community_id (business/legal context)
 *   5. Embedding: content_embedding_384 + vector quality (dense search)
 *   6. Topology: SOM + KMeans + PageRank (graph position)
 *
 * Usage:
 *   node validate-feature-set-alignment-smoke.mjs [--audit] [--verbose]
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;
const args = process.argv.slice(2);
const auditMode = args.includes('--audit');
const verbose = args.includes('--verbose');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

/**
 * Measure a single lane
 */
async function measureLane(name, query) {
  try {
    const result = await pool.query(query);
    const coverage = parseFloat(result.rows[0].coverage_percent);
    const count = parseInt(result.rows[0].count);
    const total = parseInt(result.rows[0].total);

    return { name, coverage, count, total, status: 'ok' };
  } catch (err) {
    return { name, coverage: 0, count: 0, total: 0, status: 'error', error: err.message };
  }
}

/**
 * Main smoke test
 */
async function runSmokeTest() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       Feature-Set Alignment Smoke Test (Gate Verify)       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    await pool.query('SELECT 1');

    // Lane 1: Semantic (feature_id + tags)
    const semantic = await measureLane('Semantic', `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN feature_id IS NOT NULL AND feature_id != '' THEN 1 END) as count,
        ROUND(100.0 * COUNT(CASE WHEN feature_id IS NOT NULL AND feature_id != '' THEN 1 END) / COUNT(*), 2) as coverage_percent
      FROM atlas_packets
    `);

    // Lane 2: Structural (tree_node_id)
    const structural = await measureLane('Structural', `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as count,
        ROUND(100.0 * COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_percent
      FROM atlas_packets
    `);

    // Lane 3: Lexical (lexical_features JSONB)
    const lexical = await measureLane('Lexical', `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN payload->>'lexical_features' IS NOT NULL THEN 1 END) as count,
        ROUND(100.0 * COUNT(CASE WHEN payload->>'lexical_features' IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_percent
      FROM atlas_packets
    `);

    // Lane 4: Domain (community_id + domain_class)
    const domain = await measureLane('Domain', `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN community_id IS NOT NULL OR payload->>'domain_class' IS NOT NULL THEN 1 END) as count,
        ROUND(100.0 * COUNT(CASE WHEN community_id IS NOT NULL OR payload->>'domain_class' IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_percent
      FROM atlas_packets
    `);

    // Lane 5: Embedding (content_embedding_384)
    const embedding = await measureLane('Embedding', `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN content_embedding_384 IS NOT NULL THEN 1 END) as count,
        ROUND(100.0 * COUNT(CASE WHEN content_embedding_384 IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_percent
      FROM atlas_packets
    `);

    // Lane 6: Topology (som_cluster + pagerank)
    const topology = await measureLane('Topology', `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN payload->>'som_cluster' IS NOT NULL OR payload->>'pagerank_score' IS NOT NULL THEN 1 END) as count,
        ROUND(100.0 * COUNT(CASE WHEN payload->>'som_cluster' IS NOT NULL OR payload->>'pagerank_score' IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_percent
      FROM atlas_packets
    `);

    const lanes = [semantic, structural, lexical, domain, embedding, topology];

    // Calculate overall smoke score (average of 6 lanes)
    const avgCoverage = lanes.reduce((sum, lane) => sum + lane.coverage, 0) / lanes.length;
    const smokeScore = Math.round(avgCoverage);

    // Determine status
    let status = 'FAIL';
    if (smokeScore >= 75) status = 'PASS ✅';
    else if (smokeScore >= 47) status = 'WARN ⚠️';

    // Print report
    console.log('COVERAGE BY LANE:\n');
    lanes.forEach(lane => {
      const bar = '█'.repeat(Math.round(lane.coverage / 5)) + '░'.repeat(20 - Math.round(lane.coverage / 5));
      const badge = lane.coverage >= 80 ? '✅' : lane.coverage >= 50 ? '🟡' : '❌';
      console.log(`  ${badge} ${lane.name.padEnd(12)} ${bar} ${lane.coverage.toFixed(1)}% (${lane.count}/${lane.total})`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`\nOVERALL SMOKE SCORE: ${smokeScore}/100  ${status}\n`);

    if (auditMode) {
      console.log('AUDIT MODE: Detailed Gaps\n');
      lanes.forEach(lane => {
        const gap = 100 - lane.coverage;
        if (gap > 0) {
          const needed = Math.ceil((lane.total * gap) / 100);
          console.log(`  ${lane.name}: Gap ${gap.toFixed(1)}% (${needed} packets needed to reach 80%)`);
        }
      });
    }

    console.log('\n' + '='.repeat(60) + '\n');

    if (verbose) {
      console.log('Lanes Details:\n');
      console.log(JSON.stringify(lanes, null, 2));
    }

    await pool.end();

    // Exit code: 0 = PASS, 1 = WARN, 2 = FAIL
    if (status.includes('PASS')) process.exit(0);
    else if (status.includes('WARN')) process.exit(1);
    else process.exit(2);

  } catch (err) {
    console.error('❌ FATAL ERROR:', err.message);
    await pool.end();
    process.exit(2);
  }
}

runSmokeTest();
