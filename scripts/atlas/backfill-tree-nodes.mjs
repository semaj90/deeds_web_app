#!/usr/bin/env node

/**
 * Backfill Tree Nodes: atlas_tree_nodes Hierarchy
 * Creates document (root) and chunk (leaf) nodes from the active packet ledger.
 *
 * Modes:
 *   --dry-run (default)   Show what would be inserted without committing
 *   --apply               Actually insert rows
 *   --limit N             Limit to first N files
 *   --verify              Check existing hierarchy state and gaps
 *
 * Contract:
 * - root nodes: node_type='document', parent_id IS NULL, tree_depth=0
 * - child nodes: node_type='chunk', parent_id IS NOT NULL, tree_depth=1
 * - page_index_path required, must start with 'doc:'
 * - ledger_type='canonical'
 * - lineage_version='tree-nodes-v1'
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const args = {
  dryRun: !process.argv.includes('--apply'),
  limit: (() => {
    const argv = process.argv.slice(2);
    const eq = argv.find((a) => a.startsWith('--limit='));
    if (eq) return parseInt(eq.split('=')[1] || '999999', 10);
    const pos = argv.findIndex((a) => a === '--limit');
    return parseInt((pos >= 0 ? argv[pos + 1] : '999999') || '999999', 10);
  })(),
  verify: process.argv.includes('--verify'),
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const PACKET_TABLE_CANDIDATES = ['atlas_codebase_packets', 'atlas_packets'];

const log = {
  info: (msg) => console.log(`[tree-nodes] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Safe slug for page_index_path
 */
