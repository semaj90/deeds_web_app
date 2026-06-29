#!/usr/bin/env node

/**
 * CREATE QDRANT COLLECTION: codebase_chunks_384
 *
 * Creates a clean 384-dim Qdrant collection for embeddinggemma vectors.
 * This is the canonical mirror for semantic search.
 *
 * Collection schema:
 * - Named vector: content (384-dim, Cosine distance)
 * - Named vector: summary (384-dim, Cosine distance)
 * - Payload indexes: packet_key, source_ref, feature_id, som_cluster, etc.
 *
 * Usage:
 *   node scripts/atlas/create-qdrant-codebase-384.mjs [--skip-if-exists]
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, '../..');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'codebase_chunks_384';
const VECTOR_SIZE = 384;
const DISTANCE_METRIC = 'Cosine';
const TMP_DIR = path.resolve(__root, '.tmp');

const args = process.argv.slice(2);
const skipIfExists = args.includes('--skip-if-exists');

const report = {
  timestamp: new Date().toISOString(),
  collection_name: COLLECTION_NAME,
  vector_size: VECTOR_SIZE,
  distance_metric: DISTANCE_METRIC,
  status: 'PENDING',
  steps: []
};

console.log('\n🔨 CREATE QDRANT COLLECTION: codebase_chunks_384\n');

// ── Step 1: Check if collection exists ──────────────────────────────────
console.log('Step 1: Checking if collection already exists...');

let collectionExists = false;

try {
  const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
  collectionExists = checkRes.ok;

  if (collectionExists) {
    console.log(`   ⚠️  Collection "${COLLECTION_NAME}" already exists`);
    report.steps.push({
      name: 'check_exists',
      status: 'SKIPPED',
      reason: 'Collection already exists'
    });

    if (skipIfExists) {
      console.log('   → Skipping creation (--skip-if-exists)\n');
      report.status = 'SKIPPED';
      fs.writeFileSync(
        path.resolve(TMP_DIR, 'qdrant-384-create-report.json'),
        JSON.stringify(report, null, 2)
      );
      process.exit(0);
    } else {
      console.log('   → Proceeding with DELETE + CREATE\n');
    }
  } else {
    console.log(`   ✓ Collection does not exist, will create\n`);
    report.steps.push({
      name: 'check_exists',
      status: 'OK',
      reason: 'Collection does not exist'
    });
  }
} catch (err) {
  console.error(`   ❌ Check failed: ${err.message}`);
  report.steps.push({
    name: 'check_exists',
    status: 'FAILED',
    error: err.message
  });
  report.status = 'FAILED';
  fs.writeFileSync(
    path.resolve(TMP_DIR, 'qdrant-384-create-report.json'),
    JSON.stringify(report, null, 2)
  );
  process.exit(1);
}

// ── Step 2: Delete existing collection (if it exists) ──────────────────
if (collectionExists) {
  console.log('Step 2: Deleting existing collection...');
  try {
    const deleteRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'DELETE'
    });
    if (deleteRes.ok) {
      console.log(`   ✓ Collection deleted\n`);
      report.steps.push({
        name: 'delete_existing',
        status: 'OK'
      });
    }
  } catch (err) {
    console.error(`   ❌ Delete failed: ${err.message}`);
    report.steps.push({
      name: 'delete_existing',
      status: 'FAILED',
      error: err.message
    });
    report.status = 'FAILED';
    fs.writeFileSync(
      path.resolve(TMP_DIR, 'qdrant-384-create-report.json'),
      JSON.stringify(report, null, 2)
    );
    process.exit(1);
  }
}

// ── Step 3: Create collection with 384-dim vectors ──────────────────────
console.log('Step 3: Creating collection with 384-dim vectors...');

const collectionConfig = {
  vectors: {
    content: {
      size: VECTOR_SIZE,
      distance: DISTANCE_METRIC,
      on_disk: false
    },
    summary: {
      size: VECTOR_SIZE,
      distance: DISTANCE_METRIC,
      on_disk: false
    }
  },
  optimizers_config: {
    default_segment_number: 4,
    snapshot_every_sec: 600
  },
  payload_storage_type: 'in_memory'
};

try {
  const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collectionConfig)
  });

  if (createRes.ok) {
    console.log(`   ✓ Collection created: ${COLLECTION_NAME}`);
    console.log(`   ✓ Vector size: ${VECTOR_SIZE}-dim`);
    console.log(`   ✓ Distance metric: ${DISTANCE_METRIC}`);
    console.log(`   ✓ Named vectors: content, summary\n`);
    report.steps.push({
      name: 'create_collection',
      status: 'OK',
      config: collectionConfig
    });
  } else {
    const errData = await createRes.text();
    throw new Error(`HTTP ${createRes.status}: ${errData}`);
  }
} catch (err) {
  console.error(`   ❌ Create failed: ${err.message}`);
  report.steps.push({
    name: 'create_collection',
    status: 'FAILED',
    error: err.message
  });
  report.status = 'FAILED';
  fs.writeFileSync(
    path.resolve(TMP_DIR, 'qdrant-384-create-report.json'),
    JSON.stringify(report, null, 2)
  );
  process.exit(1);
}

// ── Step 4: Create payload indexes ──────────────────────────────────────
console.log('Step 4: Creating payload indexes...');

const payloadIndexes = [
  { field_name: 'packet_key', field_type: 'keyword' },
  { field_name: 'source_ref', field_type: 'keyword' },
  { field_name: 'feature_id', field_type: 'keyword' },
  { field_name: 'som_cluster', field_type: 'integer' },
  { field_name: 'kmeans_cluster', field_type: 'integer' },
  { field_name: 'ontology_tags', field_type: 'keyword' },
  { field_name: 'summary_hash', field_type: 'keyword' },
  { field_name: 'updated_at', field_type: 'datetime' }
];

try {
  for (const idx of payloadIndexes) {
    const indexRes = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/index`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(idx)
      }
    );
    if (!indexRes.ok && indexRes.status !== 400) {
      throw new Error(`Failed to create index ${idx.field_name}: HTTP ${indexRes.status}`);
    }
  }
  console.log(`   ✓ Created ${payloadIndexes.length} payload indexes\n`);
  report.steps.push({
    name: 'create_indexes',
    status: 'OK',
    indexes: payloadIndexes.length
  });
} catch (err) {
  console.error(`   ⚠️  Index creation warning: ${err.message}`);
  report.steps.push({
    name: 'create_indexes',
    status: 'PARTIAL',
    error: err.message
  });
}

// ── Step 5: Verify collection ──────────────────────────────────────────
console.log('Step 5: Verifying collection...');

try {
  const verifyRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
  if (verifyRes.ok) {
    const data = await verifyRes.json();
    const vectors = data.result?.config?.params?.vectors;

    if (vectors && vectors.content && vectors.content.size === VECTOR_SIZE) {
      console.log(`   ✓ Collection verified`);
      console.log(`   ✓ Vector sizes correct: ${vectors.content.size}-dim\n`);
      report.steps.push({
        name: 'verify_collection',
        status: 'OK',
        vector_config: vectors
      });
      report.status = 'CREATED';
    } else {
      throw new Error('Vector size mismatch in verification');
    }
  } else {
    throw new Error(`HTTP ${verifyRes.status}`);
  }
} catch (err) {
  console.error(`   ❌ Verification failed: ${err.message}`);
  report.steps.push({
    name: 'verify_collection',
    status: 'FAILED',
    error: err.message
  });
  report.status = 'FAILED';
  fs.writeFileSync(
    path.resolve(TMP_DIR, 'qdrant-384-create-report.json'),
    JSON.stringify(report, null, 2)
  );
  process.exit(1);
}

// ── Write report ──────────────────────────────────────────────────────
const reportPath = path.resolve(TMP_DIR, 'qdrant-384-create-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`📊 COLLECTION CREATION REPORT\n`);
console.log(`Status: ${report.status}`);
console.log(`Collection: ${COLLECTION_NAME}`);
console.log(`Vector size: ${VECTOR_SIZE}-dim`);
console.log(`Distance: ${DISTANCE_METRIC}`);
console.log(`Named vectors: content, summary`);
console.log(`Payload indexes: ${payloadIndexes.length}`);
console.log(`\n📁 Report: ${reportPath}\n`);

if (report.status === 'CREATED') {
  console.log('✅ Collection created successfully\n');
} else {
  console.log('⚠️  Collection creation incomplete\n');
  process.exit(1);
}