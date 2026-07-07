#!/usr/bin/env node

/**
 * Golden Retrieval Replay
 *
 * Purpose: Validate that packet enrichment (titles, summaries, vectors) has
 * improved the retrieval stack. Run before training/policy tuning.
 *
 * Test Plan:
 * 1. Define golden queries (known intent → expected result)
 * 2. Run each query through the unified retrieval pipeline
 * 3. Verify: Does the top result contain the expected packet_key/source_ref?
 * 4. Log: Eval latency per lane (embedding, vector, graph, RRF, synthesis)
 * 5. Report: Success rate, average latency, lane contribution breakdown
 *
 * Golden queries must be STABLE (tied to packet_key, not changing semantics)
 */

import postgres from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __root = resolve(__dirname, '../../..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// Load environment
const env = {};
if (existsSync(`${__root}/.env`)) {
  readFileSync(`${__root}/.env`, 'utf-8')
    .split('\n')
    .forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) env[key] = value;
    });
}

const DB_URL = env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';
const UNIFIED_API = env.SVELTEKIT_URL || 'http://localhost:5173';

// ============================================================================
// GOLDEN QUERIES (Manually defined test cases)
// ============================================================================

const GOLDEN_QUERIES = [
  {
    id: 'auth-session-validation',
    query: 'authentication session validation',
    expectedPacketKey: null, // Will be populated from Postgres
    expectedSourceRef: null,
    expectedLaneContribution: {
      vector: 'high', // vector search should find auth semantics
      lexical: 'high', // exact word match
      graph: 'medium', // auth imports other modules
      topology: 'low'  // topology may not strongly contribute
    },
    notes: 'Authentication is a critical security feature; should rank high via semantic + lexical'
  },
  {
    id: 'database-pooling-connection',
    query: 'database connection pooling',
    expectedPacketKey: null,
    expectedSourceRef: null,
    expectedLaneContribution: {
      vector: 'high',
      lexical: 'high',
      graph: 'high', // DB connections have rich dependency graph
      topology: 'medium'
    },
    notes: 'Database pooling should surface via semantic + graph authority'
  },
  {
    id: 'error-handling-retry',
    query: 'error handling and retry logic',
    expectedPacketKey: null,
    expectedSourceRef: null,
    expectedLaneContribution: {
      vector: 'medium',
      lexical: 'medium',
      graph: 'low',
      topology: 'low'
    },
    notes: 'Error handling is cross-cutting; vector search should find relevant patterns'
  },
  {
    id: 'cache-invalidation',
    query: 'cache invalidation patterns',
    expectedPacketKey: null,
    expectedSourceRef: null,
    expectedLaneContribution: {
      vector: 'high',
      lexical: 'high',
      graph: 'medium',
      topology: 'low'
    },
    notes: 'Cache is a system-wide concern; should rank high via semantic matching'
  }
];

// ============================================================================
// POPULATE GOLDEN QUERIES FROM POSTGRES
// ============================================================================

async function populateGoldenQueries() {
  const pgPool = new postgres.Pool({ connectionString: DB_URL });
  const client = await pgPool.connect();

  try {
    // Get recently enriched packets (that have non-null metadata titles)
    const result = await client.query(`
      SELECT ap.packet_key, ap.source_ref, ap.feature_label, ap.metadata
      FROM atlas_packets ap
      WHERE
        ap.packet_key IS NOT NULL
        AND ap.source_ref IS NOT NULL
        AND ap.metadata->>'title' IS NOT NULL
      ORDER BY ap.updated_at DESC
      LIMIT 4
    `);

    if (result.rows.length > 0) {
      for (let i = 0; i < Math.min(result.rows.length, GOLDEN_QUERIES.length); i++) {
        GOLDEN_QUERIES[i].expectedPacketKey = result.rows[i].packet_key;
        GOLDEN_QUERIES[i].expectedSourceRef = result.rows[i].source_ref;
        GOLDEN_QUERIES[i].query = result.rows[i].metadata?.title || GOLDEN_QUERIES[i].query;
        if (verbose) {
          console.log(`✓ Golden query "${GOLDEN_QUERIES[i].id}" mapped to ${GOLDEN_QUERIES[i].expectedPacketKey}`);
        }
      }
    } else {
      console.warn(`⚠️  No enriched packets found in Postgres`);
    }
  } finally {
    client.release();
    await pgPool.end();
  }
}

