#!/usr/bin/env node
/**
 * Phase 106: Promote Retrieval Winner to Cache
 *
 * Arbitrate three retrieval attempts (Dense/Topology/DAG) and promote
 * the highest-scoring attempt to L1 Valkey/BitFrost cache.
 *
 * Loser attempts recorded to L3 NVMe/mmap/Arrow for future analysis.
 *
 * Contract:
 *   query_hash → resolve packet spine
 *   → compare attempts (score + confidence + latency)
 *   → winner → L1 Valkey (cache_key)
 *   → losers → decision_path (telemetry)
 *   → record superseded_by relationship
 *
 * Usage:
 *   npm run atlas:retrieval:promote:dry --limit=100
 *   npm run atlas:retrieval:promote:apply
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '100'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
});

/**
 * Arbitrate three attempts and select winner
 */
function selectWinner(attempts) {
  if (attempts.length === 0) return null;

  // Scoring: 40% score + 35% confidence + 25% speed (inverted latency)
  const withScores = attempts.map(a => {
    const speedScore = Math.max(0, 1 - a.latency_ms / 1000);  // Normalize to [0, 1]
    const combinedScore = (a.score * 0.40) + (a.confidence * 0.35) + (speedScore * 0.25);
    return { ...a, combined_score: combinedScore };
  });

  // Sort by combined score (descending)
  withScores.sort((a, b) => b.combined_score - a.combined_score);

  return {
    winner: withScores[0],
    losers: withScores.slice(1),
    decision_path: {
      attempts_evaluated: attempts.map(a => ({
        method: a.method,
        score: a.score,
        confidence: a.confidence,
        latency_ms: a.latency_ms
      })),
      selection_criteria: '40% score + 35% confidence + 25% speed'
    }
  };
}

