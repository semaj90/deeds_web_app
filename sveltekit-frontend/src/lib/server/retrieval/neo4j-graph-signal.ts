/**
 * Neo4j Graph Signal for RRF Ranking
 *
 * Queries Neo4j for USED_CONCEPT and SIMILAR relationships,
 * returning ranked packets based on relationship weight.
 * Gracefully degrades if Neo4j is unavailable.
 */

import { z } from 'zod';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

export interface GraphSignalRequest {
  conceptIds: string[];
  topK?: number;
  relationshipTypes?: string[];
}

export interface GraphSignalResult {
  id: string;
  score: number;
  text?: string;
  paths?: number;
}

export interface GraphSignalHealth {
  available: boolean;
  connectedTo?: string;
  edgeCount?: number;
  error?: string;
}

const GraphSignalRequestSchema = z.object({
  conceptIds: z.array(z.string()).min(1).max(20),
  topK: z.number().int().min(1).max(100).default(20),
  relationshipTypes: z.array(z.string()).optional(),
});

/**
 * Check if Neo4j is available and has edges.
 * Safe to call repeatedly (driver is cached).
 */
export async function checkNeo4jHealth(): Promise<GraphSignalHealth> {
  try {
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      // Test connection: count SUPPORTS and SIMILAR_TOPOLOGY edges
      const result = await session.run(
        'MATCH ()-[r:SUPPORTS|SIMILAR_TOPOLOGY]->() RETURN count(r) as edgeCount LIMIT 1'
      );

      const edgeCount = result.records[0]?.get('edgeCount')?.toNumber?.() ?? 0;

      return {
        available: true,
        connectedTo: 'neo4j',
        edgeCount,
      };
    } finally {
      await session.close();
    }
  } catch (err) {
    return {
      available: false,
      error: String(err),
    };
  }
}

/**
 * Query Neo4j for graph-based ranking signal.
 *
 * Strategy: Use concepts as seeds, search via:
 * 1. Direct SUPPORTS edges from Concept → Packet (score 1.0)
 * 2. Indirect paths via SIMILAR_TOPOLOGY hops (score 0.6)
 *
 * This provides two signals:
 * - Packets directly referenced by extracted concepts
 * - Packets in the semantic neighborhood via graph topology
 *
 * Returns empty array if Neo4j is unavailable (graceful degradation).
 */
export async function queryNeoJsGraphSignal(
  request: GraphSignalRequest
): Promise<GraphSignalResult[]> {
  try {
    const validated = GraphSignalRequestSchema.parse(request);
    const { conceptIds, topK } = validated;

    if (!conceptIds?.length) return [];

    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      // Two-part query:
      // 1. Direct SUPPORTS edges from concept seeds (score 1.0)
      // 2. 1-2 hop SIMILAR_TOPOLOGY neighbors of directly-supported packets (score 0.6)
      const query = `
        MATCH (c:Concept)
        WHERE c.id IN $conceptIds
        CALL {
          WITH c
          OPTIONAL MATCH (c)<-[r:SUPPORTS]-(p:Packet)
          RETURN p, 1.0 as directScore, 'direct' as pathType

          UNION

          WITH c
          OPTIONAL MATCH (c)<-[:SUPPORTS]-(p1:Packet)
          WITH c, p1 WHERE p1 IS NOT NULL
          OPTIONAL MATCH (p1)-[r:SIMILAR_TOPOLOGY*1..2]-(p2)
          WHERE p2 <> p1
          RETURN p2 as p, 0.6 as directScore, 'topology' as pathType
        }
        WHERE p IS NOT NULL
        RETURN
          p.id as id,
          MAX(directScore) as score,
          COALESCE(p.summary, '')::text as text,
          COUNT(DISTINCT c) as pathCount
        ORDER BY score DESC
        LIMIT $topK
      `;

      const result = await session.run(query, {
        conceptIds,
        topK,
      });

      return result.records.map((record) => ({
        id: record.get('id') as string,
        score: Math.min(1.0, Math.max(0.0, record.get('score') as number)), // Clamp to [0, 1]
        text: record.get('text') as string | undefined,
        paths: record.get('pathCount')?.toNumber?.() ?? 1,
      }));
    } finally {
      await session.close();
    }
  } catch (err) {
    // Graceful degradation: log error, return empty
    console.error('Neo4j graph signal error:', err);
    return [];
  }
}

/**
 * Alternative: Query by concept names (if IDs not available).
 */
export async function queryNeoJsGraphSignalByNames(
  conceptNames: string[],
  topK: number = 20
): Promise<GraphSignalResult[]> {
  try {
    if (!conceptNames?.length) return [];

    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      const query = `
        MATCH (c:Concept)
        WHERE toLower(c.name) IN $conceptNames
        CALL {
          WITH c
          OPTIONAL MATCH (c)<-[r:SUPPORTS]-(p:Packet)
          RETURN p, 1.0 as directScore, 'direct' as pathType

          UNION

          WITH c
          OPTIONAL MATCH (c)<-[:SUPPORTS]-(p1:Packet)
          WITH c, p1 WHERE p1 IS NOT NULL
          OPTIONAL MATCH (p1)-[r:SIMILAR_TOPOLOGY*1..2]-(p2)
          WHERE p2 <> p1
          RETURN p2 as p, 0.6 as directScore, 'topology' as pathType
        }
        WHERE p IS NOT NULL
        RETURN
          p.id as id,
          MAX(directScore) as score,
          COALESCE(p.summary, '')::text as text,
          COUNT(DISTINCT c) as pathCount
        ORDER BY score DESC
        LIMIT $topK
      `;

      const result = await session.run(query, {
        conceptNames: conceptNames.map((name) => name.toLowerCase()),
        topK,
      });

      return result.records.map((record) => ({
        id: record.get('id') as string,
        score: Math.min(1.0, Math.max(0.0, record.get('score') as number)),
        text: record.get('text') as string | undefined,
        paths: record.get('pathCount')?.toNumber?.() ?? 1,
      }));
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error('Neo4j graph signal (by names) error:', err);
    return [];
  }
}

/**
 * Get stats on Neo4j graph (for debugging/monitoring).
 */
export async function getNeo4jGraphStats(): Promise<Record<string, number | string>> {
  try {
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      const result = await session.run(`
        MATCH (c:Concept) RETURN count(c) as conceptCount
        UNION ALL
        MATCH (p:Packet) RETURN count(p) as packetCount
        UNION ALL
        MATCH ()-[r:SUPPORTS]->() RETURN count(r) as supportsEdges
        UNION ALL
        MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r) as topologyEdges
      `);

      const stats: Record<string, number | string> = {
        connected: true,
        nodeTypes: 0,
      };

      for (const record of result.records) {
        const key = Object.keys(record.toObject())[0];
        const value = record.get(key);
        stats[key] = value?.toNumber?.() ?? value ?? 0;
      }

      return stats;
    } finally {
      await session.close();
    }
  } catch (err) {
    return {
      connected: false,
      error: String(err),
    };
  }
}
