/**
 * LangGraph Worker Clients — Bridge to external services
 *
 * Provides typed clients for Postgres, Redis, Qdrant, Neo4j.
 * Follows canonical packet truth flow: Postgres is truth, others are mirrors/caches.
 */

import type { Pool } from 'pg';
import type Redis from 'ioredis';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { Driver, Session } from 'neo4j-driver';

/**
 * Packet metadata row from Postgres atlas_packets table
 */
export interface PacketMetadata {
  packet_key: string;
  source_ref: string;
  file_path: string;
  feature_id: string;
  feature_label: string;
  summary?: string;
  embedding?: {
    model: string;
    dim: number;
    qdrant_point_id?: string | number;
  };
  som_cluster?: number;
  topology_label?: string;
  community_id?: string;
  ganValidated: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Trace event checkpoint
 */
export interface TraceEvent {
  trace_id: string;
  packet_key: string;
  step: number;
  node: string;
  duration_ms: number;
  status: 'success' | 'error' | 'skipped';
  metadata?: Record<string, unknown>;
  created_at: string;
}

/**
 * Cached retrieval result from BitFrost
 */
export interface BitFrostCachedResult {
  retrieval_results: unknown[];
  rag_candidates: unknown[];
  kag_neighbors: unknown[];
  timestamp: string;
  ttl_seconds: number;
}

/**
 * Qdrant search result
 */
export interface QdrantSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

/**
 * Neo4j KAG neighbor
 */
export interface KagNeighbor {
  id: string;
  type: string;
  label: string;
  relationship: string;
  distance: number;
}

/**
 * PostgreSQL client wrapper — reads from atlas_packets, trace_events
 */
export class PostgresClient {
  constructor(private pool: Pool) {}

  async loadTraceState(traceId: string): Promise<TraceEvent[]> {
    const result = await this.pool.query(
      `SELECT trace_id, packet_key, step, node, duration_ms, status, metadata, created_at
       FROM trace_events
       WHERE trace_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [traceId]
    );
    return result.rows;
  }

  async loadPacketMetadata(
    packetKey: string,
    sourceRef: string,
    featureId: string
  ): Promise<PacketMetadata | null> {
    const result = await this.pool.query(
      `SELECT packet_key, source_ref, file_path, feature_id, feature_label, summary,
              embedding, som_cluster, topology_label, community_id, ganValidated,
              created_at, updated_at
       FROM atlas_packets
       WHERE packet_key = $1 AND source_ref = $2 AND feature_id = $3
       LIMIT 1`,
      [packetKey, sourceRef, featureId]
    );
    return result.rows[0] ?? null;
  }

  async writeTraceEvent(event: Omit<TraceEvent, 'created_at'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO trace_events (trace_id, packet_key, step, node, duration_ms, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.trace_id,
        event.packet_key,
        event.step,
        event.node,
        event.duration_ms,
        event.status,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );
  }

  async writeSynthesis(
    traceId: string,
    packetKey: string,
    synthesis: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE atlas_packets
       SET synthesis = $1, updated_at = NOW()
       WHERE packet_key = $2`,
      [synthesis, packetKey]
    );
  }
}

/**
 * Redis/Bifrost client — L1 exact-match, L2 semantic cache, packet hot memory
 */
export class BitFrostClient {
  constructor(private redis: Redis) {}

