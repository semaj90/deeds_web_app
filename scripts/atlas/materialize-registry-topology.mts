#!/usr/bin/env npx tsx
/**
 * Materialize Registry Topology Projection
 *
 * Joins atlas_packets with Neo4j topology and GPU cluster assignments:
 * - tree_node_id (from AST)
 * - community_id (from Neo4j graph traversal)
 * - page_rank_score (from GPU PageRank computation)
 * - som_cluster (from Self-Organizing Map)
 * - kmeans_cluster (from GPU KMeans)
 *
 * This is a derived projection, not a new source of truth.
 */

import { pool } from '$lib/server/db/client.js';

interface TopologyIdentity {
  packet_key: string;
  tree_node_id: string | null;
  community_id: number | null;
  page_rank_score: number | null;
  som_cluster: string | null;
  kmeans_cluster: number | null;
  materialization_version: number;
}

const MATERIALIZATION_VERSION = 1;

async function ensureProjectionTable(client: any): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS registry_topology_projection (
      id SERIAL PRIMARY KEY,
      packet_key TEXT NOT NULL UNIQUE,
      tree_node_id TEXT,
      community_id INT,
      page_rank_score REAL,
      som_cluster TEXT,
      kmeans_cluster INT,
      materialization_version INT DEFAULT ${MATERIALIZATION_VERSION},
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_topology_packet_key
    ON registry_topology_projection (packet_key)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_topology_community
    ON registry_topology_projection (community_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_topology_som_cluster
    ON registry_topology_projection (som_cluster)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_topology_kmeans_cluster
    ON registry_topology_projection (kmeans_cluster)
  `);
}

async function fetchTreeNodeIds(client: any, packetKey: string): Promise<string | null> {
  // Query tree_node_ids JSONB from atlas_packets or feature_implementations
  try {
    const result = await client.query(`
      SELECT
        CASE
          WHEN ap.tree_node_ids IS NOT NULL
            THEN jsonb_object_keys(ap.tree_node_ids)::TEXT
          ELSE NULL
        END as tree_node_id
      FROM atlas_packets ap
      WHERE ap.packet_key = $1
      LIMIT 1
    `, [packetKey]);

    return result.rows[0]?.tree_node_id || null;
  } catch {
    return null;
  }
}

async function fetchCommunityId(client: any, packetKey: string): Promise<number | null> {
  // Query Neo4j community_id from stored topology or metadata
  try {
    const result = await client.query(`
      SELECT community_id FROM neo4j_community_assignments
      WHERE packet_key = $1
      LIMIT 1
    `, [packetKey]).catch(() => ({ rows: [] }));

    return result.rows[0]?.community_id || null;
  } catch {
    return null;
  }
}

async function fetchPageRankScore(client: any, packetKey: string): Promise<number | null> {
  // Query cached PageRank score
  try {
    const result = await client.query(`
      SELECT score FROM pagerank_scores
      WHERE packet_key = $1
      LIMIT 1
    `, [packetKey]).catch(() => ({ rows: [] }));

    return result.rows[0]?.score || null;
  } catch {
    return null;
  }
}

async function fetchSOMCluster(client: any, packetKey: string): Promise<string | null> {
  // Query SOM cluster assignment
  try {
    const result = await client.query(`
      SELECT som_cluster FROM som_clusters
      WHERE packet_key = $1
      LIMIT 1
    `, [packetKey]).catch(() => ({ rows: [] }));

    return result.rows[0]?.som_cluster || null;
  } catch {
    return null;
  }
}

async function fetchKmeansCluster(client: any, packetKey: string): Promise<number | null> {
  // Query KMeans cluster assignment
  try {
    const result = await client.query(`
      SELECT cluster_id FROM kmeans_assignments
      WHERE packet_key = $1
      LIMIT 1
    `, [packetKey]).catch(() => ({ rows: [] }));

    return result.rows[0]?.cluster_id || null;
  } catch {
    return null;
  }
}

async function materializeProjection(client: any, limit: number = 0): Promise<{ materialized: number; errors: number }> {
  let materialized = 0;
  let errors = 0;

  // Query all packets
  const query = limit > 0
    ? `SELECT packet_key FROM atlas_packets LIMIT ${limit}`
    : 'SELECT packet_key FROM atlas_packets';

  const packets = await client.query(query);

  console.log(`📝 Materializing ${packets.rows.length} topology identities...`);

  for (const packet of packets.rows) {
    try {
      const tree_node_id = await fetchTreeNodeIds(client, packet.packet_key);
      const community_id = await fetchCommunityId(client, packet.packet_key);
      const page_rank_score = await fetchPageRankScore(client, packet.packet_key);
      const som_cluster = await fetchSOMCluster(client, packet.packet_key);
      const kmeans_cluster = await fetchKmeansCluster(client, packet.packet_key);

      // Upsert into projection table
      await client.query(`
        INSERT INTO registry_topology_projection (
          packet_key, tree_node_id, community_id,
          page_rank_score, som_cluster, kmeans_cluster,
          materialization_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (packet_key) DO UPDATE SET
          tree_node_id = EXCLUDED.tree_node_id,
          community_id = EXCLUDED.community_id,
          page_rank_score = EXCLUDED.page_rank_score,
          som_cluster = EXCLUDED.som_cluster,
          kmeans_cluster = EXCLUDED.kmeans_cluster,
          materialization_version = EXCLUDED.materialization_version,
          updated_at = NOW()
      `, [
        packet.packet_key,
        tree_node_id,
        community_id,
        page_rank_score,
        som_cluster,
        kmeans_cluster,
        MATERIALIZATION_VERSION,
      ]);

      materialized++;

      if (materialized % 1000 === 0) {
        console.log(`  ✓ ${materialized} identities materialized`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`  ⚠️  Error on ${packet.packet_key}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  return { materialized, errors };
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('🔧 Materializing Registry Topology Projection\n');

    // Ensure table exists
    await ensureProjectionTable(client);
    console.log('✅ Projection table ensured\n');

    // Materialize the projection
    const { materialized, errors } = await materializeProjection(client);

    console.log(`\n📊 Materialization Complete`);
    console.log(`  ✓ Materialized: ${materialized}`);
    console.log(`  ⚠️  Errors: ${errors}`);
    console.log(`  📦 Version: ${MATERIALIZATION_VERSION}`);

    process.exit(errors > materialized * 0.01 ? 1 : 0);
  } catch (err) {
    console.error('❌ Materialization failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
  }
}

main();
