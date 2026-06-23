#!/usr/bin/env node
/**
 * Phase 2: Create payload indexes on Qdrant collection
 */

import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const INDEXES = [
  { field: 'packet_key', schema: 'Keyword' },
  { field: 'source_ref', schema: 'Keyword' },
  { field: 'feature_id', schema: 'Keyword' },
  { field: 'community_id', schema: 'Integer' },
  { field: 'som_cluster', schema: 'Keyword' },
  { field: 'som_bmu_row', schema: 'Integer' },
  { field: 'som_bmu_col', schema: 'Integer' },
];

async function createIndex(collection, field, schema) {
  try {
    const response = await fetch(
      `${QDRANT_URL}/collections/${collection}/index`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_name: field,
          field_schema: schema,
        }),
      }
    );

    if (response.ok) {
      return { field, status: 'created' };
    } else if (response.status === 409) {
      return { field, status: 'exists' };
    } else {
      const text = await response.text();
      return { field, status: 'error', message: text };
    }
  } catch (err) {
    return { field, status: 'error', message: err.message };
  }
}

async function verifyIndexes(collection) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${collection}`);
    const data = await response.json();
    const indexes = data.result?.payload_schema?.fields || {};

    return {
      fields: Object.keys(indexes).length,
      indexed_fields: Object.entries(indexes)
        .filter(([_, field]) => field?.type)
        .map(([name, field]) => `${name}:${field.type}`)
        .slice(0, 10),
    };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

async function main() {
  const collectionArg = process.argv.find((arg, i) => i > 0 && process.argv[i - 1] === '--collection');
  const collection = collectionArg || 'codebase_chunks_768';

  console.log(`\n📋 Phase 2: Create Qdrant Payload Indexes`);
  console.log(`   Collection: ${collection}`);
  console.log(`   Indexes: ${INDEXES.length}\n`);

  console.log('Creating indexes...');
  const results = await Promise.all(
    INDEXES.map(({ field, schema }) => createIndex(collection, field, schema))
  );

  let created = 0;
  let existing = 0;
  let errors = 0;

  for (const result of results) {
    const status = result.status === 'created' ? '✅' : result.status === 'exists' ? '⚠️' : '❌';
    console.log(`   ${status} ${result.field.padEnd(20)} ${result.status}`);

    if (result.status === 'created') created++;
    if (result.status === 'exists') existing++;
    if (result.status === 'error') errors++;
  }

  console.log(`\n📊 Results: Created ${created} | Existing ${existing} | Errors ${errors}\n`);

  console.log('Verifying collection state...');
  const verification = await verifyIndexes(collection);

  if (verification.status === 'error') {
    console.log(`   ERROR: ${verification.message}`);
  } else {
    console.log(`   Total fields: ${verification.fields}`);
    console.log(`   Sample indexed fields:`);
    for (const field of verification.indexed_fields) {
      console.log(`     - ${field}`);
    }
  }

  console.log(`\n✅ Phase 2 Complete\n`);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