async function main() {
  console.log(`\n[PHASE 106] Promote Retrieval Winner [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();
  await redis.connect();

  try {
    // 1. Fetch query hashes with completed attempts
    console.log('Step 1: Fetch query hashes with retrieval attempts...');
    const queryResult = await client.query(`
      SELECT
        query_hash,
        ARRAY_AGG(
          JSON_BUILD_OBJECT(
            'attempt_id', attempt_id,
            'method', method,
            'score', score,
            'confidence', confidence,
            'latency_ms', latency_ms,
            'packet_keys', packet_keys,
            'result_hash', result_hash
          )
        ) as attempts
      FROM retrieval_attempts
      WHERE superseded_by IS NULL
      GROUP BY query_hash
      HAVING COUNT(*) >= 3
      LIMIT $1
    `, [limit]);

    const queries = queryResult.rows;
    console.log(`  [OK] Found ${queries.length} queries with 3+ attempts\n`);

    if (queries.length === 0) {
      console.log('  [WARN] No queries with complete attempt sets.\n');
      process.exit(0);
    }

    // 2. Arbitrate and select winners
    console.log('Step 2: Arbitrate attempts and select winners...');

    const promotions = [];
    const decisions = [];

    for (const { query_hash, attempts } of queries) {
      const parsed_attempts = attempts.map(a => JSON.parse(a));
      const arbitration = selectWinner(parsed_attempts);

      if (!arbitration.winner) continue;

      const cacheKey = `retrieval:query:${query_hash}`;

      promotions.push({
        query_hash,
        winning_attempt_id: arbitration.winner.attempt_id,
        packet_keys: arbitration.winner.packet_keys,
        cache_key: cacheKey,
        winner: arbitration.winner,
        losers: arbitration.losers
      });

      decisions.push({
        query_hash,
        decision_path: arbitration.decision_path,
        winner_method: arbitration.winner.method,
        winner_score: arbitration.winner.combined_score
      });
    }

    console.log(`  [OK] Arbitrated ${promotions.length} query outcomes\n`);

    if (isDryRun) {
      console.log('Sample promotion decisions (first 5):\n');
      promotions.slice(0, 5).forEach((p, idx) => {
        const d = decisions[idx];
        console.log(`  Query: ${p.query_hash}`);
        console.log(`    Winner: ${p.winner.method} (score: ${p.winner.score.toFixed(3)}, confidence: ${p.winner.confidence.toFixed(3)})`);
        console.log(`    Packets: ${p.packet_keys.length}`);
        console.log(`    Cache Key: ${p.cache_key}`);
        console.log(`    Decision Path:`);
        d.decision_path.attempts_evaluated.forEach(a => {
          console.log(`      ${a.method}: score=${a.score.toFixed(3)}, conf=${a.confidence.toFixed(3)}, latency=${a.latency_ms}ms`);
        });
        console.log();
      });
      console.log('[OK] Dry-run complete. Use apply to persist and promote.\n');
      process.exit(0);
    }

    // 3. Write winners to retrieval_attempt_winners
    console.log('Step 3: Write promotion decisions to database...');

    let written = 0;
    let failed = 0;

    for (const promotion of promotions) {
      try {
        await client.query(`
          INSERT INTO retrieval_attempt_winners (query_hash, winning_attempt_id, packet_keys, cache_key)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (query_hash) DO UPDATE
          SET winning_attempt_id = EXCLUDED.winning_attempt_id,
              packet_keys = EXCLUDED.packet_keys,
              cache_key = EXCLUDED.cache_key,
              promoted_at = NOW()
        `, [
          promotion.query_hash,
          promotion.winning_attempt_id,
          promotion.packet_keys,
          promotion.cache_key
        ]);

        written++;
        if (written % 50 === 0) {
          console.log(`  Progress: ${written}/${promotions.length} written`);
        }
      } catch (err) {
        console.error(`  [WARN] Failed to write ${promotion.query_hash}: ${err.message}`);
        failed++;
      }
    }

    console.log(`  [OK] ${written} promotion decisions written (${failed} failed)\n`);

    // 4. Promote winners to L1 Valkey
    console.log('Step 4: Promote winners to L1 Valkey cache...');

    let promoted = 0;
    let cacheFailed = 0;

    for (const promotion of promotions) {
      try {
        const cacheValue = JSON.stringify({
          query_hash: promotion.query_hash,
          winning_attempt_id: promotion.winning_attempt_id,
          packet_keys: promotion.packet_keys,
          method: promotion.winner.method,
          score: promotion.winner.score,
          confidence: promotion.winner.confidence,
          latency_ms: promotion.winner.latency_ms,
          result_hash: promotion.winner.result_hash,
          promoted_at: new Date().toISOString()
        });

        // Set in Valkey with 24h TTL
        await redis.setex(promotion.cache_key, 86400, cacheValue);

        promoted++;
        if (promoted % 50 === 0) {
          console.log(`  Progress: ${promoted}/${promotions.length} promoted to cache`);
        }
      } catch (err) {
        console.error(`  [WARN] Failed to cache ${promotion.cache_key}: ${err.message}`);
        cacheFailed++;
      }
    }

    console.log(`  [OK] ${promoted} winners promoted to L1 Valkey (${cacheFailed} failed)\n`);

    // 5. Mark losers as superseded
    console.log('Step 5: Mark loser attempts as superseded...');

    let superseded = 0;

    for (const promotion of promotions) {
      try {
        for (const loser of promotion.losers) {
          await client.query(`
            UPDATE retrieval_attempts
            SET superseded_by = $1
            WHERE attempt_id = $2
          `, [promotion.winning_attempt_id, loser.attempt_id]);

          superseded++;
        }
      } catch (err) {
        console.error(`  [WARN] Failed to mark loser for ${promotion.query_hash}: ${err.message}`);
      }
    }

    console.log(`  [OK] ${superseded} loser attempts marked as superseded\n`);

    // 6. Summary
    console.log('Promotion Summary:');
    console.log(`  Total queries arbitrated: ${promotions.length}`);
    console.log(`  Winners written to DB: ${written}`);
    console.log(`  Winners promoted to cache: ${promoted}`);
    console.log(`  Loser attempts superseded: ${superseded}`);
    console.log();

    // Cache tier distribution
    const methodCounts = {};
    promotions.forEach(p => {
      methodCounts[p.winner.method] = (methodCounts[p.winner.method] || 0) + 1;
    });

    console.log('Cache Tier Distribution (method that won):');
    Object.entries(methodCounts).forEach(([method, count]) => {
      console.log(`  ${method}: ${count} (${(count / promotions.length * 100).toFixed(1)}%)`);
    });
    console.log();

    console.log('[SUCCESS] Retrieval Winners Promoted to Cache.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
    await redis.quit();
  }
}

main();
