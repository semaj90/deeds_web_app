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
import { z } from 'zod';

/**
 * Role-based access levels for identity hierarchy
 */
export type AccessLevel = 'owner' | 'write' | 'read' | 'none';

export interface Permission {
  user_id: string;
  resource_id: string; // Any level: repository_id, directory_id, file_id, etc.
  resource_type: 'repository' | 'directory' | 'file' | 'module' | 'symbol' | 'feature' | 'packet' | 'chunk';
  access_level: AccessLevel;
  granted_at: Date;
  granted_by: string; // user_id of grantor
}

export interface AccessPolicy {
  // Inheritance rule: access to parent implies access to children
  inherit_from_parent: boolean; // True = read parent → read all children
  require_explicit: boolean; // True = must explicitly grant child access
  audit_deletions: boolean; // True = log all delete attempts
  require_approval_for_delete: boolean; // True = deletion needs second approval
}

/**
 * Canonical Envelope — Complete identity + mirror mapping + provenance
 *
 * Separates concerns:
 * - hierarchy: top-down immutable structure (repository → chunk)
 * - mirrors: store-specific handles (Qdrant, Neo4j, Redis IDs)
 * - topology: derived clustering (SOM, community, centroid)
 * - provenance: truth tracking + parity status
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

export interface MirrorHandles {
  qdrant_point_id?: string; // Qdrant point ID (optional, backfillable)
  neo4j_node_id?: string; // Neo4j node ID (optional, syncable)
  redis_key?: string; // Redis cache key pattern
}

export interface TopologyCoordinates {
  som_cluster?: string; // SOM grid position
  centroid_id?: string; // K-means centroid ID
  community_id?: string; // Louvain community ID
}

export interface Provenance {
  truth: 'postgres'; // Canonical source
  revision: number; // Update counter
  parity_status: 'matched' | 'diverged' | 'unknown'; // vs mirrors
  last_verified_at?: Date;
  verified_by_lane?: string; // Which retrieval lane verified this
}

export interface CanonicalEnvelope extends CanonicalIDHierarchy {
  // Source reference (derived from hierarchy)
  source_ref: string; // src/lib/server/auth.ts
  packet_type: string; // 'file' | 'module' | 'function' | 'class' | 'route'

  // Mirror store IDs (separate from hierarchy)
  mirrors: MirrorHandles;

  // Topology (derived, not canonical)
  topology: TopologyCoordinates;

  // Provenance (for error detection)
  provenance: Provenance;

  // Permissions (optional, for guarding mutations)
  owner_id?: string;
  access_policy?: AccessPolicy;
}

/**
 * Store-specific envelope — same IDs, wrapped per store
 */
export interface PostgresEnvelope extends CanonicalEnvelope {
  // Postgres-specific columns
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date; // NULL until deleted; soft delete is reversible

  // Permission enforcement
  access_control_list: Permission[]; // All grants for this packet
  marked_for_deletion: boolean; // Soft delete flag (reversible if user has write access)
  delete_approved_by?: string[]; // user_ids of approvers (if approval required)
}

export interface QdrantPayload extends CanonicalEnvelope {
  // Qdrant payload carries full canonical envelope + embeddings
  // Multi-vector metadata
  content_embedding: number[]; // 384-dim (primary, semantic search)
  summary_embedding: number[]; // 384-dim (concept-level retrieval)
  title_embedding: number[]; // 384-dim (feature lookup)
  signature_embedding: number[]; // 384-dim (function/API similarity)
  feature_embedding?: number[]; // 384-dim (cross-cutting concerns, optional)
  latent64?: number[]; // 64-dim (clustering only, NOT for retrieval)
}

