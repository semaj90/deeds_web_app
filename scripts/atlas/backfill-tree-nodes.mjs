#!/usr/bin/env node

/**
 * Task 7: Backfill Tree Nodes
 * Creates the current atlas_tree_nodes hierarchy from atlas_codebase_packets.
 *
 * Contract:
 * - root nodes use node_type = 'document'
 * - leaf nodes use node_type = 'chunk'
 * - page_index_path is required and must begin with doc:
 * - tree_depth is 0 for roots and 1 for leaves in this bounded backfill
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
const envPath = `${__dirname}/../../.env`;
dotenv.config({ path: envPath });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const log = {
  info: (msg) => console.log(`[backfill-tree-nodes] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Main backfill routine
 */
async function backfillTreeNodes() {
  const client = await pool.connect();

  try {
    log.info('Creating tree node hierarchy...');

    // 1. Get all unique source_refs (files) from atlas_codebase_packets
    const filesResult = await client.query(
      'SELECT DISTINCT source_ref FROM atlas_codebase_packets WHERE source_ref IS NOT NULL ORDER BY source_ref'
    );
    const files = filesResult.rows;

    log.info(`Found ${files.length} unique files`);

    let rootsCreated = 0;
    let leafsCreated = 0;

    // 2. For each file, create root node
    for (const file of files) {
      const sourceRef = file.source_ref;
      const label = sourceRef.split(/[\\/]/).pop() || sourceRef;

      // Insert root node (using actual schema)
      const pageIndexPath = `doc:${sourceRef.replace(/[^a-zA-Z0-9]+/g, '-')}`;
      const generatedRootNodeId = randomUUID();
      const rootResult = await client.query(
        `INSERT INTO atlas_tree_nodes
          (node_id, root_id, source_ref, file_path, page_index_path, node_type, tree_depth, title, summary, metadata)
        VALUES
          ($1, $1, $2, $3, $4, 'document', 0, $5, $6, $7)
        RETURNING node_id, root_id`,
        [generatedRootNodeId, sourceRef, sourceRef, pageIndexPath, label, label, JSON.stringify({ source: 'backfill', node_kind: 'document' })]
      );

      const rootNodeId = rootResult.rows[0].node_id;
      const rootId = rootResult.rows[0].root_id;
      rootsCreated++;

      // 3. Get packets for this file
      const packetsResult = await client.query(
        'SELECT packet_key, feature_label FROM atlas_codebase_packets WHERE source_ref = $1',
        [sourceRef]
      );
      const packets = packetsResult.rows;

      // 4. Create leaf nodes for each packet
      for (const packet of packets) {
        try {
          await client.query(
            `INSERT INTO atlas_tree_nodes
              (packet_key, source_ref, file_path, page_index_path, parent_id, root_id, node_type, tree_depth, title, summary, content_preview, metadata)
            VALUES
              ($1, $2, $3, $4, $5, $6, 'chunk', 1, $7, $8, $9, $10)
            ON CONFLICT (node_id) DO NOTHING`,
            [
              packet.packet_key,
              sourceRef,
              sourceRef,
              sourceRef + '#' + (packet.packet_key || 'unknown'),
              rootNodeId,
              rootId,
              packet.feature_label || packet.packet_key,
              packet.feature_label || packet.packet_key,
              packet.packet_key,
              JSON.stringify({ packet_key: packet.packet_key, node_kind: 'chunk' })
            ]
          );
          leafsCreated++;
        } catch (err) {
          // Duplicate OK, skip
        }
      }

      if (rootsCreated % 100 === 0) {
        log.progress(`${rootsCreated} roots, ${leafsCreated} leafs...`);
      }
    }

    log.ok(`Complete: ${rootsCreated} roots, ${leafsCreated} leafs`);

    // Verify
    const verifyResult = await client.query(
      'SELECT COUNT(*) as count FROM atlas_tree_nodes WHERE node_type = $1',
      ['document']
    );
    const documentNodes = verifyResult.rows[0].count;

    const verifyLeafResult = await client.query(
      'SELECT COUNT(*) as count FROM atlas_tree_nodes WHERE node_type = $1',
      ['chunk']
    );
    const leafNodes = verifyLeafResult.rows[0].count;

    log.info(`Verification: ${documentNodes} document nodes, ${leafNodes} chunk nodes`);

  } finally {
    client.release();
  }
}

backfillTreeNodes()
  .then(() => {
    log.ok('Tree node backfill complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
