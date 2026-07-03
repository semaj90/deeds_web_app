#!/usr/bin/env node

/**
 * Phase 8: Deduplication Gate
 *
 * Ensures all Phase 8 operations (autoencoder → SOM → PageRank → centroids → KMeans)
 * use the same canonical packet_key to prevent duplicates across stores.
 *
 * Canonical identity contract:
 *   packet_key = sha256(source_ref | line_start | line_end | content_hash)
 *   Stable across: Postgres, Qdrant, Redis, Neo4j, autoencoder output
 *
 * Usage:
 *   node scripts/atlas/phase8-deduplication-gate.mjs --audit
 *   node scripts/atlas/phase8-deduplication-gate.mjs --repair --apply
 *   node scripts/atlas/phase8-deduplication-gate.mjs --verify-som
 */

import pg from 'pg';
import fetch from 'node-fetch';
import { buildCanonicalPacketKey } from './lib/packet-identity.mjs';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const pool = new Pool({ connectionString: DATABASE_URL });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUDIT: Verify canonical packet_key consistency across stores
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function auditPacketKeyConsistency() {
  console.log('\n🔍 Phase 8 Deduplication Audit\n');

  try {
    // 1. Postgres atlas_packets — canonical truth
    const pgResult = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(DISTINCT packet_key) as unique_keys,
             COUNT(CASE WHEN packet_key IS NULL THEN 1 END) as null_keys
      FROM atlas_packets
    `);
    const { total, unique_keys, null_keys } = pgResult.rows[0];
    console.log(`  📦 Postgres atlas_packets:`);
    console.log(`     Total rows: ${total}`);
    console.log(`     Unique packet_key: ${unique_keys}`);
    console.log(`     NULL packet_key: ${null_keys}\n`);

    // 2. Postgres codebase_chunk_index — chunks with embeddings
    const chunkResult = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(DISTINCT content_hash) as unique_hashes,
             COUNT(som_bmu_row) as with_som_bmu
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL OR summary_embedding IS NOT NULL
    `);
    const chunk = chunkResult.rows[0];
    console.log(`  📄 Postgres codebase_chunk_index (embedded):`);
    console.log(`     Total chunks: ${chunk.total}`);
    console.log(`     Unique content_hash: ${chunk.unique_hashes}`);
    console.log(`     With SOM BMU coords: ${chunk.with_som_bmu}\n`);

    // 3. Qdrant payload — check packet_key field presence
    const qdrantRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 1,
        with_payload: ['packet_key', 'source_ref', 'chunk_id'],
        with_vector: false,
      }),
    });
    const qdData = await qdrantRes.json();
    const samplePayload = qdData.result?.points?.[0]?.payload || {};
    console.log(`  🔷 Qdrant ${QDRANT_COLLECTION} (sample payload):`);
    console.log(`     Fields: ${Object.keys(samplePayload).join(', ')}`);
    console.log(`     Has packet_key: ${Boolean(samplePayload.packet_key) ? '✅' : '❌'}\n`);

    // 4. Check for duplicates in atlas_packets
    const dupResult = await pool.query(`
      SELECT packet_key, COUNT(*) as cnt
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      GROUP BY packet_key
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    console.log(`  ⚠️  Duplicate packet_key in Postgres: ${dupResult.rows.length} groups`);
    if (dupResult.rows.length > 0) {
      dupResult.rows.forEach(row => {
        console.log(`     ${row.packet_key}: ${row.cnt} copies`);
      });
    }
    console.log();

    // 5. Verify Phase 8 prerequisites
    console.log(`  📋 Phase 8 Prerequisites:\n`);

    // Check atlas_packets columns that will be populated by Phase 8
    const columnsResult = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'atlas_packets'
      AND column_name IN ('latent_64', 'som_row', 'som_col', 'page_rank_score', 'kmeans_cluster_id')
      ORDER BY column_name
    `);
    const existingColumns = columnsResult.rows.map(r => r.column_name);

    if (existingColumns.includes('latent_64')) {
      const latentResult = await pool.query(`SELECT COUNT(*) as cnt FROM atlas_packets WHERE latent_64 IS NOT NULL`);
      console.log(`     ✅ Latent-64 vectors: ${latentResult.rows[0].cnt} / ${total} (autoencoder)`);
    } else {
      console.log(`     ⚠️  Latent-64 column not yet created (autoencoder)`);
    }

    if (existingColumns.includes('som_row')) {
      const somResult = await pool.query(`SELECT COUNT(DISTINCT (som_row, som_col)) as cells FROM atlas_packets WHERE som_row IS NOT NULL`);
      console.log(`     ✅ SOM cells populated: ${somResult.rows[0].cells ?? 0} (SOM training)`);
    } else {
      console.log(`     ⚠️  SOM coords columns not yet created (SOM training)`);
    }

    if (existingColumns.includes('page_rank_score')) {
      const prResult = await pool.query(`SELECT COUNT(*) as cnt FROM atlas_packets WHERE page_rank_score IS NOT NULL`);
      console.log(`     ✅ PageRank scores: ${prResult.rows[0].cnt} (Neo4j GDS)`);
    } else {
      console.log(`     ⚠️  PageRank score column not yet created (Neo4j GDS)`);
    }

    if (existingColumns.includes('kmeans_cluster_id')) {
      const kmeansResult = await pool.query(`SELECT COUNT(DISTINCT kmeans_cluster_id) as clusters FROM atlas_packets WHERE kmeans_cluster_id IS NOT NULL`);
      console.log(`     ✅ KMeans clusters: ${kmeansResult.rows[0].clusters ?? 0} (KMeans)`);
    } else {
      console.log(`     ⚠️  KMeans cluster_id column not yet created (KMeans)`);
    }
    console.log();

  } catch (err) {
    console.error(`❌ Audit error:`, err.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REPAIR: Rebuild canonical packet_key from stable fields
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function repairPacketKeys(apply = false) {
  console.log(`\n🔧 Phase 8 Packet Key Repair${apply ? ' (APPLY)' : ' (DRY-RUN)'}\n`);

  try {
    const mode = apply ? 'APPLY' : 'DRY-RUN';

    // Find rows with missing or invalid packet_key
    const result = await pool.query(`
      SELECT id, source_ref, line_start, line_end, content_hash
      FROM atlas_packets
      WHERE packet_key IS NULL OR packet_key = '' OR packet_key NOT LIKE 'sha256:%'
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log(`  ✅ All packet_key values are canonical\n`);
      return;
    }

    console.log(`  Found ${result.rows.length} rows with missing/invalid packet_key\n`);
    let repaired = 0;

    for (const row of result.rows) {
      const canonical = buildCanonicalPacketKey({
        source_ref: row.source_ref,
        line_start: row.line_start,
        line_end: row.line_end,
        content_hash: row.content_hash,
      });

      if (!canonical) {
        console.log(`  ⚠️  Skipping ${row.id} (insufficient identity fields)`);
        continue;
      }

      if (apply) {
        await pool.query(
          `UPDATE atlas_packets SET packet_key = $1, updated_at = NOW() WHERE id = $2`,
          [canonical, row.id]
        );
        console.log(`  ✅ ${row.id} → ${canonical.slice(0, 16)}...`);
        repaired++;
      } else {
        console.log(`  📝 ${row.id} → ${canonical.slice(0, 16)}...`);
        repaired++;
      }
    }

    console.log(`\n  ${mode}: ${repaired} rows\n`);

  } catch (err) {
    console.error(`❌ Repair error:`, err.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VERIFY-SOM: Check SOM coordinates use canonical packet_key
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function verifySomCoordinates() {
  console.log(`\n🗺️  SOM Coordinate Verification\n`);

  try {
    // Verify SOM cells are properly indexed by canonical packet_key
    const result = await pool.query(`
      SELECT
        som_row, som_col,
        COUNT(*) as packet_count,
        COUNT(DISTINCT packet_key) as unique_keys,
        STRING_AGG(DISTINCT SUBSTRING(packet_key, 1, 16), ', ' ORDER BY SUBSTRING(packet_key, 1, 16)) as sample_keys
      FROM atlas_packets
      WHERE som_row IS NOT NULL AND som_col IS NOT NULL
      GROUP BY som_row, som_col
      LIMIT 5
    `);

    console.log(`  Grid cells with SOM coordinates: ${result.rows.length}\n`);
    result.rows.forEach(row => {
      console.log(`  Cell (${row.som_row}, ${row.som_col}): ${row.packet_count} packets (${row.unique_keys} unique keys)`);
      console.log(`    Sample: ${row.sample_keys}\n`);
    });

  } catch (err) {
    console.error(`❌ Verification error:`, err.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const mode = process.argv[2];

if (!mode) {
  console.error(`\n❌ Usage:`);
  console.error(`  node phase8-deduplication-gate.mjs --audit`);
  console.error(`  node phase8-deduplication-gate.mjs --repair [--apply]`);
  console.error(`  node phase8-deduplication-gate.mjs --verify-som\n`);
  process.exit(1);
}

try {
  if (mode === '--audit') {
    await auditPacketKeyConsistency();
  } else if (mode === '--repair') {
    const apply = process.argv.includes('--apply');
    await repairPacketKeys(apply);
  } else if (mode === '--verify-som') {
    await verifySomCoordinates();
  } else {
    console.error(`\n❌ Unknown mode: ${mode}\n`);
    process.exit(1);
  }

  await pool.end();
} catch (err) {
  console.error(err);
  process.exit(1);
}
