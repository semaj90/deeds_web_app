#!/usr/bin/env node

/**
 * Task 8: Backfill Topology Index
 * Creates 4D routing coordinates for each packet
 * Reads from: Qdrant (x_cosine), Neo4j (y_graph), SOM (z_som), Karpathy (w_authority)
 *
 * Created: June 15, 2026
 * Part of P1 Implementation
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
const envPath = `${__dirname}/../../.env`;
dotenv.config({ path: envPath });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const PACKET_TABLE_CANDIDATES = ['atlas_packets', 'atlas_codebase_packets'];

const log = {
  info: (msg) => console.log(`[backfill-topology-index] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Main backfill routine
 */
async function backfillTopologyIndex() {
  const client = await pool.connect();

  try {
    log.info('Backfilling topology index with 4D coordinates...');

    const packetTableRes = await client.query(
      `
        SELECT table_name
        FROM unnest($1::text[]) AS t(table_name)
        WHERE EXISTS (
          SELECT 1
          FROM information_schema.tables i
          WHERE i.table_schema = 'public'
            AND i.table_name = t.table_name
        )
        ORDER BY CASE table_name
          WHEN 'atlas_packets' THEN 0
          WHEN 'atlas_codebase_packets' THEN 1
          ELSE 2
        END
        LIMIT 1
      `,
      [PACKET_TABLE_CANDIDATES]
    );

    const packetTable = packetTableRes.rows[0]?.table_name;
    if (!packetTable) {
      throw new Error(`No packet ledger found. Expected one of: ${PACKET_TABLE_CANDIDATES.join(', ')}`);
    }

    log.info(`Using packet ledger: ${packetTable}`);

    // Get all packets with available topology data
    const packetsResult = await client.query(
      `SELECT
        p.packet_key,
        p.som_cluster,
        p.community_id,
        p.tree_node_id AS packet_tree_node_id,
        t.node_id AS canonical_tree_node_id
      FROM ${packetTable} p
      LEFT JOIN atlas_tree_nodes t
        ON p.packet_key = t.packet_key
       AND t.node_type = 'chunk'
       AND t.ledger_type = 'canonical'
      WHERE p.som_cluster IS NOT NULL
      ORDER BY p.packet_key`
    );

    const packets = packetsResult.rows;
    log.info(`Found ${packets.length} packets with SOM cluster`);

    let affected = 0;
    let skipped = 0;

    for (const packet of packets) {
      // For now, we populate what we have from Postgres
      // x_cosine (Qdrant) requires ANN query - skip for initial backfill
      // y_graph (Neo4j) requires graph query - skip for initial backfill
      // w_authority (Karpathy) requires GPU computation - skip for initial backfill

      // We'll populate z_som (SOM cluster) from atlas_codebase_packets
      const xCosine = null; // Would come from Qdrant
      const yGraph = null;  // Would come from Neo4j
      // atlas_packets.som_cluster is not reliably numeric — some rows carry a
      // literal sentinel string ('som20x20', 4,000 packets live) instead of a
      // cluster index. z_som is `integer`; writing the sentinel through
      // unguarded aborted the ENTIRE row's INSERT (including the otherwise-
      // valid tree_node_id/community_id), silently failing every run for those
      // packets with no signal beyond a scrolling "skipped" log line. Guard to
      // NULL instead so tree linkage isn't held hostage by an unrelated column.
      const zSom = /^-?\d+$/.test(String(packet.som_cluster ?? '')) ? Number(packet.som_cluster) : null;
      const wAuthority = null; // Would come from Karpathy GPU
      const treeNodeId = packet.packet_tree_node_id ?? packet.canonical_tree_node_id ?? null;

      try {
        const result = await client.query(
          `INSERT INTO atlas_topology_index
            (packet_key, x_cosine, y_graph, z_som, w_authority, community_id, tree_node_id)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (packet_key) DO UPDATE SET
            -- COALESCE: a null EXCLUDED.z_som means the source som_cluster was
            -- non-numeric garbage this run, not "clear the field" — preserve
            -- whatever is already correctly stored rather than regressing it.
            z_som = COALESCE(EXCLUDED.z_som, atlas_topology_index.z_som),
            community_id = EXCLUDED.community_id,
            tree_node_id = EXCLUDED.tree_node_id,
            updated_at = NOW()
          WHERE atlas_topology_index.z_som IS DISTINCT FROM COALESCE(EXCLUDED.z_som, atlas_topology_index.z_som)
             OR atlas_topology_index.community_id IS DISTINCT FROM EXCLUDED.community_id
             OR atlas_topology_index.tree_node_id IS DISTINCT FROM EXCLUDED.tree_node_id`,
          [
            packet.packet_key,
            xCosine,
            yGraph,
            zSom,
            wAuthority,
            packet.community_id,
            treeNodeId
          ]
        );
        if (result.rowCount > 0) {
          affected++;
        }
      } catch (err) {
        log.progress(`Skipped ${packet.packet_key}: ${err.message}`);
        skipped++;
      }

      if (affected > 0 && affected % 500 === 0) {
        log.progress(`${affected} rows inserted or updated...`);
      }
    }

    log.ok(`Affected ${affected} topology entries, skipped ${skipped}`);

    // Verify
    const verifyResult = await client.query(
      'SELECT COUNT(*) as count FROM atlas_topology_index'
    );
    const count = verifyResult.rows[0].count;
    log.info(`Verification: ${count} total topology entries`);

    // Show stats
    const statsResult = await client.query(
      `SELECT
        COUNT(*) as total,
        COUNT(z_som) as with_som,
        COUNT(x_cosine) as with_qdrant,
        COUNT(y_graph) as with_neo4j,
        COUNT(w_authority) as with_authority
      FROM atlas_topology_index`
    );
    const stats = statsResult.rows[0];
    log.info(`4D Stats: total=${stats.total}, SOM=${stats.with_som}, Qdrant=${stats.with_qdrant}, Neo4j=${stats.with_neo4j}, Authority=${stats.with_authority}`);

  } finally {
    client.release();
  }
}

backfillTopologyIndex()
  .then(() => {
    log.ok('Topology index backfill complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