export interface Neo4jNode extends CanonicalEnvelope {
  // Neo4j node mirrors canonical envelope + topology edges
  labels: string[]; // e.g., ['Packet', 'Feature', 'Module']
  relationships?: Array<{
    type: string; // IMPORTS, USES, SIMILAR_TOPOLOGY, etc.
    target_node_id: string;
  }>;
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
 * Validate canonical envelope — hierarchy is required, mirrors/topology optional
 */
export function validateCanonicalEnvelope(
  envelope: CanonicalEnvelope
): { valid: boolean; errors: string[]; recovery_lane?: 'canonical' | 'recoverable' | 'quarantine' } {
  const errors: string[] = [];

  // Hard-fail conditions (hierarchy must be complete)
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
    if (!envelope[field]) {
      errors.push(`[HIERARCHY] Missing required field: ${field}`);
    }
  }

  // Soft warnings (mirrors optional but valuable for parity)
  if (!envelope.mirrors?.qdrant_point_id) {
    // Not an error, but marks this packet as requiring backfill
  }
  if (!envelope.mirrors?.neo4j_node_id) {
    // Not an error, but marks this packet as requiring sync
  }

  // Determine recovery lane
  let recovery_lane: 'canonical' | 'recoverable' | 'quarantine' = 'canonical';

  if (!envelope.packet_key) {
    recovery_lane = 'quarantine'; // Lost core identity, cannot recover
  } else if (!envelope.source_ref || !envelope.feature_id) {
    recovery_lane = 'recoverable'; // Partial identity, can be reconstructed
  }

  return {
    valid: errors.length === 0,
    errors,
    recovery_lane
  };
}

/**
 * Legacy: validate just the hierarchy (for backward compat)
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

/**
 * PERMISSION CHECKING LAYER
 * Guards all read/write/delete operations on identity hierarchy
 */

export async function checkPermission(
  userId: string,
  resourceId: string,
  resourceType: string,
  action: 'read' | 'write' | 'delete',
  permissions: Permission[]
): Promise<{ allowed: boolean; reason?: string }> {
  // Find matching permission
  const perm = permissions.find(
    p => p.user_id === userId && p.resource_id === resourceId
  );

  if (!perm) {
    return { allowed: false, reason: 'No permission granted for this resource' };
  }

  // Map actions to required access levels
  const accessRequired: Record<string, AccessLevel[]> = {
    read: ['read', 'write', 'owner'],
    write: ['write', 'owner'],
    delete: ['owner']
  };

  const required = accessRequired[action] || [];
  const hasAccess = required.includes(perm.access_level);

  if (!hasAccess) {
    return {
      allowed: false,
      reason: `User access level '${perm.access_level}' insufficient for '${action}' (requires: ${required.join(' or ')})`
    };
  }

  return { allowed: true };
}

export async function checkHierarchicalPermission(
  userId: string,
  packetIds: CanonicalIDHierarchy,
  action: 'read' | 'write' | 'delete',
  permissions: Permission[],
  policy: AccessPolicy
): Promise<{ allowed: boolean; reason?: string; blockedAt?: string }> {
  // Check all levels: packet → chunk → feature → symbol → module → file → directory → repository
  const levels = [
    { id: packetIds.packet_key, type: 'packet' },
    { id: packetIds.chunk_id, type: 'chunk' },
    { id: packetIds.feature_id, type: 'feature' },
    { id: packetIds.symbol_id, type: 'symbol' },
    { id: packetIds.module_id, type: 'module' },
    { id: packetIds.file_id, type: 'file' },
    { id: packetIds.directory_id, type: 'directory' },
    { id: packetIds.repository_id, type: 'repository' }
  ];

  // Walk down hierarchy
  for (const { id, type } of levels) {
    const check = await checkPermission(userId, id, type, action, permissions);
    if (!check.allowed) {
      if (policy.inherit_from_parent) {
        // Try parent level
        continue;
      } else if (policy.require_explicit) {
        return { allowed: false, reason: check.reason, blockedAt: type };
      }
    }
    if (check.allowed) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: 'No sufficient permissions at any hierarchy level' };
}

