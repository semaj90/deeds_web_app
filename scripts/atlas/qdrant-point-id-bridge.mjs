#!/usr/bin/env node

/**
 * Qdrant Point ID Bridge
 *
 * Deterministic mapping: packet_key ↔ qdrant_point_id(s)
 *
 * Challenge: Many-to-one relationship
 *   - Qdrant: 40.5K points (code chunks)
 *   - atlas_packets: 58.3K rows (packet identity)
 *   - One packet_key may have N qdrant_point_ids (multiple chunks from same source)
 *
 * Solution: Memoized hash bridge via source_ref + chunk_id + codebase_chunk_index
 *
 * Usage:
 *   node scripts/atlas/qdrant-point-id-bridge.mjs --dry-run
 *   node scripts/atlas/qdrant-point-id-bridge.mjs --apply
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const QDRANT_URL = `http://${env.QDRANT_HOST || '127.0.0.1'}:${env.QDRANT_PORT || 6333}`;

const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });
const qdrantClient = new QdrantClient({ url: QDRANT_URL });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Qdrant Point ID Bridge                                        ║');
console.log('║  Deterministic packet_key ↔ qdrant_point_id(s) mapping        ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function bridgeQdrantPoints() {
  try {
    console.log('📊 Step 1: Audit current state\n');

    // Count Qdrant points
    const collectionInfo = await qdrantClient.getCollection('codebase_chunks_768');
    const qdrantPointCount = collectionInfo.points_count;
    console.log(`   Qdrant points: ${qdrantPointCount}`);

    // Count atlas_packets with source_ref
    const packetRes = await pgPool.query(`
      SELECT COUNT(*) total, COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) with_ref
      FROM atlas_packets
    `);
    const { total: packetTotal, with_ref: packetWithRef } = packetRes.rows[0];
    console.log(`   Atlas packets: ${packetTotal} (${packetWithRef} with source_ref)`);

    // Count codebase_chunk_index rows
    const chunkRes = await pgPool.query(`
      SELECT COUNT(*) total FROM codebase_chunk_index
    `);
    const chunkTotal = chunkRes.rows[0].total;
    console.log(`   Code chunks: ${chunkTotal}`);
    console.log();

    console.log('🔗 Step 2: Fetch Qdrant payloads and match to packets\n');

    // Query Qdrant collection with payload
    const qdrantQuery = await qdrantClient.scroll('codebase_chunks_768', {
      limit: 100000,
      with_payload: true,
      with_vectors: false,
    });

    const pointsBySourceRef = {};

    for (const point of qdrantQuery.points) {
      const { payload, id } = point;
      if (!payload?.source_ref) continue;

      const sourceRef = payload.source_ref;
      if (!pointsBySourceRef[sourceRef]) {
        pointsBySourceRef[sourceRef] = [];
      }
      pointsBySourceRef[sourceRef].push(id);
    }

    console.log(`   Fetched ${qdrantQuery.points.length} points from Qdrant`);
    console.log(`   Matched ${Object.keys(pointsBySourceRef).length} unique source_ref values`);
    console.log();

    console.log('💾 Step 3: Build bridge table via codebase_chunk_index\n');

    // Join: atlas_packets (source_ref) + codebase_chunk_index (source_ref, chunk_id) + Qdrant (payload)
    // Goal: for each packet_key, collect all qdrant_point_id(s)
    const bridgeRes = await pgPool.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.source_ref_key,
        ap.feature_id,
        ap.title_id,
        ap.tree_node_id,
        ap.feature_label,
        ap.concept_ids,
        ap.domain_class,
        ap.community_id,
        ap.som_cluster,
        ap.qdrant_point_id,
        COUNT(DISTINCT cci.id) as chunk_count,
        array_agg(DISTINCT cci.id) FILTER (WHERE cci.id IS NOT NULL) as chunk_ids
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci ON ap.source_ref = cci.source_ref
      WHERE ap.source_ref IS NOT NULL
      GROUP BY ap.packet_key, ap.source_ref, ap.source_ref_key, ap.feature_id, ap.title_id, ap.tree_node_id, ap.feature_label, ap.concept_ids, ap.domain_class, ap.community_id, ap.som_cluster, ap.qdrant_point_id
    `);

    let validationFailures = 0;
    const validatedRows = [];

    // Validate all rows before building bridge
    for (const row of bridgeRes.rows) {
      const { validation } = buildCanonicalFeatureEnvelope({
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        source_ref_key: row.source_ref_key,
        feature_id: row.feature_id,
        title_id: row.title_id,
        tree_node_id: row.tree_node_id,
        feature_label: row.feature_label,
        concept_ids: row.concept_ids,
        domain_class: row.domain_class,
        community_id: row.community_id,
        som_cluster: row.som_cluster,
        qdrant_point_id: row.qdrant_point_id,
      });

      if (!validation.isValid && validation.hardFailures.length > 0) {
        if (process.argv.includes('--verbose')) {
          reportValidation(validation, row.packet_key);
        }
        validationFailures++;
      } else {
        validatedRows.push(row);
      }
    }

    const bridgeRows = validatedRows;
    console.log(`   Built bridge: ${bridgeRows.length} packets → chunks (${validationFailures} validation failures skipped)`);

    // Estimate coverage
    const withChunks = bridgeRows.filter(r => r.chunk_count > 0).length;
    console.log(`   Packets with ≥1 chunk: ${withChunks}/${bridgeRows.length} (${(100 * withChunks / bridgeRows.length).toFixed(1)}%)`);
    console.log();

    if (DRY_RUN) {
      console.log('📋 DRY-RUN: Sample bridge mappings\n');
      bridgeRows.slice(0, 5).forEach(row => {
        console.log(`   packet_key: ${row.packet_key}`);
        console.log(`   source_ref: ${row.source_ref}`);
        console.log(`   chunks: ${row.chunk_count} (IDs: ${row.chunk_ids?.slice(0, 3)?.join(', ')}${row.chunk_count > 3 ? '...' : ''})`);
        console.log();
      });
    } else {
      console.log('📝 Step 4: Update atlas_packets with qdrant_point_id array\n');

      // Create temporary mapping table
      await pgPool.query(`
        CREATE TEMP TABLE bridge_temp (
          packet_key TEXT,
          qdrant_point_ids BIGINT[]
        )
      `);

      // Populate temp table with actual Qdrant point IDs
      const insertValues = [];
      const insertParams = [];
      let paramIdx = 1;

      for (const row of bridgeRows) {
        if (!row.chunk_ids || row.chunk_ids.length === 0) continue;

        // For each chunk_id, look up corresponding qdrant_point_ids
        const chunkIdStr = row.chunk_ids.join(',');
        const pointIds = [];
        for (const cid of row.chunk_ids) {
          // Search Qdrant for this chunk_id
          const searchRes = await qdrantClient.search('codebase_chunks_768', {
            filter: { must: [{ key: 'chunk_id', match: { value: cid } }] },
            limit: 1,
            with_vectors: false,
            with_payload: false,
          });
          if (searchRes.length > 0) {
            pointIds.push(searchRes[0].id);
          }
        }

        if (pointIds.length > 0) {
          insertParams.push(row.packet_key, `{${pointIds.join(',')}}`);
          insertValues.push(`($${paramIdx}, $${paramIdx + 1}::BIGINT[])`);
          paramIdx += 2;
        }
      }

      if (insertValues.length > 0) {
        const insertSQL = `
          INSERT INTO bridge_temp (packet_key, qdrant_point_ids)
          VALUES ${insertValues.join(', ')}
        `;
        await pgPool.query(insertSQL, insertParams);
        console.log(`   Inserted ${insertValues.length} mappings into temp table`);
      }

      // Update atlas_packets with qdrant_point_id array
      const updateRes = await pgPool.query(`
        UPDATE atlas_packets ap
        SET qdrant_point_ids = bt.qdrant_point_ids, updated_at = NOW()
        FROM bridge_temp bt
        WHERE ap.packet_key = bt.packet_key
      `);

      console.log(`   ✅ Updated ${updateRes.rowCount} atlas_packets with qdrant_point_ids\n`);
    }

    console.log('✅ Qdrant bridge complete!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

bridgeQdrantPoints();
