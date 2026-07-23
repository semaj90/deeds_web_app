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

    // Get all packets with available topology data
    const packetsResult = await client.query(
      `SELECT
        p.packet_key,
        p.som_cluster,
        p.community_id,
        t.node_id as tree_node_id
      FROM atlas_codebase_packets p
      LEFT JOIN atlas_tree_nodes t ON p.packet_key = t.packet_key
      WHERE p.som_cluster IS NOT NULL
      ORDER BY p.packet_key`
    );

    const packets = packetsResult.rows;
    log.info(`Found ${packets.length} packets with SOM cluster`);

    let inserted = 0;
    let skipped = 0;

    for (const packet of packets) {
      // For now, we populate what we have from Postgres
      // x_cosine (Qdrant) requires ANN query - skip for initial backfill
      // y_graph (Neo4j) requires graph query - skip for initial backfill
      // w_authority (Karpathy) requires GPU computation - skip for initial backfill

      // We'll populate z_som (SOM cluster) from atlas_codebase_packets
      const xCosine = null; // Would come from Qdrant
      const yGraph = null;  // Would come from Neo4j
      const zSom = packet.som_cluster;
      const wAuthority = null; // Would come from Karpathy GPU

      try {
        await client.query(
          `INSERT INTO atlas_topology_index
            (packet_key, x_cosine, y_graph, z_som, w_authority, community_id, tree_node_id)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (packet_key) DO UPDATE SET
            z_som = $4,
            community_id = $6,
            tree_node_id = $7,
            updated_at = NOW()`,
          [
            packet.packet_key,
            xCosine,
            yGraph,
            zSom,
            wAuthority,
            packet.community_id,
            packet.tree_node_id
          ]
        );
        inserted++;
      } catch (err) {
        log.progress(`Skipped ${packet.packet_key}: ${err.message}`);
        skipped++;
      }

      if (inserted % 500 === 0) {
        log.progress(`${inserted} rows inserted...`);
      }
    }

    log.ok(`Inserted ${inserted} topology entries, skipped ${skipped}`);

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