export async function auditDeleteOperation(
  userId: string,
  packetKey: string,
  resourceId: string,
  policy: AccessPolicy
): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
  if (!policy.audit_deletions) {
    return { allowed: true, requiresApproval: false };
  }

  if (policy.require_approval_for_delete) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: 'Deletion requires secondary approval. Record deletion intent in audit trail.'
    };
  }

  return { allowed: true, requiresApproval: false };
}

export async function softDeletePacket(
  pool: any,
  packetKey: string,
  userId: string
): Promise<void> {
  // Mark for deletion instead of hard delete
  const query = `
    UPDATE atlas_packets
    SET marked_for_deletion = true,
        updated_at = NOW()
    WHERE packet_key = $1
  `;
  await pool.query(query, [packetKey]);

  // Log in audit trail
  console.log(`[AUDIT] User ${userId} marked packet ${packetKey} for deletion at ${new Date().toISOString()}`);
}

export async function approveAndPermanentlyDelete(
  pool: any,
  packetKey: string,
  approvedBy: string[],
  minApprovalsRequired: number = 2
): Promise<{ deleted: boolean; reason?: string }> {
  if (approvedBy.length < minApprovalsRequired) {
    return {
      deleted: false,
      reason: `Only ${approvedBy.length}/${minApprovalsRequired} approvals. Cannot permanently delete.`
    };
  }

  // Hard delete only after threshold of approvals
  const query = `
    DELETE FROM atlas_packets
    WHERE packet_key = $1 AND marked_for_deletion = true
  `;
  const result = await pool.query(query, [packetKey]);

  if (result.rowCount === 0) {
    return { deleted: false, reason: 'Packet not found or not marked for deletion' };
  }

  console.log(
    `[AUDIT] Packet ${packetKey} permanently deleted after approval from: ${approvedBy.join(', ')}`
  );
  return { deleted: true };
}

export async function undeletePacket(
  pool: any,
  packetKey: string,
  userId: string
): Promise<void> {
  // Soft-deleted packets can be restored if user has write access
  const query = `
    UPDATE atlas_packets
    SET marked_for_deletion = false,
        updated_at = NOW()
    WHERE packet_key = $1 AND marked_for_deletion = true
  `;
  await pool.query(query, [packetKey]);
  console.log(`[AUDIT] User ${userId} restored packet ${packetKey} at ${new Date().toISOString()}`);
}

/**
 * Zod schemas for API boundary validation
 */

export const CanonicalIDHierarchySchema = z.object({
  repository_id: z.string().uuid(),
  directory_id: z.string().uuid(),
  file_id: z.string().uuid(),
  module_id: z.string().uuid(),
  symbol_id: z.string().uuid(),
  feature_id: z.string(),
  packet_key: z.string(),
  chunk_id: z.string()
});

export const MirrorHandlesSchema = z.object({
  qdrant_point_id: z.string().optional(),
  neo4j_node_id: z.string().optional(),
  redis_key: z.string().optional()
});

export const TopologyCoordinatesSchema = z.object({
  som_cluster: z.string().optional(),
  centroid_id: z.string().optional(),
  community_id: z.string().optional()
});

export const ProvenanceSchema = z.object({
  truth: z.literal('postgres'),
  revision: z.number().int().nonnegative(),
  parity_status: z.enum(['matched', 'diverged', 'unknown']),
  last_verified_at: z.date().optional(),
  verified_by_lane: z.string().optional()
});

export const CanonicalEnvelopeSchema = CanonicalIDHierarchySchema.extend({
  source_ref: z.string(),
  packet_type: z.string(),
  mirrors: MirrorHandlesSchema,
  topology: TopologyCoordinatesSchema,
  provenance: ProvenanceSchema,
  owner_id: z.string().optional(),
  access_policy: z.object({}).optional()
});

export type CanonicalEnvelopeType = z.infer<typeof CanonicalEnvelopeSchema>;