/**
 * Phase 3, Step 14: KAG/Graph Expansion
 *
 * Knowledge-Augmented Generation: expand top-K retrieved packets
 * with Neo4j neighbors using semantic relationships.
 *
 * Relationships traversed:
 * - USED_BY / USES (dependency chain)
 * - IMPORTS / EXPORTED_BY (module boundaries)
 * - SIMILAR_TOPOLOGY (graph-derived clusters)
 *
 * K-hop expansion (default K=1, max 5 neighbors per packet)
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import { ENV } from '$lib/server/env.server.js';

export interface GraphNeighbor {
  node_id: string;
  node_type: string;
  relationship: string;
  distance: number;
  score: number; // Authority score for reranking
}

export interface KAGExpansionRequest {
  packet_keys: string[];
  max_neighbors_per_packet: number; // Default 5
  max_hops: number; // Default 1
  relationship_types?: string[]; // Filter relationships
}

export interface KAGExpansionResult {
  expansions: Map<string, GraphNeighbor[]>;
  timing_ms: number;
}

export class KAGExpander {
  private driver: Driver;

  constructor(neo4jUri: string = ENV.NEO4J_URI, auth?: { username: string; password: string }) {
    const credentials = auth ?? (ENV.NEO4J_PASSWORD
      ? { username: ENV.NEO4J_USER, password: ENV.NEO4J_PASSWORD }
      : undefined);
    if (!credentials?.password) throw new Error('NEO4J_PASSWORD_REQUIRED');

    this.driver = neo4j.driver(neo4jUri, neo4j.auth.basic(credentials.username, credentials.password));
  }

  /**
   * Expand retrieved packets with graph neighbors
   */
  async expand(request: KAGExpansionRequest): Promise<KAGExpansionResult> {
    const startTime = Date.now();
    const expansions = new Map<string, GraphNeighbor[]>();

    const session = this.driver.session();

    try {
      for (const packetKey of request.packet_keys) {
        const neighbors = await this.findNeighbors(session, packetKey, request);
        expansions.set(packetKey, neighbors);
      }

      return {
        expansions,
        timing_ms: Date.now() - startTime,
      };
    } catch (err) {
      console.error('[KAGExpander] Error:', err);
      return {
        expansions,
        timing_ms: Date.now() - startTime,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Find K-hop neighbors for a single packet
   */
  private async findNeighbors(session: Session, packetKey: string, request: KAGExpansionRequest): Promise<GraphNeighbor[]> {
    const relationshipFilter = request.relationship_types?.length
      ? `[r:${request.relationship_types.join('|')}]`
      : '[r]';

    const query = `
      MATCH (p:Packet {packet_key: $packetKey})
      MATCH path = (p)${relationshipFilter}*1..${request.max_hops}(neighbor)
      WHERE neighbor:Packet OR neighbor:Feature OR neighbor:Module
      RETURN
        neighbor.packet_key as node_id,
        labels(neighbor)[0] as node_type,
        type(last(relationships(path))) as relationship,
        length(path) as distance,
        neighbor.authority_score as score
      ORDER BY distance ASC, score DESC
      LIMIT $maxNeighbors
    `;

    try {
      const result = await session.run(query, {
        packetKey,
        maxNeighbors: request.max_neighbors_per_packet,
      });

      return result.records.map((record) => ({
        node_id: record.get('node_id') as string,
        node_type: record.get('node_type') as string,
        relationship: record.get('relationship') as string,
        distance: record.get('distance') as number,
        score: (record.get('score') as number) || 0,
      }));
    } catch (err) {
      console.error(`[KAGExpander] Error expanding ${packetKey}:`, err);
      return [];
    }
  }

  /**
   * Find SIMILAR_TOPOLOGY neighbors (SOM clustering)
   */
  async expandBySOM(packetKey: string, maxNeighbors: number = 5): Promise<GraphNeighbor[]> {
    const session = this.driver.session();

    try {
      const query = `
        MATCH (p:Packet {packet_key: $packetKey})
        MATCH (p)-[:HAS_SOM_POSITION]->(cell:SOMCell)
        MATCH (cell)-[:CONTAINS]-(neighbor:Packet)
        WHERE neighbor.packet_key <> $packetKey
        RETURN
          neighbor.packet_key as node_id,
          'Packet' as node_type,
          'SOM_NEIGHBOR' as relationship,
          1 as distance,
          neighbor.authority_score as score
        ORDER BY score DESC
        LIMIT $maxNeighbors
      `;

      const result = await session.run(query, {
        packetKey,
        maxNeighbors,
      });

      return result.records.map((record) => ({
        node_id: record.get('node_id') as string,
        node_type: record.get('node_type') as string,
        relationship: record.get('relationship') as string,
        distance: record.get('distance') as number,
        score: (record.get('score') as number) || 0,
      }));
    } catch (err) {
      console.error(`[KAGExpander] Error expanding SOM for ${packetKey}:`, err);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Check Neo4j connectivity
   */
  async healthCheck(): Promise<boolean> {
    const session = this.driver.session();

    try {
      const result = await session.run('RETURN 1');
      return result.records.length > 0;
    } catch (err) {
      console.error('[KAGExpander] Health check failed:', err);
      return false;
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

/**
 * Singleton instance
 */
let expander: KAGExpander | null = null;

export function getKAGExpander(neo4jUri?: string): KAGExpander {
  if (!expander) {
    expander = new KAGExpander(neo4jUri);
  }
  return expander;
}

export async function closeKAGExpander(): Promise<void> {
  if (expander) {
    await expander.close();
    expander = null;
  }
}
