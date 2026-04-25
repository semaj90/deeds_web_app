#!/usr/bin/env node
/**
 * Qdrant Dimension Verification Script
 * Phase 90 Compliance Check
 *
 * Validates:
 * - legal_documents collection: 384 dimensions (memory-optimized)
 * - phase72_errors collection: 768 dimensions (error topology)
 * - All collections match their Drizzle schema definitions
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from parent directory
config({ path: path.resolve(__dirname, '../../.env.phase14') });
config({ path: path.resolve(__dirname, '../.env') });

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// Expected dimensions from schemas
const EXPECTED_DIMENSIONS = {
  legal_documents: 384,        // Memory-optimized (embeddinggemma:latest)
  phase72_errors: 768,         // Error topology (embeddinggemma:latest high-precision)
  legal_evidence: 384,         // Memory-optimized
  legal_reports: 384,          // Memory-optimized
  code_embeddings: 768,        // Code ingestion (higher precision)
  error_clusters: 768          // Phase 72 clustering
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkQdrantHealth() {
  try {
    const response = await fetch(`${QDRANT_URL}/healthz`);
    if (!response.ok) {
      throw new Error(`Qdrant health check failed: ${response.status}`);
    }
    log('✅ Qdrant server is healthy', 'green');
    return true;
  } catch (error) {
    log(`❌ Qdrant server unavailable: ${error.message}`, 'red');
    log(`   Start Qdrant: docker run -p 6333:6333 qdrant/qdrant:latest`, 'yellow');
    return false;
  }
}

async function listCollections() {
  try {
    const response = await fetch(`${QDRANT_URL}/collections`);
    if (!response.ok) {
      throw new Error(`Failed to list collections: ${response.status}`);
    }
    const data = await response.json();
    return data.result?.collections || [];
  } catch (error) {
    log(`❌ Failed to list collections: ${error.message}`, 'red');
    return [];
  }
}

async function getCollectionInfo(collectionName) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${collectionName}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.result;
  } catch (error) {
    return null;
  }
}

async function verifyCollectionDimension(collectionName, expectedDim) {
  const info = await getCollectionInfo(collectionName);

  if (!info) {
    log(`⚠️  Collection "${collectionName}" does not exist`, 'yellow');
    log(`   Expected: ${expectedDim}d vectors`, 'cyan');
    log(`   Action: Create with: POST ${QDRANT_URL}/collections/${collectionName}`, 'cyan');
    return { exists: false, expectedDim };
  }

  const actualDim = info.config?.params?.vectors?.size ||
                    info.config?.params?.vector_size ||
                    info.config?.vectors?.size;

  if (actualDim === expectedDim) {
    log(`✅ Collection "${collectionName}": ${actualDim}d (correct)`, 'green');
    const pointsCount = info.points_count || 0;
    log(`   Points: ${pointsCount.toLocaleString()}`, 'cyan');
    return { exists: true, correct: true, actualDim, expectedDim, pointsCount };
  } else {
    log(`❌ Collection "${collectionName}": ${actualDim}d (expected ${expectedDim}d)`, 'red');
    log(`   MISMATCH! Schema expects ${expectedDim}d but collection has ${actualDim}d`, 'red');
    log(`   Action: Recreate collection or update schema`, 'yellow');
    return { exists: true, correct: false, actualDim, expectedDim };
  }
}

async function checkPhase90ProtectedTables() {
  log('\n📊 Phase 90 Protected Tables Check', 'magenta');
  log('=' .repeat(60), 'cyan');

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    log('⚠️  DATABASE_URL not set, skipping PostgreSQL checks', 'yellow');
    return;
  }

  try {
    // Dynamic import to avoid errors if pg not installed
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DATABASE_URL });

    await client.connect();
    log('✅ PostgreSQL connection successful', 'green');

    const protectedTables = [
      'prosecutor_cases',
      'prosecutor_persons',
      'prosecutor_evidence',
      'prosecutor_reports',
      'phase72_error',
      'phase72_error_vector',
      'phase72_cluster',
      'phase72_cluster_summary'
    ];

    for (const tableName of protectedTables) {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )`,
        [tableName]
      );

      if (result.rows[0].exists) {
        const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
        const count = parseInt(countResult.rows[0].count);
        log(`✅ Table "${tableName}": ${count.toLocaleString()} rows`, 'green');
      } else {
        log(`⚠️  Table "${tableName}": does not exist (will be created)`, 'yellow');
      }
    }

    // Check pgvector extension
    const extResult = await client.query(
      `SELECT EXISTS (
        SELECT FROM pg_extension WHERE extname = 'vector'
      )`
    );

    if (extResult.rows[0].exists) {
      log('✅ pgvector extension is installed', 'green');
    } else {
      log('❌ pgvector extension not installed', 'red');
      log('   Run: CREATE EXTENSION IF NOT EXISTS vector;', 'yellow');
    }

    await client.end();
  } catch (error) {
    log(`⚠️  PostgreSQL check failed: ${error.message}`, 'yellow');
    log('   Install pg driver: npm install pg', 'cyan');
  }
}

async function main() {
  log('\n🔍 Qdrant Dimension Verification Script', 'cyan');
  log('Phase 90 Compliance Check', 'cyan');
  log('=' .repeat(60), 'cyan');
  log(`Qdrant URL: ${QDRANT_URL}\n`, 'cyan');

  // Check Qdrant health
  const healthy = await checkQdrantHealth();
  if (!healthy) {
    process.exit(1);
  }

  // List all collections
  log('\n📋 Existing Collections', 'magenta');
  log('=' .repeat(60), 'cyan');
  const collections = await listCollections();

  if (collections.length === 0) {
    log('⚠️  No collections found', 'yellow');
  } else {
    collections.forEach(col => {
      log(`  - ${col.name}`, 'cyan');
    });
  }

  // Verify dimensions
  log('\n🎯 Dimension Verification', 'magenta');
  log('=' .repeat(60), 'cyan');

  const results = {};
  for (const [collectionName, expectedDim] of Object.entries(EXPECTED_DIMENSIONS)) {
    results[collectionName] = await verifyCollectionDimension(collectionName, expectedDim);
  }

  // Check Phase 90 protected tables
  await checkPhase90ProtectedTables();

  // Summary
  log('\n📊 Summary', 'magenta');
  log('=' .repeat(60), 'cyan');

  const total = Object.keys(results).length;
  const existing = Object.values(results).filter(r => r.exists).length;
  const correct = Object.values(results).filter(r => r.correct).length;
  const missing = total - existing;
  const incorrect = existing - correct;

  log(`Total collections checked: ${total}`, 'cyan');
  log(`Existing: ${existing} | Missing: ${missing} | Incorrect: ${incorrect}`, 'cyan');

  if (incorrect > 0) {
    log('\n❌ DIMENSION MISMATCH DETECTED', 'red');
    log('Collections with incorrect dimensions need to be recreated.', 'yellow');
    log('This will delete existing vectors - backup first!', 'yellow');
    process.exit(1);
  } else if (missing > 0) {
    log('\n⚠️  Some collections missing (will be created on first use)', 'yellow');
    log('Phase 90 Safety: OK to proceed with migrations', 'green');
    process.exit(0);
  } else {
    log('\n✅ ALL COLLECTIONS VERIFIED', 'green');
    log('Dimensions match schemas - safe to proceed!', 'green');
    process.exit(0);
  }
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
