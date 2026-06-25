#!/usr/bin/env node

/**
 * Week 1: Packet Registry Backfill
 *
 * Merges data from atlas_packets and nes_chrom_packets into atlas_packet_registry
 * - Deduplicates by packet_key
 * - Maps canonical fields
 * - Batches 100 rows per insert
 * - Reports progress every 100 rows
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin@127.0.0.1:5432/legal_ai_db',
});

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = 100;

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const logVerbose = (msg) => VERBOSE && console.log(`[VERBOSE] ${msg}`);

async function backfillPacketRegistry() {
  let connection;
  try {
    connection = await pool.connect();
    log('Connected to database');

    // Step 1: Get unique packets from both tables
    log('Fetching packets from atlas_packets and nes_chrom_packets...');

    const query = `
      WITH atlas_base AS (
        SELECT
          packet_key,
          source_ref,
          COALESCE(file_path, '') as file_path,
          feature_id,
          feature_label,
          summary,
          CASE WHEN embedding IS NOT NULL THEN 'complete' ELSE 'missing' END as embedding_status,
          NULL::bigint as qdrant_point_id,
          NULL::text as neo4j_node_id,
          NULL::text as valkey_cache_key,
          reward_prior as pagerank_score,
          NULL::real as authority_blend,
          tags,
          metadata,
          'atlas_packets' as source_table,
          created_at,
          updated_at,
          ROW_NUMBER() OVER (PARTITION BY packet_key ORDER BY updated_at DESC) as rn
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
      ),
      nes_base AS (
        SELECT
          packet_key,
          source_ref,
          '' as file_path,
          feature_id,
          feature_label,
          summary,
          CASE WHEN embedding IS NOT NULL THEN 'complete' ELSE 'missing' END as embedding_status,
          CAST(qdrant_point_id AS bigint) as qdrant_point_id,
          NULL::text as neo4j_node_id,
          NULL::text as valkey_cache_key,
          confidence_score::real as pagerank_score,
          NULL::real as authority_blend,
          NULL as tags,
          payload as metadata,
          'nes_chrom_packets' as source_table,
          created_at,
          updated_at,
          ROW_NUMBER() OVER (PARTITION BY packet_key ORDER BY updated_at DESC) as rn
        FROM nes_chrom_packets
        WHERE packet_key IS NOT NULL
      ),
      combined AS (
        SELECT * FROM atlas_base WHERE rn = 1
        UNION ALL
        SELECT * FROM nes_base WHERE rn = 1
          AND packet_key NOT IN (SELECT packet_key FROM atlas_base WHERE rn = 1)
      )
      SELECT
        packet_key,
        source_ref,
        file_path,
        feature_id,
        feature_label,
        summary,
        embedding_status,
        qdrant_point_id,
        neo4j_node_id,
        valkey_cache_key,
        pagerank_score,
        authority_blend,
        'cold' as cache_state,
        'active' as status,
        created_at,
        updated_at
      FROM combined
      ORDER BY packet_key
    `;

    const result = await connection.query(query);
    const packets = result.rows;

    log(`Found ${packets.length} unique packets to backfill`);

    if (DRY_RUN) {
      log('DRY RUN MODE - Preview of first 5 packets:');
      packets.slice(0, 5).forEach((p, idx) => {
        console.log(`  ${idx + 1}. packet_key=${p.packet_key}, feature_id=${p.feature_id}, source_ref=${p.source_ref}`);
      });
      log(`Would insert ${packets.length} packets in ${Math.ceil(packets.length / BATCH_SIZE)} batches`);
      return;
    }

    // Step 2: Batch insert
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);

      try {
        const insertQuery = `
          INSERT INTO atlas_packet_registry (
            packet_key,
            source_ref,
            file_path,
            feature_id,
            title,
            summary,
            embedding_status,
            qdrant_point_id,
            neo4j_node_id,
            valkey_cache_key,
            pagerank_score,
            authority_blend,
            cache_state,
            status,
            created_at,
            updated_at
          ) VALUES ${batch.map((_, idx) => {
            const offset = idx * 16;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`;
          }).join(',')}
          ON CONFLICT (packet_key) DO UPDATE SET
            updated_at = EXCLUDED.updated_at
          RETURNING packet_key
        `;

        const values = [];
        batch.forEach(p => {
          values.push(
            p.packet_key,
            p.source_ref,
            p.file_path,
            p.feature_id,
            p.feature_label,
            p.summary,
            p.embedding_status,
            p.qdrant_point_id,
            p.neo4j_node_id,
            p.valkey_cache_key,
            p.pagerank_score,
            p.authority_blend,
            p.cache_state,
            p.status,
            p.created_at,
            p.updated_at
          );
        });

        const batchResult = await connection.query(insertQuery, values);
        inserted += batchResult.rowCount;

        log(`Progress: ${Math.min(i + BATCH_SIZE, packets.length)}/${packets.length} packets inserted (${inserted} total)`);
      } catch (err) {
        errors++;
        console.error(`Error inserting batch at offset ${i}:`, err.message);
        logVerbose(err.stack);
      }
    }

    log(`Backfill complete: ${inserted} packets inserted, ${errors} errors`);

  } catch (err) {
    console.error('Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

log('Starting Week 1 Packet Registry Backfill...');
if (DRY_RUN) log('DRY RUN MODE - no data will be written');
backfillPacketRegistry().catch(err => {
  console.error(err);
  process.exit(1);
});
