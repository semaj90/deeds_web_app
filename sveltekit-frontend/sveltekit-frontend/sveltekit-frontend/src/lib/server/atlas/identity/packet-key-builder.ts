/**
 * Packet Key Builder — Corrected Canonical Identity
 *
 * POLICY: packet_key is the STABLE LOGICAL IDENTITY
 * Hash components: workspace_id + normalized_source_ref + semantic_anchor
 * These NEVER change after creation. tree_node_id is MUTABLE LINEAGE METADATA.
 *
 * packet_key format: pkt_<32-char hex (first 32 of SHA256)>
 *
 * Rationale:
 * - workspace_id: separates tenants, immutable
 * - normalized_source_ref: canonical file path (stable across refactoring)
 * - semantic_anchor: semantic grouping key (function name, class name, feature label)
 *
 * tree_node_id tracks STRUCTURAL CHANGES but does NOT affect packet_key immutability.
 * Structural moves/renames produce new tree_node_id, same packet_key.
 * This allows audit trail without forcing new identity.
 */

import { createHash } from 'crypto';

export interface PacketKeyInput {
  workspaceId: string;
  sourceRef: string;
  semanticAnchor: string;
}

export interface TreeNodeIdentityInput {
  sourceRef: string;
  language: string;
  nodeKind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'unknown';
  qualifiedName: string | null;
  signatureHash?: string | null;
  parentQualifiedName?: string | null;
  startByte?: number;
  endByte?: number;
}

/**
 * Normalize source_ref for stable identity.
 * POSIX forward slashes, lowercase, trimmed.
 */
export function normalizeSourceRef(sourceRef: string): string {
  return sourceRef
    .replaceAll('\\', '/') // Windows → POSIX
    .toLowerCase()
    .trim();
}

/**
 * Compute STABLE LOGICAL packet_key (immutable).
 *
 * Components:
 *   workspace_id + normalized_source_ref + semantic_anchor
 *
 * Returns: pkt_<32-char hex>
 *
 * NEVER changes after initial creation, even if tree_node_id changes.
 */
export function computePacketKey(input: PacketKeyInput): string {
  const workspaceId = input.workspaceId.trim();
  const sourceRef = normalizeSourceRef(input.sourceRef);
  const semanticAnchor = input.semanticAnchor.trim();

  if (!workspaceId) {
    throw new Error('workspaceId is required to compute packet_key');
  }
  if (!sourceRef) {
    throw new Error('sourceRef is required to compute packet_key');
  }
  if (!semanticAnchor) {
    throw new Error('semanticAnchor is required to compute packet_key');
  }

  const canonical = ['packet_key_v1', workspaceId, sourceRef, semanticAnchor].join('\0');
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');

  return `pkt_${digest.slice(0, 32)}`;
}

/**
 * Compute CONTENT HASH (separate from identity).
 * Tracks version of actual content, NOT identity.
 *
 * Returns: sha256 hex (full 64 chars)
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute STRUCTURAL IDENTITY (mutable lineage metadata).
 *
 * Deterministic hash of structural properties:
 *   (sourceRef, language, nodeKind, qualifiedName, signatureHash, parentQualifiedName)
 *
 * Changes when:
 * - Function/class renamed
 * - Moved to different file (sourceRef changes)
 * - Parent class/module changes
 *
 * Returns: tree_<32-char hex>
 *
 * DOES NOT affect packet_key. Used to detect refactoring events.
 * Store location fields (startByte, endByte) separately in lineage metadata.
 */
export function computeTreeNodeId(input: TreeNodeIdentityInput): string {
  const sourceRef = normalizeSourceRef(input.sourceRef);
  const language = input.language.trim().toLowerCase();
  const nodeKind = input.nodeKind;
  const qualifiedName = input.qualifiedName?.trim() ?? null;
  const signatureHash = input.signatureHash?.trim() ?? null;
  const parentQualifiedName = input.parentQualifiedName?.trim() ?? null;

  if (!sourceRef) {
    throw new Error('sourceRef is required');
  }
  if (!language) {
    throw new Error('language is required');
  }
  if (!nodeKind) {
    throw new Error('nodeKind is required');
  }

  const structural = {
    sourceRef,
    language,
    nodeKind,
    qualifiedName,
    signatureHash,
    parentQualifiedName,
  };

  const canonical = JSON.stringify(structural, null, 0);
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');

  return `tree_${digest.slice(0, 32)}`;
}

