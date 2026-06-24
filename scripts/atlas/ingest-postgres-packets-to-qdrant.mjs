#!/usr/bin/env node
/**
 * Ingest Postgres packets with embeddings into Qdrant
 *
 * Purpose:
 *   Finds packets in Postgres with embeddings that are missing from Qdrant.
 *   Batch upserts them into the codebase_chunks_768 collection.
 *
 * Usage:
 *   node scripts/atlas/ingest-postgres-packets-to-qdrant.mjs [--apply] [--verbose] [--batch-size=100]
 */

import pg from 'pg';
import fetch from 'node-fetch';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;
const BATCH_SIZE_ARG = argv.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split('=')[1]) : 100;

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'codebase_chunks_768';

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function getPacketsWithoutQdrant() {
  const result = await db.query(`
    SELECT
      packet_id, packet_key, embedding, som_index, som_row, som_col,
      feature_id, feature_label, source_ref, file_path, community_id,
      cluster_id, canonical, payload
    FROM atlas_packets
    WHERE embedding IS NOT NULL
      AND qdrant_point_id IS NULL
    LIMIT 1000
  `);
  return result.rows;
}

function embeddingToFloat32(embeddingJson) {
  try {
    const arr = JSON.parse(embeddingJson);
    return new Float32Array(arr);
  } catch (e) {
    vlog(`⚠️ Failed to parse embedding: ${e.message}`);
    return null;
  }
}

async function upsertToQdrant(points) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status}: ${text}`);
    }

    return true;
  } catch (e) {
    vlog(`❌ Qdrant upsert failed: ${e.message}`);
    return false;
  }
}

async function ingestPackets() {
  log(`\n═══ Postgres Packets → Qdrant Ingest ═══\n`);

  try {
    // Step 1: Fetch packets without Qdrant IDs
    log(`1. Finding packets with embeddings but no Qdrant entry...`);
    const packets = await getPacketsWithoutQdrant();
    log(`   ✅ Found ${packets.length} packets to ingest`);

    if (packets.length === 0) {
      log(`   All packets already in Qdrant.`);
      process.exit(0);
    }

    // Step 2: Transform to Qdrant point format
    log(`\n2. Preparing Qdrant points...`);
    const points = [];
    let prepared = 0;

    for (const packet of packets) {
      const embedding = embeddingToFloat32(packet.embedding);
      if (!embedding) continue;

      const payload = {
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        file_path: packet.file_path,
        feature_id: packet.feature_id,
        feature_label: packet.feature_label,
        community_id: packet.community_id,
        cluster_id: packet.cluster_id,
        som_index: packet.som_index,
        som_row: packet.som_row,
        som_col: packet.som_col,
        canonical: packet.canonical,
        source_kind: 'parent-atlas',
        normalized_at: new Date().toISOString(),
        ...(packet.payload || {})
      };

      points.push({
        id: parseInt(packet.packet_id.replace(/-/g, '').slice(0, 16), 16) % (2**31),  // Deterministic ID from packet_id
        vector: {
          content: Array.from(embedding)
        },
        payload
      });

      prepared++;
    }

    log(`   ✅ Prepared ${prepared} points`);

    // Step 3: Batch upsert to Qdrant
    if (APPLY && points.length > 0) {
      log(`\n3. Upserting to Qdrant (${BATCH_SIZE} per batch)...`);

      let uploaded = 0;
      for (let i = 0; i < points.length; i += BATCH_SIZE) {
        const batch = points.slice(i, i + BATCH_SIZE);
        const success = await upsertToQdrant(batch);

        if (success) {
          uploaded += batch.length;
          process.stdout.write(`\r   Uploaded ${uploaded}/${points.length}`);
        } else {
          throw new Error(`Batch upsert failed at offset ${i}`);
        }
      }

      process.stdout.write('\n');
      log(`   ✅ Uploaded: ${uploaded} points`);
    } else if (points.length > 0) {
      log(`   [Dry-run] Would upload ${points.length} points`);
    }

    // Step 4: Verify (query Qdrant for count)
    log(`\n4. Verifying ingest...`);
    const countResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (countResponse.ok) {
      const data = await countResponse.json();
      const pointsCount = data.result?.points_count || 0;
      log(`   Qdrant total points: ${pointsCount}`);
    }

    log(`\n✨ Done.`);
    process.exit(0);
  } catch (e) {
    log(`❌ Fatal error: ${e.message}`);
    console.error(e);
    process.exit(1);
  } finally {
    await db.end();
  }
}

ingestPackets();
