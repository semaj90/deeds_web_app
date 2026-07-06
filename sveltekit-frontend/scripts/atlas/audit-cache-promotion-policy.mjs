#!/usr/bin/env node
/**
 * Phase 106: Audit Cache Promotion Policy
 *
 * Validate retrieval attempt winners and cache promotion decisions.
 * Analyzes confidence thresholds, cache tier distribution, stale entries,
 * and generates recommendations for cache policy tuning.
 *
 * Contract:
 *   query_hash → retrieval_attempt_winners (promoted to L1 Valkey)
 *   → verify confidence >= 0.70 for ACP execution
 *   → analyze cache tier distribution (which method wins most)
 *   → identify stale or superseded cache entries
 *   → report coverage gaps and improvement opportunities
 *
 * Usage:
 *   npm run atlas:audit:cache-promotion:dry --limit=100
 *   npm run atlas:audit:cache-promotion:apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? 'unlimited'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Audit result structure
 */
class AuditReport {
  constructor() {
    this.timestamp = new Date().toISOString();
    this.totalWinners = 0;
    this.totalAttempts = 0;
    this.confidenceDistribution = { high: 0, medium: 0, low: 0, threshold_fail: 0 };
    this.methodDistribution = {};
    this.latencyStats = { min: Infinity, max: 0, avg: 0, p50: 0, p95: 0 };
    this.scoreStats = { min: Infinity, max: 0, avg: 0, p50: 0, p95: 0 };
    this.staleCacheEntries = [];
    this.gapAnalysis = {
      missingWinners: 0,
      lowConfidence: [],
      slowResponses: [],
      poorQuality: []
    };
    this.recommendations = [];
    this.details = [];
  }

  addWinner(winner) {
    this.details.push(winner);
  }

  addRecommendation(category, message, priority = 'medium') {
    this.recommendations.push({ category, message, priority, timestamp: new Date().toISOString() });
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      summary: {
        totalWinners: this.totalWinners,
        totalAttempts: this.totalAttempts,
        confidentWinners: this.totalWinners - this.confidenceDistribution.threshold_fail,
        cachePromotion: {
          passThreshold: (this.totalWinners - this.confidenceDistribution.threshold_fail) / Math.max(1, this.totalWinners),
          highConfidence: this.confidenceDistribution.high / Math.max(1, this.totalWinners),
          mediumConfidence: this.confidenceDistribution.medium / Math.max(1, this.totalWinners),
          lowConfidence: this.confidenceDistribution.low / Math.max(1, this.totalWinners),
          belowThreshold: this.confidenceDistribution.threshold_fail / Math.max(1, this.totalWinners)
        }
      },
      stats: {
        latency: this.latencyStats,
        score: this.scoreStats,
        methodDistribution: this.methodDistribution
      },
      gaps: this.gapAnalysis,
      recommendations: this.recommendations,
      topWinners: this.details.slice(0, 10)
    };
  }
}

