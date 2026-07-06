/**
 * Canonical ID Hierarchy — Single Source of Truth for Identity
 *
 * Every level gets a UUID/ULID, stored consistently across all stores:
 * Postgres (truth) → Qdrant (mirror) → Neo4j (mirror) → Redis (cache)
 *
 * Hierarchy (top-down):
 *   repository_id (repo metadata)
 *     ↓
 *   directory_id (src/lib/server/auth/)
 *     ↓
 *   file_id (src/lib/server/auth.ts)
 *     ↓
 *   module_id (Session handler module)
 *     ↓
 *   symbol_id (validateSession function)
 *     ↓
 *   feature_id (auth:session-validation feature)
 *     ↓
 *   packet_key (ACE packet canonical ID)
 *     ↓
 *   chunk_id (codebase_chunk_index row)
 *
 * All IDs are UUIDs except:
 *   - packet_key: string identifier (ace:packet:{domain}:{seq})
 *   - chunk_id: serial or UUID (depends on table design)
 */

import { randomUUID } from 'node:crypto';

/**
 * Canonical ID set — every packet carries all parent IDs
 * Enables efficient filtering, grouping, and traversal at any level
 */
export interface CanonicalIDHierarchy {
  repository_id: string; // UUID: code repository
  directory_id: string; // UUID: src/lib/server/
  file_id: string; // UUID: auth.ts
  module_id: string; // UUID: module grouping (Session handler)
  symbol_id: string; // UUID: validateSession
  feature_id: string; // STRING: auth:session-validation
  packet_key: string; // STRING: ace:packet:auth:001
  chunk_id: string; // UUID/SERIAL: codebase_chunk_index row
}

/**
 * Store-specific envelope — same IDs, wrapped per store
 */
export interface PostgresEnvelope extends CanonicalIDHierarchy {
  // Postgres extends with columns
  created_at: Date;
  updated_at: Date;
  source_ref: string; // src/lib/server/auth.ts (derived from file_id)
  packet_type: 'file' | 'module' | 'function' | 'class' | 'route';
}

export interface QdrantPayload extends CanonicalIDHierarchy {
  // Qdrant payload mirrors IDs
  source_ref: string;
  packet_type: string;
  // Multi-vector metadata
  content_embedding: number[]; // 384-dim (primary)
  summary_embedding: number[]; // 384-dim (concept-level)
  title_embedding: number[]; // 384-dim (feature lookup)
  signature_embedding: number[]; // 384-dim (function similarity)
  feature_embedding?: number[]; // 384-dim (recommendation, optional)
  latent64?: number[]; // 64-dim (clustering only, not retrieval)
}

export interface Neo4jNode extends CanonicalIDHierarchy {
  // Neo4j mirrors IDs + adds relationships
  labels: string[];
  properties: Record<string, unknown>;
}

export interface RedisKey {
  // Redis uses IDs for cache keys
  // Patterns:
  //   packet:{packet_key}
  //   file:{file_id}:{type}
  //   feature:{feature_id}
  //   symbol:{symbol_id}
  //   chunk:{chunk_id}
  pattern: string;
  ttl: number;
}

/**
 * Generate UUIDs for each level
 * Call once during ingestion, store in all mirrors
 */
export function generateIDHierarchy(sourceRef: string): CanonicalIDHierarchy {
  // Parse source_ref to infer hierarchy
  // src/lib/server/auth.ts → directory/file/module context
  const parts = sourceRef.split('/');
  const fileName = parts[parts.length - 1];
  const dirPath = parts.slice(0, -1).join('/');

  return {
    repository_id: randomUUID(),
    directory_id: randomUUID(),
    file_id: randomUUID(),
    module_id: randomUUID(),
    symbol_id: randomUUID(),
    feature_id: deriveFeatureID(sourceRef, fileName),
    packet_key: derivePacketKey(sourceRef),
    chunk_id: randomUUID()
  };
}

function deriveFeatureID(sourceRef: string, fileName: string): string {
  // feature_id = domain:feature-name
  // e.g., auth:session-validation
  const domain = sourceRef.split('/')[1] || 'core'; // lib/server → server
  const feature = fileName.replace('.ts', '').toLowerCase();
  return `${domain}:${feature}`;
}

function derivePacketKey(sourceRef: string): string {
  // packet_key = ace:packet:{domain}:{sequence}
  // e.g., ace:packet:auth:001
  const domain = sourceRef.split('/')[1] || 'core';
  // Sequence would be assigned during ingestion (counter per domain)
  return `ace:packet:${domain}`;
}

/**
 * Validate that all 8 IDs are present before writing to any store
 */