  async getPacketCache(packetKey: string): Promise<BitFrostCachedResult | null> {
    const cached = await this.redis.get(`ff1:packet:${packetKey}`);
    if (!cached) return null;
    try {
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }

  async getFeatureCache(featureId: string): Promise<BitFrostCachedResult | null> {
    const cached = await this.redis.get(`ff1:feature:${featureId}`);
    if (!cached) return null;
    try {
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }

  async getTraceCache(traceId: string): Promise<unknown | null> {
    const cached = await this.redis.get(`ff1:trace:${traceId}`);
    if (!cached) return null;
    try {
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }

  async setPacketCache(
    packetKey: string,
    result: BitFrostCachedResult,
    ttl: number = 300
  ): Promise<void> {
    await this.redis.setex(
      `ff1:packet:${packetKey}`,
      ttl,
      JSON.stringify(result)
    );
  }

  async invalidatePacket(packetKey: string, sourceRef: string, featureId: string): Promise<void> {
    await this.redis.del(
      `ff1:packet:${packetKey}`,
      `ff1:trace:*`,
      `ff1:source:${sourceRef}`,
      `ff1:feature:${featureId}`
    );
  }
}

/**
 * Qdrant client — semantic vector search, codebase_chunks_768 collection
 */
export class QdrantSearchClient {
  constructor(private qdrant: QdrantClient) {}

  async searchRAG(
    queryEmbedding: number[],
    limit: number = 10,
    filter?: Record<string, unknown>
  ): Promise<QdrantSearchResult[]> {
    const response = await this.qdrant.query('codebase_chunks_768', {
      query: queryEmbedding,
      with_payload: true,
      limit,
      ...(filter && { filter }),
    });

    return response.points.map((point: any) => ({
      id: point.id,
      score: point.score,
      payload: point.payload || {},
    }));
  }

  async fetchPoint(pointId: string | number): Promise<QdrantSearchResult | null> {
    try {
      const response = await this.qdrant.retrieve('codebase_chunks_768', {
        ids: [pointId],
        with_payload: true,
      });
      if (response.length === 0) return null;
      const point = response[0];
      return {
        id: String(point.id),
        score: 1.0,
        payload: point.payload || {},
      };
    } catch {
      return null;
    }
  }
}

/**
 * Neo4j KAG client — graph traversal, USED_CONCEPT edges, bounded k-hops
 */
export class Neo4jKagClient {
  constructor(private driver: Driver) {}

  async traverseTopology(packetKey: string, maxDepth: number = 2): Promise<KagNeighbor[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH path = (p:Packet {packet_key: $pk})-[r:USED_CONCEPT|SIMILAR_TOPOLOGY*1..${maxDepth}]->(n:Packet)
         RETURN DISTINCT n.packet_key as id, n.type as type, n.label as label,
                last(relationships(path)).type as relationship,
                length(path) as distance
         ORDER BY distance ASC
         LIMIT 20`,
        { pk: packetKey }
      );

      return result.records.map((record) => ({
        id: record.get('id'),
        type: record.get('type') || 'Packet',
        label: record.get('label') || '',
        relationship: record.get('relationship') || 'USED_CONCEPT',
        distance: record.get('distance'),
      }));
    } finally {
      await session.close();
    }
  }

  async getDirectoryContext(directoryPath: string): Promise<KagNeighbor[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (d:Directory {path: $dir})-[r:CONTAINS]->(p:Packet)
         RETURN p.packet_key as id, p.type as type, p.label as label,
                r.type as relationship, 1 as distance
         LIMIT 50`,
        { dir: directoryPath }
      );

      return result.records.map((record) => ({
        id: record.get('id'),
        type: record.get('type') || 'Packet',
        label: record.get('label') || '',
        relationship: record.get('relationship') || 'CONTAINS',
        distance: record.get('distance'),
      }));
    } finally {
      await session.close();
    }
  }
}

/**
 * Factory to get singleton clients
 */
let postgresClient: PostgresClient | null = null;
let bitfrostClient: BitFrostClient | null = null;
let qdrantClient: QdrantSearchClient | null = null;
let neo4jClient: Neo4jKagClient | null = null;

export function getPostgresClient(pool: Pool): PostgresClient {
  if (!postgresClient) {
    postgresClient = new PostgresClient(pool);
  }
  return postgresClient;
}

export function getBitFrostClient(redis: Redis): BitFrostClient {
  if (!bitfrostClient) {
    bitfrostClient = new BitFrostClient(redis);
  }
  return bitfrostClient;
}

export function getQdrantClient(qdrant: QdrantClient): QdrantSearchClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantSearchClient(qdrant);
  }
  return qdrantClient;
}

export function getNeo4jClient(driver: Driver): Neo4jKagClient {
  if (!neo4jClient) {
    neo4jClient = new Neo4jKagClient(driver);
  }
  return neo4jClient;
}
