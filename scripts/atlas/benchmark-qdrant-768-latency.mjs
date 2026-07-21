#!/usr/bin/env node
/**
 * benchmark-qdrant-768-latency.mjs
 *
 * Measure Qdrant codebase_chunks_768 search latency on CPU.
 * Decision gate: if p99 > 150ms, recommend Phase 9 multi-vector migration.
 *
 * Run: node scripts/atlas/benchmark-qdrant-768-latency.mjs [options]
 * Options:
 *   --queries=N       (default: 100) number of queries to run
 *   --timeout=Ns      (default: 30s) timeout per query
 *   --percentile=pXX  (default: p99) report percentile
 *   --verbose         print detailed results
 */

import fetch from 'node-fetch';
import pg from 'pg';

const { Pool } = pg;

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const QUERY_COUNT = parseInt(process.argv.find(a => a.startsWith('--queries='))?.split('=')[1] || '100');
const TIMEOUT_MS = parseInt(process.argv.find(a => a.startsWith('--timeout='))?.split('=')[1]?.replace('s', '') * 1000 || '30000');
const PERCENTILE = process.argv.find(a => a.startsWith('--percentile='))?.split('=')[1] || 'p99';
const VERBOSE = process.argv.includes('--verbose');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db'
});

async function benchmark() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`QDRANT CODEBASE_CHUNKS_768 LATENCY BENCHMARK`);
  console.log(`Collection: ${COLLECTION}`);
  console.log(`Queries: ${QUERY_COUNT}`);
  console.log(`Timeout per query: ${TIMEOUT_MS}ms`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // Step 1: Verify collection exists and get metadata
    console.log('[1/4] Verifying Qdrant collection...');
    const collRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { timeout: 5000 }).then(r => r.json());

    if (!collRes.result) {
      console.error(`❌ Collection ${COLLECTION} not found`);
      return { pass: false, error: 'Collection not found' };
    }

    const vectorSize = collRes.result.config?.params?.vectors?.size;
    const pointCount = collRes.result.points_count;
    console.log(`  ✅ Collection found: ${pointCount} points, ${vectorSize}-dim vectors`);

    if (vectorSize !== 768) {
      console.warn(`  ⚠️  Expected 768-dim, got ${vectorSize}-dim. Phase 9 migration may have already occurred.`);
    }

    // Step 2: Fetch sample embeddings from Postgres to use as queries
    console.log('\n[2/4] Fetching sample embeddings...');
    const sampleRes = await pool.query(`
      SELECT content_embedding FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      ORDER BY RANDOM()
      LIMIT $1;
    `, [QUERY_COUNT]);

    const samples = sampleRes.rows.map(r => r.content_embedding);
    console.log(`  ✅ Fetched ${samples.length} sample embeddings`);

    if (samples.length === 0) {
      console.error('❌ No embeddings found in Postgres');
      return { pass: false, error: 'No embeddings' };
    }

    // Step 3: Run queries and measure latency
    console.log(`\n[3/4] Running ${QUERY_COUNT} queries (timeout: ${TIMEOUT_MS}ms each)...`);
    const latencies = [];
    let successCount = 0;
    let timeoutCount = 0;
    let errorCount = 0;

    for (let i = 0; i < samples.length; i++) {
      const vector = samples[i];
      const startTime = Date.now();

      try {
        const searchRes = await Promise.race([
          fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vector: vector,
              limit: 10,
              with_payload: false
            })
          }).then(r => r.json()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
        ]);

        const elapsed = Date.now() - startTime;

        if (searchRes.result) {
          latencies.push(elapsed);
          successCount++;
          if (VERBOSE && i % 10 === 0) {
            console.log(`  Query ${i + 1}: ${elapsed}ms`);
          }
        } else {
          errorCount++;
          if (VERBOSE) console.log(`  Query ${i + 1}: ERROR — ${searchRes.error?.message || 'unknown'}`);
        }
      } catch (err) {
        if (err.message === 'timeout') {
          timeoutCount++;
          latencies.push(TIMEOUT_MS);
          if (VERBOSE) console.log(`  Query ${i + 1}: TIMEOUT`);
        } else {
          errorCount++;
          if (VERBOSE) console.log(`  Query ${i + 1}: ERROR — ${err.message}`);
        }
      }
    }

    console.log(`  Completed: ${successCount} success, ${timeoutCount} timeout, ${errorCount} error`);

    // Step 4: Analyze latencies
    console.log('\n[4/4] Analyzing latencies...');
    const sorted = latencies.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const p999 = sorted[Math.floor(sorted.length * 0.999)];

    console.log(`\n  Latency Statistics:`);
    console.log(`    Min:    ${min}ms`);
    console.log(`    Mean:   ${mean}ms`);
    console.log(`    Median: ${median}ms`);
    console.log(`    P95:    ${p95}ms`);
    console.log(`    P99:    ${p99}ms`);
    console.log(`    P99.9:  ${p999}ms`);
    console.log(`    Max:    ${max}ms`);

    // Decision gate
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`PERFORMANCE GATE`);
    console.log(`${'─'.repeat(70)}`);

    if (p99 < 100) {
      console.log(`✅ EXCELLENT (p99 < 100ms) — Current 768-dim setup is fast enough`);
      console.log(`   Action: No migration needed. Optimize HNSW parameters if desired.`);
      return { pass: true, decision: 'keep_768', p99, p95, latencies };
    } else if (p99 < 150) {
      console.log(`✅ ACCEPTABLE (100ms ≤ p99 < 150ms) — Performance is borderline acceptable`);
      console.log(`   Action: Monitor closely. Consider Phase 9 migration if latency degrades.`);
      return { pass: true, decision: 'monitor_768', p99, p95, latencies };
    } else if (p99 < 500) {
      console.log(`⚠️  SLOW (150ms ≤ p99 < 500ms) — Performance is degraded`);
      console.log(`   Action: Plan Phase 9 multi-vector migration (384/128/64 named vectors)`);
      console.log(`   Benefit: Reduce search space via RRF fusion across smaller vector spaces`);
      return { pass: false, decision: 'migrate_to_multipart', p99, p95, latencies };
    } else {
      console.log(`❌ UNACCEPTABLE (p99 ≥ 500ms) — Performance is unacceptable`);
      console.log(`   Action: Immediate Phase 9 migration required`);
      console.log(`   Risk: Current setup will timeout on production queries`);
      return { pass: false, decision: 'urgent_migrate', p99, p95, latencies };
    }

  } catch (err) {
    console.error('❌ BENCHMARK ERROR:', err.message);
    return { pass: false, error: err.message };
  } finally {
    await pool.end();
  }
}

await benchmark();
