#!/usr/bin/env node
/**
 * Raw Qdrant search test — bypass QdrantManager to test the SDK directly
 */

import { QdrantClient } from '@qdrant/js-client-rest';

console.log('🔍 Starting raw Qdrant search test...\n');

const client = new QdrantClient({ url: 'http://127.0.0.1:6333' });

try {
  console.log('Test 1: Raw search on "content" named vector');
  console.log('  Parameters:');
  console.log('    - collection: codebase_chunks_768');
  console.log('    - vector name: content (768-dim)');
  console.log('    - vector: Array(768).fill(0.5)');
  console.log('    - limit: 10\n');

  const result = await client.search('codebase_chunks_768', {
    vector: {
      name: 'content',
      vector: Array(768).fill(0.5),
    },
    limit: 10,
    with_payload: true,
  });

  console.log('✅ Raw search succeeded!');
  console.log(`   Results count: ${result.length}`);
  if (result.length > 0) {
    console.log(`   First result: score=${result[0].score}, point_id=${result[0].id}`);
  }
} catch (error) {
  console.error('❌ Raw search failed:');
  if (error instanceof Error) {
    console.error(`   Message: ${error.message}`);
  } else {
    console.error(`   Error: ${error}`);
  }
}

console.log('\nTest 2: Check collection schema');
try {
  const collection = await client.getCollection('codebase_chunks_768');
  console.log('✅ Collection info:');
  console.log(`   Points: ${collection.points_count}`);
  console.log(`   Vector names: ${Object.keys(collection.config.params.vectors).join(', ')}`);
  for (const [name, cfg] of Object.entries(collection.config.params.vectors)) {
    const vecCfg = cfg as any;
    console.log(`     - ${name}: ${vecCfg.size}-dim, ${vecCfg.distance}`);
  }
} catch (error) {
  console.error('❌ Collection info failed:');
  if (error instanceof Error) {
    console.error(`   Message: ${error.message}`);
  } else {
    console.error(`   Error: ${error}`);
  }
}
