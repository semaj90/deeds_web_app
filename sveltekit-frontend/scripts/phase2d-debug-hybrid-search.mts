#!/usr/bin/env node
/**
 * Debug hybridSearch error in detail
 * Adds console.error hooks to catch where the error happens
 */

import { QdrantManager } from '../src/lib/server/vector/qdrant-manager.js';

console.log('🔍 Starting hybridSearch debug...\n');

const manager = new QdrantManager();

// Monkey-patch console to capture all output
const originalError = console.error;
const errors: string[] = [];
console.error = (...args) => {
  errors.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '));
  originalError(...args);
};

try {
  console.log('Calling hybridSearch with:');
  console.log('  - collection: "codebase_chunks_768"');
  console.log('  - query: "authentication"');
  console.log('  - embedding: Array(384).fill(0.5)');
  console.log('  - limit: 10\n');

  const result = await manager.hybridSearch({
    collection: 'codebase_chunks_768',
    query: 'authentication',
    queryEmbedding: Array(768).fill(0.5),  // Match Qdrant collection's content vector (768-dim)
    limit: 10
  });

  console.log('\n✅ hybridSearch completed successfully!');
  console.log('Result structure:', {
    hasResults: !!result.results,
    resultsCount: result.results?.length,
    resultKeys: Object.keys(result),
    metadataKeys: Object.keys(result.metadata)
  });
  console.log('\nFirst result:', result.results?.[0]);
  console.log('Metadata:', result.metadata);
} catch (error) {
  console.error('\n❌ hybridSearch threw error:');
  if (error instanceof Error) {
    console.error('  Message:', error.message);
    console.error('  Stack:', error.stack);
  } else {
    console.error('  Error:', error);
  }
}

console.log('\n📋 Captured console.error calls:');
if (errors.length === 0) {
  console.log('  (none)');
} else {
  errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
}
