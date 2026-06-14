#!/usr/bin/env node
/**
 * Audit: Qdrant Payload Schema vs Postgres atlas_codebase_packets
 *
 * Purpose: Verify payload field mapping matches between Qdrant and Postgres
 * Identifies missing/extra fields that need backfill
 *
 * Usage:
 *   node scripts/atlas/audit-qdrant-postgres-payload-schema.mjs
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import https from 'https';
import http from 'http';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

// ────────────────────────────────────────────────────────────────
// Fetch from Qdrant
// ────────────────────────────────────────────────────────────────

async function fetchQdrantPayloads() {
  console.log('📦 Fetching Qdrant payload samples...\n');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 6333,
      path: '/collections/codebase_chunks_768/points?limit=100',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          // Try HTTPS first, fall back to HTTP
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse Qdrant response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      // HTTPS failed, try HTTP
      const httpOptions = { ...options, method: 'GET', port: 6333 };
      const httpReq = http.request(httpOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Qdrant HTTP response: ${e.message}`));
          }
        });
      });
      httpReq.end();
    });

    req.end();
  });
}

// ────────────────────────────────────────────────────────────────
// Fetch from Postgres
// ────────────────────────────────────────────────────────────────

async function fetchPostgresPackets() {
  console.log('📊 Fetching Postgres atlas_codebase_packets sample...\n');

  const result = await pool.query(`
    SELECT
      packet_key,
      source_ref,
      file_path,
      feature_id,
      feature_label,
      community_id,
      community_source,
      community_confidence,
      metadata,
      lineage_version,
      ledger_type,
      tree_node_id,
      som_cluster,
      created_at,
      updated_at
    FROM atlas_codebase_packets
    LIMIT 100
  `);

  return result.rows;
}

// ────────────────────────────────────────────────────────────────
// Compare Schemas
// ────────────────────────────────────────────────────────────────

function analyzeSchemas(qdrantData, postgresData) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Payload Schema Audit                                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Extract payload fields from Qdrant
  const qdrantPayloads = qdrantData.result?.points || [];
  const qdrantFields = new Set();
  const qdrantFieldTypes = {};

  for (const point of qdrantPayloads) {
    if (point.payload) {
      for (const [key, value] of Object.entries(point.payload)) {
        qdrantFields.add(key);
        qdrantFieldTypes[key] = typeof value;
      }
    }
  }

  // Extract fields from Postgres
  const postgresFields = new Set();
  const postgresFieldTypes = {};

  for (const row of postgresData) {
    for (const [key, value] of Object.entries(row)) {
      postgresFields.add(key);
      postgresFieldTypes[key] = typeof value;
    }
  }

  // Compare
  console.log('📋 Qdrant Payload Fields:');
  console.log(`   Total: ${qdrantFields.size}\n`);
  for (const field of Array.from(qdrantFields).sort()) {
    const inPostgres = postgresFields.has(field) ? '✅' : '❌';
    console.log(`   ${inPostgres} ${field} (${qdrantFieldTypes[field]})`);
  }

  console.log('\n📋 Postgres Columns:');
  console.log(`   Total: ${postgresFields.size}\n`);
  for (const field of Array.from(postgresFields).sort()) {
    const inQdrant = qdrantFields.has(field) ? '✅' : '⚠️';
    console.log(`   ${inQdrant} ${field} (${postgresFieldTypes[field]})`);
  }

  // Gaps
  const missingInQdrant = Array.from(postgresFields).filter(f => !qdrantFields.has(f));
  const extraInQdrant = Array.from(qdrantFields).filter(f => !postgresFields.has(f));

  console.log('\n⚠️  Missing in Qdrant (need backfill):');
  if (missingInQdrant.length === 0) {
    console.log('   None ✅');
  } else {
    for (const field of missingInQdrant) {
      console.log(`   - ${field}`);
    }
  }

  console.log('\n⚠️  Extra in Qdrant (not in Postgres):');
  if (extraInQdrant.length === 0) {
    console.log('   None ✅');
  } else {
    for (const field of extraInQdrant) {
      console.log(`   - ${field}`);
    }
  }

  // Sample comparison
  console.log('\n📊 Sample Point Comparison:');
  if (qdrantPayloads.length > 0 && postgresData.length > 0) {
    const qdrantSample = qdrantPayloads[0].payload;
    const postgresSample = postgresData[0];

    console.log('\n   Qdrant Point (first):');
    console.log(`   ID: ${qdrantPayloads[0].id}`);
    console.log(`   Payload keys: ${Object.keys(qdrantSample).join(', ')}`);

    console.log('\n   Postgres Row (first):');
    console.log(`   packet_key: ${postgresSample.packet_key}`);
    console.log(`   Column keys: ${Object.keys(postgresSample).slice(0, 8).join(', ')}...`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Recommendations                                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (missingInQdrant.length > 0) {
    console.log(`⚠️  Backfill needed for ${missingInQdrant.length} fields in Qdrant:`);
    console.log('   Run: npm run atlas:backfill:qdrant-payloads --apply\n');
  }

  if (extraInQdrant.length > 0) {
    console.log(`⚠️  Clean up ${extraInQdrant.length} extra fields in Qdrant (optional):\n`);
  }

  return { qdrantFields, postgresFields, missingInQdrant, extraInQdrant };
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

async function main() {
  try {
    const qdrantData = await fetchQdrantPayloads();
    const postgresData = await fetchPostgresPackets();

    const analysis = analyzeSchemas(qdrantData, postgresData);

    console.log('\n✅ Audit complete\n');

    process.exit(analysis.missingInQdrant.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
