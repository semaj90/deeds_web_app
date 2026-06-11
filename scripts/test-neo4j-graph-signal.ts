#!/usr/bin/env node
/**
 * Test Neo4j Graph Signal Module
 * Verifies authentication + graph data availability
 */

import { queryNeoJsGraphSignal, checkNeo4jHealth, getNeo4jGraphStats } from '../sveltekit-frontend/src/lib/server/retrieval/neo4j-graph-signal';

async function main() {
  console.log('🔍 Testing Neo4j Graph Signal Module');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Test 1: Health check
    console.log('[1] Checking Neo4j health...');
    const health = await checkNeo4jHealth();
    console.log(`    Available: ${health.available}`);
    if (health.available) {
      console.log(`    Connected to: ${health.connectedTo}`);
      console.log(`    Edge count: ${health.edgeCount}`);
      console.log('    ✅ Neo4j connection WORKS\n');
    } else {
      console.log(`    Error: ${health.error}`);
      console.log('    ❌ Neo4j connection FAILED\n');
      process.exit(1);
    }

    // Test 2: Graph stats
    console.log('[2] Checking graph data...');
    const stats = await getNeo4jGraphStats();
    console.log(`    Concept nodes: ${stats.conceptCount ?? '?'}`);
    console.log(`    Packet nodes: ${stats.packetCount ?? '?'}`);
    console.log(`    USED_CONCEPT edges: ${stats.usedConceptEdges ?? 0}`);
    console.log(`    SIMILAR edges: ${stats.similarEdges ?? 0}`);
    console.log('    ✅ Graph data readable\n');

    // Test 3: Query with sample concepts
    console.log('[3] Testing graph signal query...');
    const sampleConcepts = ['concept-1', 'concept-2']; // These may not exist, that's OK
    const results = await queryNeoJsGraphSignal({
      conceptIds: sampleConcepts,
      topK: 10,
    });
    console.log(`    Query returned: ${results.length} results`);
    if (results.length > 0) {
      console.log(`    First result: id=${results[0].id}, score=${results[0].score.toFixed(3)}`);
    } else {
      console.log('    (No results for sample concepts - expected if edges not yet created)');
    }
    console.log('    ✅ Query function works\n');

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ All tests passed!');
    console.log('');
    console.log('Neo4j graph signal is ready for Phase 4B integration.');
    console.log('');
    console.log('Next step:');
    console.log('  1. Wire queryNeoJsGraphSignal() into rrf-integration.ts');
    console.log('  2. Create USED_CONCEPT/SIMILAR edges (Phase 4B seeding)');
    console.log('  3. Test via API: POST /api/search/rrf');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

main();
