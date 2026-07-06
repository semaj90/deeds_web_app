#!/usr/bin/env node
/**
 * Phase 106: Materialize Retrieval Attempts
 *
 * Record all retrieval method attempts (Dense/Topology/DAG) for a given query.
 * Three parallel retrieval lanes compete:
 *   A) Dense Qdrant (vector ANN)
 *   B) Topology/SOM/PageRank (graph-based)
 *   C) DAG/Hilbert/ngram (structural)
 *
 * Output: retrieval_attempts table with score/confidence/latency
 *
 * Usage:
 *   npm run atlas:retrieval:attempts:dry --limit=100 --query-hash=abc123
 *   npm run atlas:retrieval:attempts:apply
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '1000'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Simulate retrieval attempt across three lanes
 * In production: call actual Qdrant/Neo4j/DAG services
 */
async function runRetrievalAttempt(queryHash, method) {
  // Simulate latency
  const latencyMs = Math.random() * 500 + (method === 'dense' ? 50 : method === 'topology' ? 100 : 150);

  // Simulate varying confidence/score across methods
  let baseScore = 0.5;
  let baseConfidence = 0.5;

  if (method === 'dense') {
    baseScore = 0.65 + Math.random() * 0.25;
    baseConfidence = 0.75 + Math.random() * 0.20;
  } else if (method === 'topology') {
    baseScore = 0.55 + Math.random() * 0.30;
    baseConfidence = 0.70 + Math.random() * 0.25;
  } else if (method === 'dag') {
    baseScore = 0.60 + Math.random() * 0.35;
    baseConfidence = 0.65 + Math.random() * 0.30;
  }

  return {
    score: Math.min(baseScore, 1.0),
    confidence: Math.min(baseConfidence, 1.0),
    latency_ms: Math.round(latencyMs),
    packet_keys: Array.from(
      { length: Math.floor(Math.random() * 15) + 3 },
      () => `packet:${Math.random().toString(36).slice(2, 9)}`
    ),
    result_hash: crypto.randomBytes(16).toString('hex')
  };
}

async function main() {
  console.log(`\n[PHASE 106] Materialize Retrieval Attempts [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch active queries needing attempt materialization
    console.log('Step 1: Fetch queries for attempt materialization...');
    const queryResult = await client.query(`
      SELECT DISTINCT
        query_hash,
        COUNT(DISTINCT trace_id) as attempt_count
      FROM (
        SELECT
          MD5(source_ref || ':' || feature_id) as query_hash,
          packet_key,
          source_ref,
          feature_id,
          MD5(packet_key) as trace_id
        FROM atlas_packets
        WHERE source_ref NOT LIKE 'proto:%'
        LIMIT $1
      ) subq
      GROUP BY query_hash
      ORDER BY query_hash
    `, [limit]);

    const queries = queryResult.rows;
    console.log(`  [OK] Found ${queries.length} unique queries\n`);

    if (queries.length === 0) {
      console.log('  [WARN] No queries to process.\n');
      process.exit(0);
    }

    // 2. Run retrieval attempts across three lanes
    console.log('Step 2: Run retrieval attempts (A=Dense, B=Topology, C=DAG)...');

    const attempts = [];
    const methods = ['dense', 'topology', 'dag'];
    let attemptCount = 0;

    for (const { query_hash } of queries) {
      for (const method of methods) {
        const attemptId = `${query_hash}:${method}:${Date.now()}`;
        const result = await runRetrievalAttempt(query_hash, method);

        attempts.push({
          attempt_id: attemptId,
          trace_id: crypto.randomBytes(8).toString('hex'),
          task_id: null,
          query_hash,
          method,
          packet_keys: result.packet_keys,
          score: result.score,
          confidence: result.confidence,
          latency_ms: result.latency_ms,
          result_hash: result.result_hash,
          cache_tier: null,  // Will be set during promotion
          superseded_by: null
        });

        attemptCount++;
      }
    }

    console.log(`  [OK] Generated ${attemptCount} total attempts (${queries.length} queries × 3 methods)\n`);

    if (isDryRun) {
      console.log('Sample retrieval attempts (first 9):\n');
      attempts.slice(0, 9).forEach(a => {
        console.log(`  Attempt: ${a.attempt_id.split(':').slice(0, 2).join(':')}`);
        console.log(`    Method: ${a.method}`);
        console.log(`    Score: ${a.score.toFixed(3)}, Confidence: ${a.confidence.toFixed(3)}, Latency: ${a.latency_ms}ms`);
        console.log(`    Packets: ${a.packet_keys.length}`);
        console.log();
      });
      console.log('[OK] Dry-run complete. Use apply to persist.\n');
      process.exit(0);
    }

    // 3. Write attempts to retrieval_attempts table
    console.log('Step 3: Write retrieval attempts to database...');

    let written = 0;
    let failed = 0;

    for (const attempt of attempts) {
      try {
        await client.query(`
          INSERT INTO retrieval_attempts (
            attempt_id, trace_id, task_id, query_hash, method,
            packet_keys, score, confidence, latency_ms, result_hash,
            cache_tier, superseded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (attempt_id) DO NOTHING
        `, [
          attempt.attempt_id,
          attempt.trace_id,
          attempt.task_id,
          attempt.query_hash,
          attempt.method,
          attempt.packet_keys,
          attempt.score,
          attempt.confidence,
          attempt.latency_ms,
          attempt.result_hash,
          attempt.cache_tier,
          attempt.superseded_by
        ]);

        written++;
        if (written % 100 === 0) {
          console.log(`  Progress: ${written}/${attemptCount} written`);
        }
      } catch (err) {
        console.error(`  [WARN] Failed to write ${attempt.attempt_id}: ${err.message}`);
        failed++;
      }
    }

    console.log(`  [OK] ${written} attempts written (${failed} failed)\n`);

    // 4. Summary statistics
    console.log('Step 4: Validate attempt distribution...');

    const stats = await client.query(`
      SELECT
        method,
        COUNT(*) as count,
        AVG(score) as avg_score,
        AVG(confidence) as avg_confidence,
        AVG(latency_ms) as avg_latency_ms
      FROM retrieval_attempts
      GROUP BY method
      ORDER BY method
    `);

    console.log('Attempt Distribution by Method:');
    stats.rows.forEach(row => {
      console.log(`  ${row.method.toUpperCase()}: ${row.count} attempts`);
      console.log(`    Avg score: ${(row.avg_score || 0).toFixed(3)}, confidence: ${(row.avg_confidence || 0).toFixed(3)}, latency: ${Math.round(row.avg_latency_ms || 0)}ms`);
    });
    console.log();

    console.log('[SUCCESS] Retrieval Attempts Materialized.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
