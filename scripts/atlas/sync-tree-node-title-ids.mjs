#!/usr/bin/env node

/**
 * Sync tree_node_id and title_id to atlas_packets
 *
 * Ensures canonical envelope has complete identity chain:
 *   packet_key → title_id → tree_node_id
 *
 * Sources:
 *   - tree_node_id: from AST parsing (stored in codebase_chunk_index.neo4j_meta.tree_node_id)
 *   - title_id: from content summary title (stable hash of first line)
 *
 * Coverage target: 99%+ (only gRPC/proto packets may lack tree_node_id)
 *
 * Usage:
 *   node scripts/atlas/sync-tree-node-title-ids.mjs --dry-run
 *   node scripts/atlas/sync-tree-node-title-ids.mjs --apply
 */

import pg from 'pg';
import crypto from 'node:crypto';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Sync tree_node_id and title_id to atlas_packets              ║');
console.log('║  Completes canonical envelope identity chain                  ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

function hashTitle(title) {
  if (!title) return null;
  return crypto.createHash('sha256').update(title.substring(0, 100)).digest('hex').substring(0, 16);
}

async function syncTreeNodeAndTitleIds() {
  try {
    console.log('📊 Step 1: Audit current coverage\n');

    const auditRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) with_tree_node,
        COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) with_title,
        COUNT(CASE WHEN feature_id LIKE 'grpc_%' THEN 1 END) grpc_packets,
        COUNT(CASE WHEN feature_id LIKE 'proto:%' THEN 1 END) proto_packets
      FROM atlas_packets
    `);

    const {
      total,
      with_tree_node,
      with_title,
      grpc_packets,
      proto_packets,
    } = auditRes.rows[0];

    console.log(`Total packets: ${total}`);
    console.log(`With tree_node_id: ${with_tree_node}/${total} (${(100 * with_tree_node / total).toFixed(1)}%)`);
    console.log(`With title_id: ${with_title}/${total} (${(100 * with_title / total).toFixed(1)}%)`);
    console.log(`gRPC packets: ${grpc_packets}`);
    console.log(`Proto packets: ${proto_packets}`);
    console.log();

    console.log('📝 Step 2: Build sync strategy\n');

    // Strategy A: Backfill tree_node_id from codebase_chunk_index neo4j_meta
    // Strategy B: Backfill title_id from summary first line hash

    const strategyRes = await pgPool.query(`
      SELECT
        COUNT(*) backfill_candidates,
        COUNT(CASE WHEN cci.neo4j_meta->'tree_node_id' IS NOT NULL THEN 1 END) has_neo4j_meta,
        COUNT(CASE WHEN cci.summary IS NOT NULL AND LENGTH(cci.summary) > 0 THEN 1 END) has_summary
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci ON ap.source_ref = cci.relative_path
      WHERE ap.tree_node_id IS NULL AND ap.feature_id NOT LIKE 'grpc_%' AND ap.feature_id NOT LIKE 'proto:%'
    `);

    const { backfill_candidates, has_neo4j_meta, has_summary } = strategyRes.rows[0];
    console.log(`Backfill candidates (non-gRPC/proto): ${backfill_candidates}`);
    console.log(`  Have neo4j_meta.tree_node_id: ${has_neo4j_meta}`);
    console.log(`  Have summary: ${has_summary}`);
    console.log();

    if (DRY_RUN) {
      console.log('📋 DRY-RUN: Would perform updates\n');
      console.log('Update 1: backfill tree_node_id from codebase_chunk_index neo4j_meta');
      console.log(`  Estimated rows: ${has_neo4j_meta}`);
      console.log();
      console.log('Update 2: generate title_id from summary hash');
      console.log(`  Estimated rows: ${has_summary}`);
      console.log();

      // Show samples
      const sampleRes = await pgPool.query(`
        SELECT
          ap.packet_key,
          ap.feature_id,
          ap.tree_node_id,
          ap.title_id,
          cci.summary
        FROM atlas_packets ap
        LEFT JOIN codebase_chunk_index cci ON ap.source_ref = cci.relative_path
        WHERE ap.tree_node_id IS NULL AND cci.summary IS NOT NULL
        LIMIT 3
      `);

      console.log('Sample backfill candidates:');
      sampleRes.rows.forEach((row, idx) => {
        const titleHash = hashTitle(row.summary);
        console.log(`  ${idx + 1}. ${row.feature_id}`);
        console.log(`     Summary: ${row.summary.substring(0, 60)}`);
        console.log(`     Title ID (would be): ${titleHash}`);
      });
      console.log();

    } else {
      console.log('💾 Step 3: Apply backfill updates\n');

      // Update 1: tree_node_id from neo4j_meta
      const treeRes = await pgPool.query(`
        UPDATE atlas_packets ap
        SET
          tree_node_id = (cci.neo4j_meta->>'tree_node_id'),
          updated_at = NOW()
        FROM codebase_chunk_index cci
        WHERE
          ap.source_ref = cci.relative_path
          AND ap.tree_node_id IS NULL
          AND cci.neo4j_meta->>'tree_node_id' IS NOT NULL
      `);

      console.log(`✅ Updated tree_node_id: ${treeRes.rowCount} rows`);

      // Update 2: title_id from summary hash (client-side to compute hash)
      // Since we can't compute hash in SQL easily, do it in two passes
      const summaryRes = await pgPool.query(`
        SELECT
          ap.packet_key,
          SUBSTRING(cci.summary, 1, 100) as title_text
        FROM atlas_packets ap
        LEFT JOIN codebase_chunk_index cci ON ap.source_ref = cci.relative_path
        WHERE
          ap.title_id IS NULL
          AND cci.summary IS NOT NULL
          AND LENGTH(cci.summary) > 0
      `);

      const titleUpdates = [];
      for (const row of summaryRes.rows) {
        const titleHash = hashTitle(row.title_text);
        if (titleHash) {
          titleUpdates.push({ packet_key: row.packet_key, title_id: titleHash });
        }
      }

      if (titleUpdates.length > 0) {
        const updateValues = [];
        const updateParams = [];
        let paramIdx = 1;

        for (const update of titleUpdates) {
          updateParams.push(update.title_id, update.packet_key);
          updateValues.push(`($${paramIdx}, $${paramIdx + 1})`);
          paramIdx += 2;
        }

        const titleUpdateRes = await pgPool.query(
          `
          UPDATE atlas_packets ap
          SET title_id = v.title_id, updated_at = NOW()
          FROM (VALUES ${updateValues.join(', ')})
          AS v(title_id, packet_key)
          WHERE ap.packet_key = v.packet_key
          `,
          updateParams
        );

        console.log(`✅ Updated title_id: ${titleUpdateRes.rowCount} rows`);
      }

      console.log();
    }

    console.log('4️⃣  Step 4: Verify final coverage\n');

    const finalRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) with_tree_node,
        COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) with_title,
        COUNT(CASE WHEN tree_node_id IS NOT NULL AND title_id IS NOT NULL THEN 1 END) both,
        ROUND(100.0 * COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) / COUNT(*), 2) tree_pct,
        ROUND(100.0 * COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) / COUNT(*), 2) title_pct
      FROM atlas_packets
    `);

    const {
      total: finalTotal,
      with_tree_node: finalTree,
      with_title: finalTitle,
      both,
      tree_pct,
      title_pct,
    } = finalRes.rows[0];

    console.log(`Tree node ID: ${finalTree}/${finalTotal} (${tree_pct}%)`);
    console.log(`Title ID: ${finalTitle}/${finalTotal} (${title_pct}%)`);
    console.log(`Both fields: ${both}/${finalTotal}`);
    console.log();

    console.log('✅ Tree node / title ID sync complete!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

syncTreeNodeAndTitleIds();
