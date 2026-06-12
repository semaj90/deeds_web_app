/**
 * Neo4j Graph Signal for RRF Ranking
 *
 * Queries Neo4j for USED_CONCEPT and SIMILAR relationships,
 * returning ranked packets based on relationship weight.
 * Gracefully degrades if Neo4j is unavailable.
 */

import { z } from 'zod';
import { getNeo4jDriver } from '../neo4j-driver.js';

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

export type GraphSignalResponse = GraphSignalResult[] & { error?: string };

const GraphSignalRequestSchema = z.object({
  conceptIds: z.array(z.string()).min(1).max(20),
  topK: z.number().int().min(1).max(100).default(20),
  relationshipTypes: z.array(z.string()).optional(),
});

function createEmptyResponse(error?: string): GraphSignalResponse {
  const empty = [] as GraphSignalResponse;
  if (error) empty.error = error;
  return empty;
}

function toNumberLike(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const numeric = (value as { toNumber?: () => number }).toNumber?.();
  if (typeof numeric === 'number' && Number.isFinite(numeric)) return numeric;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isNeo4jSyntaxError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name}: ${err.message} ${(err as { code?: string }).code ?? ''}` : String(err);
  return /Neo\.ClientError\.Statement\.SyntaxError|SyntaxError|invalid input/i.test(text);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function runGraphSignalQuery(
  query: string,
  params: Record<string, unknown>,
  label: string
): Promise<GraphSignalResponse> {
  try {
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      const result = await withTimeout(session.run(query, params), 8000, `Neo4j graph signal query (${label})`);
      return result.records.map((record) => ({
        id: String(record.get('id') ?? ''),
        score: Math.max(0, Math.min(1, toNumberLike(record.get('score'), 0))),
        text: record.get('text') as string | undefined,
        paths: toNumberLike(record.get('paths'), 1),
      })) as GraphSignalResponse;
    } finally {
      void session.close().catch(() => {});
    }
  } catch (err) {
    if (isNeo4jSyntaxError(err)) {
      console.error(`Neo4j graph signal query syntax error (${label}):`, err);
      return createEmptyResponse(String(err));
    }
    console.warn(`Neo4j graph signal unavailable (${label}):`, err);
    return createEmptyResponse();
  }
}

/**
 * Check if Neo4j is available and has edges.
 * Safe to call repeatedly (driver is cached).
 */
export async function checkNeo4jHealth(): Promise<GraphSignalHealth> {
  try {
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      // Test connection: count the graph-signal edge families.
      const result = await withTimeout(
        session.run(
          'MATCH ()-[r:SUPPORTS|SIMILAR_TOPOLOGY|USED_CONCEPT]->() RETURN count(r) as edgeCount LIMIT 1'
        ),
        8000,
        'Neo4j health check'
      );

      const edgeCount = result.records[0]?.get('edgeCount')?.toNumber?.() ?? 0;

      return {
        available: true,
        connectedTo: 'neo4j',
        edgeCount,
      };
    } finally {
      void session.close().catch(() => {});
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
): Promise<GraphSignalResponse> {
  try {
    const validated = GraphSignalRequestSchema.parse(request);
    const { conceptIds, topK } = validated;
    const relationshipTypes = validated.relationshipTypes?.length
      ? validated.relationshipTypes
      : ['USED_CONCEPT', 'SUPPORTS', 'SIMILAR_TOPOLOGY'];

    if (!conceptIds?.length) {
      return createEmptyResponse();
    }

    const query = `
      MATCH (c:Concept)-[r]->(p:Packet)
      WHERE type(r) IN $relationshipTypes
        AND (
          c.id IN $conceptIds
          OR c.concept_id IN $conceptIds
          OR c.name IN $conceptIds
          OR toLower(c.name) IN $conceptIds
        )
      WITH
        p,
        count(DISTINCT c) AS paths,
        max(toFloat(coalesce(r.weight, 0.5))) AS score
      RETURN
        coalesce(p.id, p.packet_id, p.packet_key) AS id,
        coalesce(p.summary, p.title, '') AS text,
        paths,
        score
      ORDER BY score DESC
      LIMIT toInteger($topK)
    `;

    return runGraphSignalQuery(query, {
      conceptIds: conceptIds.map((value) => String(value)),
      relationshipTypes,
      topK,
    }, 'by-id');
  } catch (err) {
    if (isNeo4jSyntaxError(err)) {
      console.error('Neo4j graph signal error:', err);
      return createEmptyResponse(String(err));
    }
    console.warn('Neo4j graph signal unavailable:', err);
    return createEmptyResponse();
  }
}

/**
 * Alternative: Query by concept names (if IDs not available).
 */
export async function queryNeoJsGraphSignalByNames(
  conceptNames: string[],
  topK: number = 20
): Promise<GraphSignalResponse> {
  try {
    if (!conceptNames?.length) {
      return createEmptyResponse();
    }

    const query = `
      MATCH (c:Concept)-[r]->(p:Packet)
      WHERE type(r) IN $relationshipTypes
        AND (
          c.id IN $conceptIds
          OR c.concept_id IN $conceptIds
          OR c.name IN $conceptIds
          OR toLower(c.name) IN $conceptIds
        )
      WITH
        p,
        count(DISTINCT c) AS paths,
        max(toFloat(coalesce(r.weight, 0.5))) AS score
      RETURN
        coalesce(p.id, p.packet_id, p.packet_key) AS id,
        coalesce(p.summary, p.title, '') AS text,
        paths,
        score
      ORDER BY score DESC
      LIMIT toInteger($topK)
    `;

    return runGraphSignalQuery(query, {
      conceptIds: conceptNames.map((name) => name.toLowerCase()),
      relationshipTypes: ['USED_CONCEPT', 'SUPPORTS', 'SIMILAR_TOPOLOGY'],
      topK,
    }, 'by-name');
  } catch (err) {
    if (isNeo4jSyntaxError(err)) {
      console.error('Neo4j graph signal (by names) error:', err);
      return createEmptyResponse(String(err));
    }
    console.warn('Neo4j graph signal (by names) unavailable:', err);
    return createEmptyResponse();
  }
}

/**
 * Get stats on Neo4j graph (for debugging/monitoring).
 */
export async function getNeo4jGraphStats(): Promise<Record<string, number | string | boolean>> {
  try {
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      const result = await session.run(`
        MATCH (c:Concept) RETURN 'conceptCount' as metric, count(c) as value
        UNION ALL
        MATCH (p:Packet) RETURN 'packetCount' as metric, count(p) as value
        UNION ALL
        MATCH ()-[r:SUPPORTS]->() RETURN 'supportsEdges' as metric, count(r) as value
        UNION ALL
        MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN 'topologyEdges' as metric, count(r) as value
        UNION ALL
        MATCH ()-[r:USED_CONCEPT]->() RETURN 'usedConceptEdges' as metric, count(r) as value
      `);

      const stats: Record<string, number | string | boolean> = {
        connected: true,
      };

      for (const record of result.records) {
        const metric = record.get('metric') as string;
        const value = record.get('value');
        stats[metric] = value?.toNumber?.() ?? value ?? 0;
      }

      return stats;
    } finally {
      void session.close().catch(() => {});
    }
  } catch (err) {
    return {
      connected: false,
      error: String(err),
    };
  }
}