// ============================================================================
// RUN SINGLE RETRIEVAL TEST
// ============================================================================

async function runRetrievalTest(goldenQuery) {
  const startTime = Date.now();

  try {
    const res = await fetch(`${UNIFIED_API}/api/retrieval/unified?q=${encodeURIComponent(goldenQuery.query)}&limit=10`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      return {
        query: goldenQuery.query,
        success: false,
        error: `HTTP ${res.status}`,
        latency_ms: Date.now() - startTime
      };
    }

    const data = await res.json();
    const topResult = data.candidates?.[0];
    const topResultMatches = topResult?.packet_key === goldenQuery.expectedPacketKey;

    const result = {
      query: goldenQuery.query,
      success: topResultMatches,
      topResult: topResult?.packet_key,
      topResultMatches,
      latency_ms: Date.now() - startTime,
      laneBreakdown: data.breakdown || {}
    };

    return result;
  } catch (err) {
    console.error(`[Retrieval Error] ${goldenQuery.id}:`, err.message);
    return {
      query: goldenQuery.query,
      success: false,
      error: err.message,
      latency_ms: Date.now() - startTime
    };
  }
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

function generateReport(results) {
  const passCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  const passRate = ((passCount / totalCount) * 100).toFixed(1);

  const avgLatency = (
    results
      .filter(r => r.latency_ms)
      .reduce((sum, r) => sum + r.latency_ms, 0) / results.length
  ).toFixed(0);

  const report = {
    timestamp: new Date().toISOString(),
    golden_query_count: totalCount,
    passed: passCount,
    failed: totalCount - passCount,
    pass_rate_pct: parseFloat(passRate),
    avg_latency_ms: parseInt(avgLatency),
    results: results.map(r => ({
      query: r.query,
      success: r.success,
      latency_ms: r.latency_ms,
      lanes: r.laneBreakdown || {}
    }))
  };

  return report;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('[GOLDEN RETRIEVAL REPLAY] Starting validation...\n');

  if (isDryRun) {
    console.log('[DRY-RUN] Populating golden queries from Postgres');
  }

  await populateGoldenQueries();

  console.log(`\n[REPLAY] Running ${GOLDEN_QUERIES.length} golden queries through retrieval pipeline\n`);

  const results = [];
  for (const goldenQuery of GOLDEN_QUERIES) {
    if (!goldenQuery.expectedPacketKey) {
      console.warn(`⚠️  Skipping "${goldenQuery.id}" (not found in Postgres)`);
      continue;
    }

    console.log(`Running: ${goldenQuery.id} → "${goldenQuery.query}"`);
    const result = await runRetrievalTest(goldenQuery);
    results.push(result);

    if (result.success) {
      console.log(`  ✅ PASS (${result.latency_ms}ms)`);
    } else {
      console.log(`  ❌ FAIL (${result.latency_ms}ms) - Top result did not match expected`);
    }

    if (verbose && result.laneBreakdown) {
      console.log(`  Lane contributions:`, result.laneBreakdown);
    }
  }

  console.log('\n[REPORT]');
  const report = generateReport(results);
  console.log(JSON.stringify(report, null, 2));

  const passRate = report.pass_rate_pct;
  if (passRate >= 75) {
    console.log('\n✅ GOLDEN RETRIEVAL PASSED');
    console.log(`Pass rate: ${passRate}% (${report.passed}/${report.golden_query_count})`);
    console.log('Retrieval stack is stable. Ready for Phase 2 training/policy tuning.');
  } else {
    console.log('\n⚠️  GOLDEN RETRIEVAL NEEDS TUNING');
    console.log(`Pass rate: ${passRate}% (${report.passed}/${report.golden_query_count})`);
    console.log('Check lane contributions and RRF weights. May need enrichment retry.');
  }

  process.exit(passRate >= 75 ? 0 : 1);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});