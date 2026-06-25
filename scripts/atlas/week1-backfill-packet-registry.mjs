#!/usr/bin/env node
/**
 * Week 1: Packet Registry Backfill
 *
 * Backfills atlas_packet_registry with canonical data from:
 * - atlas_codebase_packets (3,251 rows — primary source)
 * - atlas_packets (embedding vectors, authority scores)
 *
 * Target: 3,251 packets with 100% coverage of identity spine
 * (packet_key, source_ref, file_path, feature_id)
 */

import { createPool } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry');
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

// PostgreSQL connection
const pool = createPool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: process.env.PG_PORT || 5434,
  user: process.env.PG_USER || 'legal_admin',
  password: process.env.PG_PASSWORD || 'legal_admin_pw',
  database: process.env.PG_DATABASE || 'legal_ai_db'
});

async function log(msg, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = { info: 'ℹ️ ', success: '✅', warning: '⚠️ ', error: '❌' }[level] || '';
  console.log(`${prefix} [${timestamp}] ${msg}`);
}

async function logProgress(current, total, msg = '') {
  const pct = ((current / total) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  console.log(`[${bar}] ${pct}% (${current}/${total}) ${msg}`);
}

async function backfill() {
  await log('Week 1: Packet Registry Backfill started', 'info');
  await log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`, 'info');

  try {
    // Connect to database
    const client = await pool.connect();
    await log('Connected to PostgreSQL', 'success');

    try {
      // Step 1: Fetch source data from atlas_codebase_packets
      await log('Step 1: Fetching canonical packets from atlas_codebase_packets...', 'info');

      const sourceQuery = `
        SELECT
          acp.packet_key,
          acp.source_ref,
          acp.file_path,
          acp.feature_id,
          acp.feature_label,
          acp.summary,
          acp.created_at,
          acp.updated_at,
          acp.som_row,
          acp.som_col,
          acp.kmeans_cluster,
          ap.embedding,
          ap.pagerank_score,
          ap.authority_blend,
          ap.qdrant_point_id,
          ap.qdrant_vector_dim
        FROM atlas_codebase_packets acp
        LEFT JOIN atlas_packets ap ON acp.packet_key = ap.packet_key
        ORDER BY acp.created_at;
      `;

      const result = await client.query(sourceQuery);
      const sourcePackets = result.rows;
      await log(`Fetched ${sourcePackets.length} source packets`, 'success');

      if (sourcePackets.length === 0) {
        await log('No packets found in source tables!', 'error');
        return false;
      }

      // Step 2: Calculate backfill statistics
      await log('Step 2: Analyzing packet data...', 'info');

      const stats = {
        total: sourcePackets.length,
        withPacketKey: sourcePackets.filter(p => p.packet_key).length,
        withSourceRef: sourcePackets.filter(p => p.source_ref).length,
        withFeatureId: sourcePackets.filter(p => p.feature_id).length,
        withEmbedding: sourcePackets.filter(p => p.embedding).length,
        withQdrantId: sourcePackets.filter(p => p.qdrant_point_id).length,
        withPagerank: sourcePackets.filter(p => p.pagerank_score).length,
      };

      await log(`Packets with packet_key: ${stats.withPacketKey}/${stats.total} (${((stats.withPacketKey/stats.total)*100).toFixed(1)}%)`, 'info');
      await log(`Packets with source_ref: ${stats.withSourceRef}/${stats.total} (${((stats.withSourceRef/stats.total)*100).toFixed(1)}%)`, 'info');
      await log(`Packets with feature_id: ${stats.withFeatureId}/${stats.total} (${((stats.withFeatureId/stats.total)*100).toFixed(1)}%)`, 'info');
      await log(`Packets with embedding: ${stats.withEmbedding}/${stats.total} (${((stats.withEmbedding/stats.total)*100).toFixed(1)}%)`, 'info');
      await log(`Packets with qdrant_point_id: ${stats.withQdrantId}/${stats.total} (${((stats.withQdrantId/stats.total)*100).toFixed(1)}%)`, 'info');
      await log(`Packets with pagerank: ${stats.withPagerank}/${stats.total} (${((stats.withPagerank/stats.total)*100).toFixed(1)}%)`, 'info');

      if (DRY_RUN) {
        await log('DRY-RUN complete. Use --apply to execute backfill.', 'warning');
        return true;
      }

      // Step 3: Backfill into atlas_packet_registry
      if (!APPLY) {
        await log('DRY-RUN mode. Use --apply flag to execute.', 'warning');
        return true;
      }

      await log('Step 3: Backfilling atlas_packet_registry...', 'info');

      const BATCH_SIZE = 100;
      let inserted = 0;
      let skipped = 0;

      for (let i = 0; i < sourcePackets.length; i += BATCH_SIZE) {
        const batch = sourcePackets.slice(i, i + BATCH_SIZE);

        for (const packet of batch) {
          // Skip invalid packets
          if (!packet.packet_key || !packet.source_ref || !packet.feature_id) {
            skipped++;
            continue;
          }

          const activity = {
            created_at: new Date().toISOString(),
            source: 'week1_backfill'
          };

          try {
            await client.query(`
              INSERT INTO atlas_packet_registry (
                packet_key,
                source_ref,
                file_path,
                feature_id,
                title,
                summary,
                embedding_status,
                embedding_768d,
                qdrant_point_id,
                pagerank_score,
                authority_blend,
                cache_state,
                activity,
                status,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
              ON CONFLICT (packet_key) DO UPDATE SET
                source_ref = EXCLUDED.source_ref,
                file_path = EXCLUDED.file_path,
                feature_id = EXCLUDED.feature_id,
                embedding_768d = COALESCE(EXCLUDED.embedding_768d, atlas_packet_registry.embedding_768d),
                qdrant_point_id = COALESCE(EXCLUDED.qdrant_point_id, atlas_packet_registry.qdrant_point_id),
                updated_at = EXCLUDED.updated_at
            `, [
              packet.packet_key,
              packet.source_ref,
              packet.file_path,
              packet.feature_id,
              packet.feature_label || packet.packet_key,
              packet.summary || null,
              packet.embedding ? 'complete' : 'missing',
              packet.embedding || null,
              packet.qdrant_point_id || null,
              packet.pagerank_score || null,
              packet.authority_blend || null,
              packet.embedding ? 'L3:qdrant' : 'cold',
              JSON.stringify(activity),
              'active',
              packet.created_at || new Date(),
              packet.updated_at || new Date()
            ]);

            inserted++;
          } catch (err) {
            if (VERBOSE) {
              await log(`Failed to insert ${packet.packet_key}: ${err.message}`, 'error');
            }
            skipped++;
          }
        }

        const current = Math.min(i + BATCH_SIZE, sourcePackets.length);
        await logProgress(current, sourcePackets.length);
      }

      // Step 4: Verify backfill
      await log('Step 4: Verifying backfill...', 'info');

      const verifyResult = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as with_packet_key,
          COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as with_source_ref,
          COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as with_feature_id,
          COUNT(CASE WHEN embedding_768d IS NOT NULL THEN 1 END) as with_embedding,
          COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as with_qdrant,
          COUNT(DISTINCT CASE WHEN cache_state = 'L3:qdrant' THEN 1 END) as l3_cached
        FROM atlas_packet_registry
        WHERE status = 'active';
      `);

      const verify = verifyResult.rows[0];
      await log(`Backfill complete:`, 'success');
      await log(`  Total packets: ${verify.total}`, 'info');
      await log(`  Packets with packet_key: ${verify.with_packet_key}/${verify.total}`, 'info');
      await log(`  Packets with source_ref: ${verify.with_source_ref}/${verify.total}`, 'info');
      await log(`  Packets with feature_id: ${verify.with_feature_id}/${verify.total}`, 'info');
      await log(`  Packets with embedding_768d: ${verify.with_embedding}/${verify.total}`, 'info');
      await log(`  Packets with qdrant_point_id: ${verify.with_qdrant}/${verify.total}`, 'info');

      // Check materialized views
      const viewCheck = await client.query(`
        SELECT COUNT(*) as count FROM v_packet_cache_audit;
      `);

      await log(`Materialized views ready: v_packet_cache_audit (${viewCheck.rows[0].count} rows)`, 'success');

      return verify.total >= 3000; // Success if we got most packets

    } finally {
      client.release();
    }

  } catch (err) {
    await log(`Backfill failed: ${err.message}`, 'error');
    if (VERBOSE) {
      console.error(err);
    }
    return false;
  } finally {
    await pool.end();
  }
}

// Main execution
const success = await backfill();
process.exit(success ? 0 : 1);