export function validateIDHierarchy(ids: CanonicalIDHierarchy): boolean {
  const required = [
    'repository_id',
    'directory_id',
    'file_id',
    'module_id',
    'symbol_id',
    'feature_id',
    'packet_key',
    'chunk_id'
  ] as const;

  for (const field of required) {
    if (!ids[field]) {
      console.error(`Missing ID: ${field}`);
      return false;
    }
  }
  return true;
}

/**
 * Write hierarchy to Postgres (truth)
 * Then mirror to Qdrant/Neo4j/Redis with same IDs
 */
export async function persistIDHierarchyToPostgres(
  pool: any,
  ids: CanonicalIDHierarchy,
  envelope: PostgresEnvelope
): Promise<void> {
  const query = `
    INSERT INTO atlas_packets (
      repository_id,
      directory_id,
      file_id,
      module_id,
      symbol_id,
      feature_id,
      packet_key,
      chunk_id,
      source_ref,
      packet_type,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    ON CONFLICT (packet_key) DO UPDATE SET updated_at = NOW()
  `;

  await pool.query(query, [
    ids.repository_id,
    ids.directory_id,
    ids.file_id,
    ids.module_id,
    ids.symbol_id,
    ids.feature_id,
    ids.packet_key,
    ids.chunk_id,
    envelope.source_ref,
    envelope.packet_type
  ]);
}

/**
 * Mirror IDs to Qdrant payload (read-only, matches Postgres)
 */
export async function mirrorIDHierarchyToQdrant(
  qdrantUrl: string,
  pointId: string,
  ids: CanonicalIDHierarchy,
  payload: Partial<QdrantPayload>
): Promise<void> {
  const fullPayload: QdrantPayload = {
    ...ids,
    ...payload,
    source_ref: payload.source_ref || '',
    packet_type: payload.packet_type || '',
    content_embedding: payload.content_embedding || [],
    summary_embedding: payload.summary_embedding || [],
    title_embedding: payload.title_embedding || [],
    signature_embedding: payload.signature_embedding || [],
    feature_embedding: payload.feature_embedding,
    latent64: payload.latent64
  };

  const res = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{ id: pointId, payload: fullPayload }]
    })
  });

  if (!res.ok) {
    throw new Error(`Qdrant mirror failed: ${res.status}`);
  }
}

/**
 * Mirror IDs to Neo4j nodes (read-only, matches Postgres)
 */
export async function mirrorIDHierarchyToNeo4j(
  neo4jSession: any,
  ids: CanonicalIDHierarchy,
  packet_type: string
): Promise<void> {
  const cypher = `
    MERGE (n:Packet { packet_key: $packet_key })
    SET n.repository_id = $repository_id,
        n.directory_id = $directory_id,
        n.file_id = $file_id,
        n.module_id = $module_id,
        n.symbol_id = $symbol_id,
        n.feature_id = $feature_id,
        n.chunk_id = $chunk_id,
        n.packet_type = $packet_type
  `;

  await neo4jSession.run(cypher, {
    packet_key: ids.packet_key,
    repository_id: ids.repository_id,
    directory_id: ids.directory_id,
    file_id: ids.file_id,
    module_id: ids.module_id,
    symbol_id: ids.symbol_id,
    feature_id: ids.feature_id,
    chunk_id: ids.chunk_id,
    packet_type
  });
}

/**
 * Cache keys in Redis — use IDs for efficient lookup
 */
export function getRedisKeyPatterns(ids: CanonicalIDHierarchy): RedisKey[] {
  return [
    // Primary: by packet
    { pattern: `packet:${ids.packet_key}`, ttl: 3600 },
    // Secondary: by file
    { pattern: `file:${ids.file_id}:packets`, ttl: 1800 },
    // Tertiary: by feature
    { pattern: `feature:${ids.feature_id}:packets`, ttl: 1800 },
    // Grouping: by symbol
    { pattern: `symbol:${ids.symbol_id}`, ttl: 900 },
    // Clustering: by directory
    { pattern: `directory:${ids.directory_id}:packets`, ttl: 1800 },
    // Module-level
    { pattern: `module:${ids.module_id}:packets`, ttl: 1800 }
  ];
}

export async function warmRedisFromPostgres(
  redisClient: any,
  postgres: any,
  ids: CanonicalIDHierarchy,
  data: Record<string, unknown>
): Promise<void> {
  const keys = getRedisKeyPatterns(ids);

  for (const { pattern, ttl } of keys) {
    await redisClient.setex(pattern, ttl, JSON.stringify(data));
  }
}