function safeSlug(str) {
  return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

async function detectPacketTable(client) {
  const res = await client.query(
    `
      SELECT table_name,
             EXISTS (
               SELECT 1
               FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = t.table_name
                 AND c.column_name = 'tree_node_id'
             ) AS has_tree_node_id
      FROM unnest($1::text[]) AS t(table_name)
      WHERE EXISTS (
        SELECT 1
        FROM information_schema.tables i
        WHERE i.table_schema = 'public'
          AND i.table_name = t.table_name
      )
      ORDER BY CASE table_name
        WHEN 'atlas_codebase_packets' THEN 0
        WHEN 'atlas_packets' THEN 1
        ELSE 2
      END
      LIMIT 1
    `,
    [PACKET_TABLE_CANDIDATES]
  );

  if (res.rows.length === 0) {
    throw new Error(
      `No packet ledger found. Expected one of: ${PACKET_TABLE_CANDIDATES.join(', ')}`
    );
  }

  return {
    tableName: res.rows[0].table_name,
    hasTreeNodeId: res.rows[0].has_tree_node_id === true,
  };
}

async function findExistingTreeNodeId(client, { sourceRef, packetKey, nodeType }) {
  const conditions = ['node_type = $1'];
  const params = [nodeType];

  if (packetKey) {
    conditions.push(`packet_key = $${params.length + 1}`);
    params.push(packetKey);
  }

  if (sourceRef) {
    conditions.push(`source_ref = $${params.length + 1}`);
    params.push(sourceRef);
  }

  const res = await client.query(
    `SELECT node_id
       FROM atlas_tree_nodes
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at ASC NULLS LAST, updated_at ASC NULLS LAST
      LIMIT 1`,
    params
  );

  return res.rows[0]?.node_id ?? null;
}

/**
 * Backfill tree nodes
 */
async function backfill() {
  const client = await pool.connect();
  const stats = {
    filesProcessed: 0,
    documentsCreated: 0,
    documentsReused: 0,
    chunksCreated: 0,
    chunksReused: 0,
    packetLinksUpdated: 0,
    packetLinksSkipped: 0,
    duplicateDocuments: 0,
    duplicateChunks: 0,
    errors: [],
  };

  try {
    const packetLedger = await detectPacketTable(client);
    log.info(`Mode: ${args.dryRun ? 'DRY-RUN' : 'APPLY'}`);
    log.info(`Packet ledger: ${packetLedger.tableName}${packetLedger.hasTreeNodeId ? ' (tree_node_id available)' : ''}`);
    if (args.limit < 999999) log.info(`Limit: ${args.limit} files`);

    // Get unique files
    const filesResult = await client.query(
      `SELECT DISTINCT source_ref, file_path
       FROM ${packetLedger.tableName}
       WHERE source_ref IS NOT NULL
       ORDER BY source_ref
       LIMIT $1`,
      [args.limit]
    );
    const files = filesResult.rows;
    log.info(`Found ${files.length} unique files\n`);

    for (const file of files) {
      const sourceRef = file.source_ref;
      const filePath = file.file_path || sourceRef;
      const title = sourceRef.split(/[\\/]/).pop() || sourceRef;
      const pageIndexPath = `doc:${safeSlug(sourceRef)}`;

      // Get packets for this file
      const packetsResult = await client.query(
        `SELECT packet_key, feature_id, feature_label, summary
         FROM ${packetLedger.tableName}
         WHERE source_ref = $1`,
        [sourceRef]
      );
      const packets = packetsResult.rows;

      // Count packets for metadata
      const packetCount = packets.length;

      // 1. Create document (root) node
      let rootNodeId = await findExistingTreeNodeId(client, {
        sourceRef,
        packetKey: null,
        nodeType: 'document',
      });
      const createRootNode = !rootNodeId;
      if (!rootNodeId) {
        rootNodeId = randomUUID();
      }
      const rootMetadata = {
        source: packetLedger.tableName,
        backfill: 'tree-nodes-v1',
        file_packet_count: packetCount,
        dominant_feature_id: packets[0]?.feature_id || null,
      };

      try {
        if (!args.dryRun && createRootNode) {
          await client.query(
            `INSERT INTO atlas_tree_nodes
              (node_id, root_id, source_ref, file_path, page_index_path, node_type, tree_depth, title, summary, metadata, ledger_type, lineage_version)
            VALUES
              ($1, $1, $2, $3, $4, 'document', 0, $5, NULL, $6, 'canonical', 'tree-nodes-v1')
            ON CONFLICT (node_id) DO NOTHING`,
            [
              rootNodeId,
              sourceRef,
              filePath,
              pageIndexPath,
              title,
              JSON.stringify(rootMetadata),
            ]
          );
          stats.documentsCreated++;
        } else if (!createRootNode) {
          stats.documentsReused++;
        }
      } catch (err) {
        if (err.code === '23505') {
          // Duplicate key
          stats.duplicateDocuments++;
        } else {
          stats.errors.push(`Document node ${sourceRef}: ${err.message}`);
        }
      }

      // 2. Create chunk (leaf) nodes for each packet
      for (const packet of packets) {
        const chunkPageIndexPath = `${pageIndexPath}/chunk:${safeSlug(packet.packet_key)}`;
        let chunkNodeId = await findExistingTreeNodeId(client, {
          sourceRef,
          packetKey: packet.packet_key,
          nodeType: 'chunk',
        });
        const createChunkNode = !chunkNodeId;
        if (!chunkNodeId) {
          chunkNodeId = randomUUID();
        }
        const chunkMetadata = {
          source: packetLedger.tableName,
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          backfill: 'tree-nodes-v1',
        };

        try {
          if (!args.dryRun && createChunkNode) {
            await client.query(
              `INSERT INTO atlas_tree_nodes
                (node_id, packet_key, root_id, parent_id, source_ref, file_path, page_index_path, node_type, tree_depth, title, summary, content_preview, feature_id, metadata, ledger_type, lineage_version)
              VALUES
                ($12, $1, $2, $3, $4, $5, $6, 'chunk', 1, $7, $8, $9, $10, $11, 'canonical', 'tree-nodes-v1')
              ON CONFLICT DO NOTHING`,
              [
                packet.packet_key,
                rootNodeId,
                rootNodeId,
                sourceRef,
                filePath,
                chunkPageIndexPath,
                packet.feature_label || packet.packet_key,
                packet.summary || null,
                packet.summary ? packet.summary.substring(0, 500) : null,
                packet.feature_id,
                JSON.stringify(chunkMetadata),
                chunkNodeId,
              ]
            );
            stats.chunksCreated++;
          } else if (!createChunkNode) {
            stats.chunksReused++;
          }

          if (!args.dryRun && packetLedger.hasTreeNodeId && packet.packet_key) {
            const updateRes = await client.query(
              `UPDATE ${packetLedger.tableName}
               SET tree_node_id = $1
               WHERE packet_key = $2
                 AND (tree_node_id IS NULL OR tree_node_id <> $1)`,
              [chunkNodeId, packet.packet_key]
            );
            stats.packetLinksUpdated += updateRes.rowCount || 0;
          } else if (!packetLedger.hasTreeNodeId) {
            stats.packetLinksSkipped++;
          }
        } catch (err) {
          if (err.code === '23505') {
            stats.duplicateChunks++;
          } else {
            stats.errors.push(`Chunk node ${packet.packet_key}: ${err.message}`);
          }
        }
      }

      stats.filesProcessed++;
      if (stats.filesProcessed % 100 === 0) {
        log.progress(
          `${stats.filesProcessed}/${files.length} files: ${stats.documentsCreated} docs, ${stats.chunksCreated} chunks`
        );
      }
    }

    log.ok(
      `Complete: ${stats.filesProcessed} files, ${stats.documentsCreated} docs created, ${stats.documentsReused} docs reused, ${stats.chunksCreated} chunks created, ${stats.chunksReused} chunks reused, ${stats.packetLinksUpdated} packet links updated`
    );

    if (args.dryRun) {
      log.warn('(dry-run: no changes committed)');
    }

    if (stats.errors.length > 0) {
      log.warn(`${stats.errors.length} errors:`);
      stats.errors.slice(0, 10).forEach((e) => log.warn(`  ${e}`));
      if (stats.errors.length > 10) log.warn(`  ...and ${stats.errors.length - 10} more`);
    }

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      mode: args.dryRun ? 'dry-run' : 'apply',
      packetLedger: packetLedger.tableName,
      packetLedgerHasTreeNodeId: packetLedger.hasTreeNodeId,
      stats,
    };

    const reportPath = path.join(
      __dirname,
      '../../docs/reports/tree-nodes-backfill.json'
    );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log.info(`Report saved to ${reportPath}`);

  } finally {
    client.release();
  }
}