/**
 * Compute QDRANT POINT ID (deterministic UUID projection).
 *
 * Format: <UUID v5 derived from packet_key + workspace + qdrant_collection>
 * Stable across re-indexing (same input → same UUID).
 *
 * This is the Qdrant point_id, not the packet_key.
 * Multiple Qdrant collections can hold copies of the same packet (dense_384, dense_768, latent_64).
 */
export function computeQdrantPointId(
  packetKey: string,
  workspaceId: string,
  collectionName: string
): string {
  if (!packetKey.startsWith('pkt_')) {
    throw new Error(`packetKey must start with pkt_ prefix, got: ${packetKey}`);
  }

  // Simplified: use hash(packetKey + collection) → UUID-like string
  // In production, use a proper UUID v5 library with namespace
  const input = `${packetKey}::${workspaceId}::${collectionName}`;
  const digest = createHash('sha256').update(input, 'utf8').digest('hex');

  // Format as UUID-like (8-4-4-4-12 hex groups)
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join('-');
}

/**
 * Verify packet_key immutability: stored value must match recomputed value.
 *
 * Hard gate: any mismatch indicates identity corruption.
 */
export function validatePacketKeyImmutability(
  storedPacketKey: string,
  recomputedPacketKey: string
): { isValid: boolean; error?: string } {
  if (!storedPacketKey.startsWith('pkt_')) {
    return {
      isValid: false,
      error: `Stored packet_key missing pkt_ prefix: ${storedPacketKey}`,
    };
  }

  if (!recomputedPacketKey.startsWith('pkt_')) {
    return {
      isValid: false,
      error: `Recomputed packet_key missing pkt_ prefix: ${recomputedPacketKey}`,
    };
  }

  if (storedPacketKey !== recomputedPacketKey) {
    return {
      isValid: false,
      error: `packet_key mismatch: stored=${storedPacketKey}, recomputed=${recomputedPacketKey}`,
    };
  }

  return { isValid: true };
}

/**
 * Projection immutability gate (Postgres → Qdrant → Redis → HyperRAG → ACE).
 *
 * Reports missing vs mismatched fields separately.
 */
export type PacketProjection = {
  layer: 'POSTGRES' | 'QDRANT' | 'REDIS' | 'HYPERRAG_RPC' | 'ACE';
  packetKey: string | null;
  contentHash: string | null;
  workspaceRevision?: string | null;
};

export type ProjectionViolation = {
  code: 'PACKET_KEY_MISSING' | 'PACKET_KEY_MISMATCH' | 'CONTENT_HASH_MISMATCH';
  layer: string;
  expected?: string;
  actual?: string | null;
};

export function validatePacketLineage(
  expected: PacketProjection,
  projections: PacketProjection[]
): { isValid: boolean; violations: ProjectionViolation[] } {
  const violations: ProjectionViolation[] = [];

  for (const projection of projections) {
    // Check packet_key presence
    if (!projection.packetKey) {
      violations.push({
        code: 'PACKET_KEY_MISSING',
        layer: projection.layer,
      });
      continue;
    }

    // Check packet_key immutability
    if (projection.packetKey !== expected.packetKey) {
      violations.push({
        code: 'PACKET_KEY_MISMATCH',
        layer: projection.layer,
        expected: expected.packetKey || 'undefined',
        actual: projection.packetKey,
      });
    }

    // Check content_hash consistency (if present)
    if (expected.contentHash && projection.contentHash !== expected.contentHash) {
      violations.push({
        code: 'CONTENT_HASH_MISMATCH',
        layer: projection.layer,
        expected: expected.contentHash,
        actual: projection.contentHash,
      });
    }
  }

  return {
    isValid: !violations.some(
      (v) => v.code === 'PACKET_KEY_MISSING' || v.code === 'PACKET_KEY_MISMATCH'
    ),
    violations,
  };
}
