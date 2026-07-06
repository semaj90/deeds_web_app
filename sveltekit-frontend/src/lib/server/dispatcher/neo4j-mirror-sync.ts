/**
 * Neo4j Mirror Sync Service
 * Creates/updates :CanonicalPacket nodes and topology edges
 * Manages BELONGS_TO_FEATURE, BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY relationships
 */

import type { Session } from 'neo4j-driver';

interface Neo4jSyncPacket {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  summary?: string;
  confidence?: number;
  identity_lane?: string;
  directory_path?: string;
  som_cluster_id?: number;
}

interface Neo4jSyncResult {
  nodes_created: number;
  nodes_updated: number;
  edges_created: number;
  edges_failed: number;
  edge_types: string[];
  errors: string[];
  duration_ms: number;
}

/**
 * Sync canonical packets to Neo4j as :CanonicalPacket nodes
 * Creates edges: BELONGS_TO_FEATURE, BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY
 *
 * @param neo4jSession — Neo4j session from driver
 * @param packets — Canonical packets to sync
 * @param edgeTypes — Edge types to create (subset of the 3 above)
 * @returns Sync result with counts and errors
 */
export async function syncPacketsToNeo4j(
  neo4jSession: Session,
  packets: Neo4jSyncPacket[],
  edgeTypes: string[] = ['BELONGS_TO_FEATURE', 'BELONGS_TO_CLUSTER', 'SIMILAR_TOPOLOGY']
): Promise<Neo4jSyncResult> {
  const startMs = Date.now();
  const errors: string[] = [];
  let nodesCreated = 0;
  let nodesUpdated = 0;
  let edgesCreated = 0;
  let edgesFailed = 0;

  try {
    // Step 1: Merge :CanonicalPacket nodes in batch
    const nodeResult = await neo4jSession.run(
      `
      UNWIND $packets AS pkt
      MERGE (p:CanonicalPacket {packet_key: pkt.packet_key})
      ON CREATE SET
        p.source_ref = pkt.source_ref,
        p.feature_id = pkt.feature_id,
        p.summary = pkt.summary,
        p.confidence = pkt.confidence,
        p.identity_lane = pkt.identity_lane,
        p.directory_path = pkt.directory_path,
        p.som_cluster_id = pkt.som_cluster_id,
        p.created_at = datetime(),
        p.updated_at = datetime()
      ON MATCH SET
        p.summary = pkt.summary,
        p.confidence = pkt.confidence,
        p.identity_lane = pkt.identity_lane,
        p.som_cluster_id = pkt.som_cluster_id,
        p.updated_at = datetime()
      RETURN count(*) as total, sum(CASE WHEN p.created_at = datetime() THEN 1 ELSE 0 END) as created
      `,
      {
        packets: packets.map((p) => ({
          packet_key: p.packet_key,
          source_ref: p.source_ref,
          feature_id: p.feature_id,
          summary: p.summary || '',
          confidence: p.confidence ?? 0.95,
          identity_lane: p.identity_lane || 'canonical',
          directory_path: p.directory_path || '',
          som_cluster_id: p.som_cluster_id ?? null,
        })),
      }
    );

    const nodeStats = nodeResult.records[0]?.toObject();
    nodesCreated = nodeStats?.created ?? 0;
    nodesUpdated = (nodeStats?.total ?? 0) - nodesCreated;
    console.log(
      `[neo4j-mirror-sync] Merged ${nodesCreated + nodesUpdated} nodes (created: ${nodesCreated}, updated: ${nodesUpdated})`
    );

    // Step 2: Create edges if requested
    if (edgeTypes.includes('BELONGS_TO_FEATURE')) {
      try {
        const featureEdgeResult = await neo4jSession.run(
          `
          UNWIND $packets AS pkt
          MATCH (p:CanonicalPacket {packet_key: pkt.packet_key})
          MERGE (f:Feature {feature_id: pkt.feature_id})
          MERGE (p)-[r:BELONGS_TO_FEATURE]->(f)
          ON CREATE SET r.created_at = datetime()
          RETURN count(r) as edge_count
          `,
          {
            packets: packets.map((p) => ({
              packet_key: p.packet_key,
              feature_id: p.feature_id,
            })),
          }
        );
        const edgeCount = featureEdgeResult.records[0]?.get('edge_count') ?? 0;
        edgesCreated += edgeCount;
        console.log(`[neo4j-mirror-sync] Created BELONGS_TO_FEATURE edges: ${edgeCount}`);
      } catch (err) {
        const errMsg = `BELONGS_TO_FEATURE edge creation failed: ${String(err)}`;
        errors.push(errMsg);
        edgesFailed += 1;
        console.error(`[neo4j-mirror-sync] ${errMsg}`);
      }
    }

    if (edgeTypes.includes('BELONGS_TO_CLUSTER')) {
      try {
        // For now, use directory as cluster proxy (real clustering is SOM-based)
        const clusterEdgeResult = await neo4jSession.run(
          `
          UNWIND $packets AS pkt
          MATCH (p:CanonicalPacket {packet_key: pkt.packet_key})
          MERGE (c:Cluster {cluster_id: pkt.directory_path})
          MERGE (p)-[r:BELONGS_TO_CLUSTER]->(c)
          ON CREATE SET r.created_at = datetime()
          RETURN count(r) as edge_count
          `,
          {
            packets: packets.map((p) => ({
              packet_key: p.packet_key,
              directory_path: p.directory_path || 'root',
            })),
          }
        );
        const edgeCount = clusterEdgeResult.records[0]?.get('edge_count') ?? 0;
        edgesCreated += edgeCount;
        console.log(`[neo4j-mirror-sync] Created BELONGS_TO_CLUSTER edges: ${edgeCount}`);
      } catch (err) {
        const errMsg = `BELONGS_TO_CLUSTER edge creation failed: ${String(err)}`;
        errors.push(errMsg);
        edgesFailed += 1;
        console.error(`[neo4j-mirror-sync] ${errMsg}`);
      }
    }

    if (edgeTypes.includes('SIMILAR_TOPOLOGY')) {
      try {
        // Connect packets in same SOM cluster (spatial topology neighbors)
        // Fallback to feature_id if SOM cluster not available
        const topoEdgeResult = await neo4jSession.run(
          `
          UNWIND $packets AS pkt1
          MATCH (p1:CanonicalPacket {packet_key: pkt1.packet_key})
          UNWIND $packets AS pkt2
          MATCH (p2:CanonicalPacket {packet_key: pkt2.packet_key})
          WHERE p1.packet_key < p2.packet_key AND (
            (pkt1.som_cluster_id IS NOT NULL AND pkt1.som_cluster_id = pkt2.som_cluster_id) OR
            (pkt1.som_cluster_id IS NULL AND p1.feature_id = p2.feature_id)
          )
          MERGE (p1)-[r:SIMILAR_TOPOLOGY]->(p2)
          ON CREATE SET r.created_at = datetime(), r.topology_basis = CASE WHEN pkt1.som_cluster_id IS NOT NULL THEN 'som_cluster' ELSE 'feature_id' END
          RETURN count(r) as edge_count
          `,
          {
            packets: packets.map((p) => ({
              packet_key: p.packet_key,
              feature_id: p.feature_id,
              som_cluster_id: p.som_cluster_id ?? null,
            })),
          }
        );
        const edgeCount = topoEdgeResult.records[0]?.get('edge_count') ?? 0;
        edgesCreated += edgeCount;
        console.log(`[neo4j-mirror-sync] Created SIMILAR_TOPOLOGY edges: ${edgeCount}`);
      } catch (err) {
        const errMsg = `SIMILAR_TOPOLOGY edge creation failed: ${String(err)}`;
        errors.push(errMsg);
        edgesFailed += 1;
        console.error(`[neo4j-mirror-sync] ${errMsg}`);
      }
    }
  } catch (err) {
    const errMsg = `Neo4j sync failed: ${String(err)}`;
    errors.push(errMsg);
    console.error(`[neo4j-mirror-sync] ${errMsg}`);
  } finally {
    await neo4jSession.close();
  }

  const durationMs = Date.now() - startMs;
  return {
    nodes_created: nodesCreated,
    nodes_updated: nodesUpdated,
    edges_created: edgesCreated,
    edges_failed: edgesFailed,
    edge_types: edgeTypes,
    errors,
    duration_ms: durationMs,
  };
}

/**
 * Validate Neo4j connectivity and schema
 */
export async function validateNeo4jHealth(neo4jSession: Session): Promise<{
  healthy: boolean;
  canonical_packet_count: number;
  error?: string;
}> {
  try {
    const result = await neo4jSession.run('MATCH (p:CanonicalPacket) RETURN count(p) as count');
    const count = result.records[0]?.get('count') ?? 0;

    await neo4jSession.close();
    return {
      healthy: true,
      canonical_packet_count: count,
    };
  } catch (err) {
    return {
      healthy: false,
      canonical_packet_count: 0,
      error: String(err),
    };
  }
}