/**
 * Verify tree node state
 */
async function verify() {
  const client = await pool.connect();

  try {
    const packetLedger = await detectPacketTable(client);
    log.info('Verifying tree node hierarchy...\n');

    const results = await client.query(`
      SELECT
        'documents' AS node_type,
        COUNT(*) AS total,
        SUM(CASE WHEN parent_id IS NULL THEN 1 ELSE 0 END) AS valid_roots,
        SUM(CASE WHEN parent_id IS NULL AND tree_depth = 0 THEN 1 ELSE 0 END) AS valid_depth,
        COUNT(DISTINCT source_ref) AS unique_files,
        COUNT(DISTINCT packet_key) AS with_packet_key
      FROM atlas_tree_nodes
      WHERE node_type = 'document'

      UNION ALL

      SELECT
        'chunks',
        COUNT(*),
        SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN parent_id IS NOT NULL AND tree_depth = 1 THEN 1 ELSE 0 END),
        COUNT(DISTINCT source_ref),
        COUNT(DISTINCT packet_key)
      FROM atlas_tree_nodes
      WHERE node_type = 'chunk'
    `);

    results.rows.forEach((row) => {
      log.info(`${row.node_type}:`);
      log.ok(`  total: ${row.total}`);
      log.ok(`  valid structure: ${row.valid_roots}/${row.total}`);
      log.ok(`  valid depth: ${row.valid_depth}/${row.total}`);
      log.info(`  unique sources: ${row.unique_files}`);
      log.info(`  with packet_key: ${row.with_packet_key}\n`);
    });

    // Check coverage
    const packetsResult = await client.query(
      `SELECT COUNT(*) as total FROM ${packetLedger.tableName}`
    );
    const totalPackets = packetsResult.rows[0].total;

    if (packetLedger.hasTreeNodeId) {
      const linkedResult = await client.query(
        `SELECT COUNT(*) as linked FROM ${packetLedger.tableName} WHERE tree_node_id IS NOT NULL`
      );
      const linkedPackets = linkedResult.rows[0].linked;

      log.info(`Packet coverage:`);
      log.ok(
        `  ${linkedPackets}/${totalPackets} packets linked to tree nodes (${(100 * linkedPackets / totalPackets).toFixed(1)}%)`
      );
    } else {
      log.warn(`Packet ledger ${packetLedger.tableName} does not expose tree_node_id; skipping packet link coverage check.`);
    }

  } finally {
    client.release();
  }
}

async function main() {
  try {
    if (args.verify) {
      await verify();
    } else {
      await backfill();
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
