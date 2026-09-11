#!/usr/bin/env node
/**
 * Phase 3: Validate metadata-filtered Qdrant queries
 */

import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

async function getRandomVector(collection) {
  const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1, with_vectors: true, with_payload: false }),
  });
  const data = await response.json();
  const point = data.result?.points?.[0];
  if (!point?.vector) throw new Error('No vectors in collection');
  return point.vector;
}

async function queryPoints(collection, vector, filter) {
  const start = Date.now();
  const response = await fetch(
    `${QDRANT_URL}/collections/${collection}/points/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: vector,
        limit: 100,
        ...(filter ? { filter } : {}),
        with_payload: true,
      }),
    }
  );
  if (!response.ok) throw new Error(`Qdrant query failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return { results: data.result?.points ?? [], latency: Date.now() - start };
}

async function searchWithoutFilter(collection, vector) {
  return queryPoints(collection, vector);
}

async function searchWithFilter(collection, vector, filterField, filterValue) {
  return queryPoints(collection, vector, {
    must: [{ key: filterField, match: { value: filterValue } }],
  });
}

async function main() {
  const collectionArg = process.argv.find((arg, i) => i > 0 && process.argv[i - 1] === '--collection');
  const collection = collectionArg || 'codebase_chunks_768';
  const iterations = parseInt(process.argv.find((arg, i) => i > 0 && process.argv[i - 1] === '--iterations')?.split('=')[1] || '5');

  console.log(`\n🔍 Phase 3: Validate Metadata-Filtered Queries`);
  console.log(`   Collection: ${collection}`);
  console.log(`   Iterations: ${iterations}\n`);

  try {
    const vector = await getRandomVector(collection);
    console.log('Test vector obtained from collection\n');

    const results = { queries: [], summary: {} };

    for (let i = 0; i < iterations; i++) {
      console.log(`Iteration ${i + 1}/${iterations}:`);
      const noFilter = await searchWithoutFilter(collection, vector);
      console.log(`  • Vector ANN (no filter): ${noFilter.latency}ms, ${noFilter.results.length} results`);

      const withPacketKey = await searchWithFilter(collection, vector, 'packet_key', 'ace:packet:*');
      console.log(`  • With packet_key filter: ${withPacketKey.latency}ms, ${withPacketKey.results.length} results`);

      const withFeatureId = await searchWithFilter(collection, vector, 'feature_id', 'auth.sessions');
      console.log(`  • With feature_id filter: ${withFeatureId.latency}ms, ${withFeatureId.results.length} results`);

      results.queries.push({
        iteration: i + 1,
        no_filter: { latency: noFilter.latency, count: noFilter.results.length },
        packet_key_filter: { latency: withPacketKey.latency, count: withPacketKey.results.length },
        feature_id_filter: { latency: withFeatureId.latency, count: withFeatureId.results.length },
      });
    }

    const avgNoFilter = results.queries.reduce((sum, q) => sum + q.no_filter.latency, 0) / iterations;
    const avgPacketKeyFilter = results.queries.reduce((sum, q) => sum + q.packet_key_filter.latency, 0) / iterations;
    const avgFeatureIdFilter = results.queries.reduce((sum, q) => sum + q.feature_id_filter.latency, 0) / iterations;

    const filterOverhead1 = ((avgPacketKeyFilter - avgNoFilter) / avgNoFilter * 100).toFixed(1);
    const filterOverhead2 = ((avgFeatureIdFilter - avgNoFilter) / avgNoFilter * 100).toFixed(1);

    results.summary = {
      avg_no_filter_ms: avgNoFilter.toFixed(1),
      avg_packet_key_filter_ms: avgPacketKeyFilter.toFixed(1),
      avg_feature_id_filter_ms: avgFeatureIdFilter.toFixed(1),
      filter_overhead_pct_1: filterOverhead1,
      filter_overhead_pct_2: filterOverhead2,
      indexes_operational: Math.abs(parseFloat(filterOverhead1)) < 20 && Math.abs(parseFloat(filterOverhead2)) < 20,
    };

    console.log(`\n📊 Summary (${iterations} iterations):`);
    console.log(`   Avg latency (no filter): ${results.summary.avg_no_filter_ms}ms`);
    console.log(`   Avg latency (packet_key filter): ${results.summary.avg_packet_key_filter_ms}ms (${filterOverhead1}% overhead)`);
    console.log(`   Avg latency (feature_id filter): ${results.summary.avg_feature_id_filter_ms}ms (${filterOverhead2}% overhead)`);
    console.log(`   Indexes operational: ${results.summary.indexes_operational ? '✅' : '⚠️'}\n`);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