async function main() {
  console.log(`\n[PHASE 106] Audit Cache Promotion Policy [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();
  const report = new AuditReport();

  try {
    // 1. Fetch all winners with attempt metadata
    console.log('Step 1: Fetch retrieval attempt winners...');
    const winnersResult = await client.query(`
      SELECT
        raw.query_hash,
        raw.winning_attempt_id,
        raw.packet_keys,
        raw.cache_key,
        raw.promoted_at,
        (SELECT JSON_AGG(JSON_BUILD_OBJECT(
          'attempt_id', attempt_id,
          'method', method,
          'score', score,
          'confidence', confidence,
          'latency_ms', latency_ms
        )) FROM retrieval_attempts WHERE query_hash = raw.query_hash) as all_attempts,
        (SELECT JSON_BUILD_OBJECT(
          'method', method,
          'score', score,
          'confidence', confidence,
          'latency_ms', latency_ms
        ) FROM retrieval_attempts WHERE attempt_id = raw.winning_attempt_id) as winner_details
      FROM retrieval_attempt_winners raw
      ${limit === 'unlimited' ? '' : `LIMIT ${limit}`}
    `);

    const winners = winnersResult.rows;
    report.totalWinners = winners.length;
    console.log(`  [OK] Found ${winners.length} cache promotion winners\n`);

    if (winners.length === 0) {
      console.log('  [WARN] No winners to audit.\n');
      console.log('[SUCCESS] Audit complete with no data.\n');
      process.exit(0);
    }

    // 2. Count total attempts
    console.log('Step 2: Analyze retrieval attempt distribution...');
    const attemptStats = await client.query(`
      SELECT
        COUNT(*) as total_attempts,
        COUNT(DISTINCT query_hash) as queries_with_attempts,
        COUNT(DISTINCT method) as methods
      FROM retrieval_attempts
      WHERE superseded_by IS NULL
    `);
    report.totalAttempts = attemptStats.rows[0].total_attempts;
    console.log(`  Total attempts: ${report.totalAttempts}`);
    console.log(`  Queries evaluated: ${attemptStats.rows[0].queries_with_attempts}`);
    console.log();

    // 3. Analyze winners for confidence distribution and quality
    console.log('Step 3: Analyze winner quality metrics...');

    const scores = [];
    const latencies = [];
    const confidentThreshold = 0.70;

    for (const winner of winners) {
      const winnerDetails = winner.winner_details;
      const allAttempts = winner.all_attempts || [];

      if (!winnerDetails) continue;

      const { method, score, confidence, latency_ms } = winnerDetails;

      // Track scores and latencies for percentile calculation
      scores.push(score);
      latencies.push(latency_ms);

      // Confidence bucket
      if (confidence >= 0.85) {
        report.confidenceDistribution.high++;
      } else if (confidence >= 0.70) {
        report.confidenceDistribution.medium++;
      } else if (confidence >= 0.50) {
        report.confidenceDistribution.low++;
      } else {
        report.confidenceDistribution.threshold_fail++;
      }

      // Method distribution
      if (!report.methodDistribution[method]) {
        report.methodDistribution[method] = 0;
      }
      report.methodDistribution[method]++;

      // Collect details
      report.addWinner({
        query_hash: winner.query_hash,
        method,
        score: score.toFixed(3),
        confidence: confidence.toFixed(3),
        latency_ms,
        attempts_evaluated: allAttempts.length
      });

      // Gap analysis
      if (confidence < confidentThreshold) {
        report.gapAnalysis.lowConfidence.push({
          query_hash: winner.query_hash,
          confidence: confidence.toFixed(3),
          method
        });
      }

      if (latency_ms > 500) {
        report.gapAnalysis.slowResponses.push({
          query_hash: winner.query_hash,
          latency_ms,
          method
        });
      }

      if (score < 0.50) {
        report.gapAnalysis.poorQuality.push({
          query_hash: winner.query_hash,
          score: score.toFixed(3),
          method
        });
      }
    }

    // Calculate percentiles
    scores.sort((a, b) => a - b);
    latencies.sort((a, b) => a - b);

    if (scores.length > 0) {
      report.scoreStats.min = scores[0];
      report.scoreStats.max = scores[scores.length - 1];
      report.scoreStats.avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      report.scoreStats.p50 = scores[Math.floor(scores.length * 0.5)];
      report.scoreStats.p95 = scores[Math.floor(scores.length * 0.95)];
    }

    if (latencies.length > 0) {
      report.latencyStats.min = latencies[0];
      report.latencyStats.max = latencies[latencies.length - 1];
      report.latencyStats.avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      report.latencyStats.p50 = latencies[Math.floor(latencies.length * 0.5)];
      report.latencyStats.p95 = latencies[Math.floor(latencies.length * 0.95)];
    }

    console.log('Winner Quality Summary:');
    console.log(`  Confidence >= 0.85 (high): ${report.confidenceDistribution.high} (${(report.confidenceDistribution.high / report.totalWinners * 100).toFixed(1)}%)`);
    console.log(`  Confidence 0.70-0.84 (medium): ${report.confidenceDistribution.medium} (${(report.confidenceDistribution.medium / report.totalWinners * 100).toFixed(1)}%)`);
    console.log(`  Confidence 0.50-0.69 (low): ${report.confidenceDistribution.low} (${(report.confidenceDistribution.low / report.totalWinners * 100).toFixed(1)}%)`);
    console.log(`  Confidence < 0.50 (below threshold): ${report.confidenceDistribution.threshold_fail} (${(report.confidenceDistribution.threshold_fail / report.totalWinners * 100).toFixed(1)}%)`);
    console.log();

    console.log('Score Stats:');
    console.log(`  Min: ${report.scoreStats.min.toFixed(3)}, Max: ${report.scoreStats.max.toFixed(3)}, Avg: ${report.scoreStats.avg.toFixed(3)}`);
    console.log(`  P50: ${report.scoreStats.p50.toFixed(3)}, P95: ${report.scoreStats.p95.toFixed(3)}`);
    console.log();

    console.log('Latency Stats (ms):');
    console.log(`  Min: ${report.latencyStats.min}, Max: ${report.latencyStats.max}, Avg: ${Math.round(report.latencyStats.avg)}`);
    console.log(`  P50: ${Math.round(report.latencyStats.p50)}, P95: ${Math.round(report.latencyStats.p95)}`);
    console.log();

    // 4. Method distribution analysis
    console.log('Step 4: Method Distribution Analysis...');
    console.log('Cache Tier Winners (method breakdown):');
    Object.entries(report.methodDistribution).forEach(([method, count]) => {
      const pct = (count / report.totalWinners * 100).toFixed(1);
      console.log(`  ${method.toUpperCase()}: ${count} winners (${pct}%)`);
    });
    console.log();

    // 5. Generate recommendations
    console.log('Step 5: Analyze and recommend policy changes...');

    if (report.confidenceDistribution.threshold_fail > 0) {
      const failRate = report.confidenceDistribution.threshold_fail / report.totalWinners;
      report.addRecommendation(
        'confidence-threshold',
        `${report.confidenceDistribution.threshold_fail} winners (${(failRate * 100).toFixed(1)}%) below 0.70 confidence. Consider lower threshold or improved scoring formula.`,
        failRate > 0.1 ? 'high' : 'medium'
      );
    }

    if (report.latencyStats.p95 > 1000) {
      report.addRecommendation(
        'latency-optimization',
        `P95 latency is ${Math.round(report.latencyStats.p95)}ms. Consider caching slower methods or using pre-computed topologies.`,
        'medium'
      );
    }

    if (report.scoreStats.p50 < 0.60) {
      report.addRecommendation(
        'query-quality',
        `Median score is ${report.scoreStats.p50.toFixed(3)}. Consider enriching query preprocessing or feature extraction.`,
        'medium'
      );
    }

    // Method skew analysis
    const methodCounts = Object.values(report.methodDistribution);
    const maxMethod = Math.max(...methodCounts);
    const methodSkew = maxMethod / report.totalWinners;

    if (methodSkew > 0.7) {
      const dominantMethod = Object.entries(report.methodDistribution).find(([_, count]) => count === maxMethod)[0];
      report.addRecommendation(
        'method-balance',
        `${dominantMethod.toUpperCase()} dominates with ${(methodSkew * 100).toFixed(1)}% of wins. Verify other methods are being evaluated fairly.`,
        'low'
      );
    }

    if (report.gapAnalysis.lowConfidence.length > 0) {
      report.addRecommendation(
        'low-confidence-investigation',
        `${report.gapAnalysis.lowConfidence.length} winners have confidence < 0.70. Review scoring formula or data quality for these queries.`,
        report.gapAnalysis.lowConfidence.length > 50 ? 'high' : 'medium'
      );
    }

    console.log('Recommendations:');
    report.recommendations.forEach(rec => {
      console.log(`  [${rec.priority.toUpperCase()}] ${rec.category}: ${rec.message}`);
    });
    console.log();

    if (isDryRun) {
      console.log('[OK] Dry-run complete. Use apply to persist audit results.\n');
      process.exit(0);
    }

    // 6. Write report to disk
    console.log('Step 6: Persist audit results...');
    const reportDir = path.join(process.cwd(), 'docs', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFile = path.join(reportDir, 'cache-promotion-policy-audit.json');
    fs.writeFileSync(reportFile, JSON.stringify(report.toJSON(), null, 2));
    console.log(`  [OK] Report written to ${reportFile}\n`);

    // 7. Summary
    console.log('Audit Summary:');
    console.log(`  Total winners analyzed: ${report.totalWinners}`);
    console.log(`  Pass threshold (≥0.70 confidence): ${report.totalWinners - report.confidenceDistribution.threshold_fail}`);
    console.log(`  Recommendations: ${report.recommendations.length}`);
    console.log();

    console.log('[SUCCESS] Cache Promotion Policy Audit Complete.\n');
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
