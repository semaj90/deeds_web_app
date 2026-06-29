#!/usr/bin/env node

/**
 * turbovec-baseline-test.mjs — Baseline measurement validation
 *
 * Runs 10 representative searches via ACE context retrieval to:
 * 1. Verify TurboVec is responding
 * 2. Check measurement infrastructure is wired
 * 3. Establish baseline latency + candidate count
 * 4. Spot-check fallback behavior if TurboVec offline
 *
 * Usage:
 *   node scripts/eval/turbovec-baseline-test.mjs [--dry-run] [--verbose] [--auth-token TOKEN]
 *
 * Note: Requires authentication. Either:
 *   - Pass --auth-token to provide a session token
 *   - Or pass --check-infrastructure to skip auth and just verify measurement endpoints
 */

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';

const API_BASE = process.env.API_URL || 'http://127.0.0.1:5173';
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');
const CHECK_INFRA_ONLY = process.argv.includes('--check-infrastructure');
const AUTH_TOKEN = extractFlag('--auth-token');

/**
 * @param {string} flag
 * @returns {string | null}
 */
function extractFlag(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

const TEST_QUERIES = [
  'validation session Lucia auth',
  'database transaction isolation level',
  'evidence chain custody',
  'legal statute precedent',
  'witness testimony reliability',
  'contract breach remedies',
  'civil procedure discovery',
  'criminal defense motion',
  'constitutional due process',
  'tort damages calculation'
];

/**
 * @typedef {Object} RetrievalResult
 * @property {string} query
 * @property {number} duration
 * @property {number} candidates
 * @property {{id: string; score: number}} [topResult]
 * @property {string} [error]
 */

/**
 * @param {string} query
 * @returns {Promise<RetrievalResult>}
 */
async function runSearch(query) {
  const start = Date.now();

  try {
    const res = await fetch(`${API_BASE}/api/rag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        topK: 20
      })
    });

    const duration = Date.now() - start;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    return {
      query,
      duration,
      candidates: data.results?.length || 0,
      topResult: data.results?.[0]
        ? { id: data.results[0].id, score: data.results[0].score }
        : undefined
    };
  } catch (error) {
    return {
      query,
      duration: Date.now() - start,
      candidates: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * @returns {Promise<boolean>}
 */
async function checkMetricsApi() {
  try {
    const res = await fetch(`${API_BASE}/api/metrics/retrieval`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.sampleCount !== undefined;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🔬 TurboVec Baseline Test\n');
  console.log(`API: ${API_BASE}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

  // Check API health
  console.log('📡 Checking API health...');
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) {
      console.error('❌ API health check failed');
      process.exit(1);
    }
    console.log('✅ API is up\n');
  } catch (error) {
    console.error('❌ Cannot reach API:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Check metrics API
  console.log('📊 Checking metrics API...');
  const metricsOk = await checkMetricsApi();
  if (metricsOk) {
    console.log('✅ Metrics API is available\n');
  } else {
    console.warn('⚠️  Metrics API not ready (may still be starting)\n');
  }

  if (DRY_RUN) {
    console.log('🏃 DRY-RUN MODE: Not making real API calls');
    process.exit(0);
  }

  // Run baseline searches
  console.log('🔍 Running 10 baseline searches...\n');

  const results = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const query = TEST_QUERIES[i];
    process.stdout.write(`[${i + 1}/10] ${query.slice(0, 40).padEnd(40)} ... `);

    const result = await runSearch(query);
    results.push(result);

    if (result.error) {
      console.log(`❌ ${result.error} (${result.duration}ms)`);
    } else {
      console.log(`✅ ${result.candidates} candidates (${result.duration}ms)`);
    }
  }

  // Compute stats
  const successful = results.filter((r) => !r.error);
  const durations = successful.map((r) => r.duration).sort((a, b) => a - b);
  const candidateCounts = successful.map((r) => r.candidates);

  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];
  const avgCandidates =
    candidateCounts.length > 0
      ? candidateCounts.reduce((a, b) => a + b, 0) / candidateCounts.length
      : 0;

  // Print summary
  console.log('\n📈 Summary:\n');
  console.log(`Success rate: ${successful.length}/10`);
  console.log(`Latency (P50): ${p50}ms`);
  console.log(`Latency (P95): ${p95}ms`);
  console.log(`Latency (P99): ${p99}ms`);
  console.log(`Avg candidates: ${avgCandidates.toFixed(1)}`);

  if (VERBOSE) {
    console.log('\n📋 Detailed Results:\n');
    results.forEach((r) => {
      console.log(`- ${r.query}`);
      if (r.error) {
        console.log(`  Error: ${r.error}`);
      } else {
        console.log(`  Duration: ${r.duration}ms`);
        console.log(`  Candidates: ${r.candidates}`);
        if (r.topResult) {
          console.log(`  Top: [${r.topResult.id}] score=${r.topResult.score.toFixed(3)}`);
        }
      }
    });
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    queries: TEST_QUERIES.length,
    successful: successful.length,
    latency: {
      p50,
      p95,
      p99,
      min: Math.min(...durations),
      max: Math.max(...durations)
    },
    candidates: {
      avg: avgCandidates,
      min: Math.min(...candidateCounts),
      max: Math.max(...candidateCounts)
    },
    results
  };

  const reportPath = '.tmp/turbovec-baseline-test.json';
  await fs.mkdir('.tmp', { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Report saved: ${reportPath}`);

  if (successful.length < 9) {
    console.log('\n⚠️  Low success rate — check API logs for errors');
    process.exit(1);
  }

  console.log('\n✅ Baseline test complete');
}

main().catch(console.error);
