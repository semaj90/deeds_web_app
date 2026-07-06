/**
 * Identity Lane Router — Five-Lane Packet Identity Preservation
 *
 * Routes packets to recovery lanes based on identity completeness:
 * - Lane 1 (Canonical): packet_key + source_ref + feature_id present
 * - Lane 2 (Recoverable by Span): source_ref + byte_start + byte_end present
 * - Lane 3 (Recoverable by Hash): source_ref + sha256 present
 * - Lane 4 (Mirror Orphan): qdrant_point_id or neo4j_node_id or redis_key present
 * - Lane 5 (Quarantine): cannot prove identity
 *
 * Only canonical lane writes mirrors and deletes.
 * Recovery lanes reconstruct identity deterministically.
 * Quarantine lane preserves data but blocks write/delete operations.
 *
 * Purpose: Enable agentic error fixing to reliably locate and reconstruct packets
 */

import { createHash } from 'node:crypto';

export type IdentityLane = 'canonical' | 'recoverable_by_span' | 'recoverable_by_hash' | 'mirror_orphan' | 'quarantine';

export interface PacketIdentity {
  // Core identity
  packet_key?: string;
  source_ref?: string;
  feature_id?: string;

  // Recovery fields
  byte_start?: number;
  byte_end?: number;
  sha256?: string;
  source_kind?: string;

  // Mirror references
  qdrant_point_id?: string;
  neo4j_node_id?: string;
  redis_key?: string;
}

export interface LaneAssignment {
  packet_key: string;
  lane: IdentityLane;
  confidence: number; // 1.0 = certain, 0.5 = recoverable, 0.1 = mirror_orphan
  recovered_packet_key?: string;
  recovery_reason?: string;
  safe_for_delete: boolean;
  safe_for_mirror_write: boolean;
}

/**
 * Deterministic packet_key reconstruction from stable fields
 * Used by recovery lanes to locate or recreate missing packet_key
 */
export function reconstructPacketKey(identity: PacketIdentity): string {
  if (identity.packet_key) {
    return identity.packet_key; // Existing key wins
  }

  // Lane 2: Reconstruct from byte span
  if (identity.source_ref && identity.byte_start != null && identity.byte_end != null) {
    const fields = [
      identity.source_ref,
      identity.feature_id || '',
      String(identity.byte_start),
      String(identity.byte_end),
      identity.sha256 || '',
      identity.source_kind || ''
    ];
    return `recovered:${createHash('sha256').update(fields.join('|')).digest('hex').slice(0, 16)}`;
  }

  // Lane 3: Reconstruct from hash
  if (identity.source_ref && identity.sha256) {
    const fields = [
      identity.source_ref,
      identity.feature_id || '',
      identity.sha256,
      identity.source_kind || ''
    ];
    return `recovered:${createHash('sha256').update(fields.join('|')).digest('hex').slice(0, 16)}`;
  }

  // Lane 4: Attempt recovery from mirror references
  if (identity.qdrant_point_id || identity.neo4j_node_id || identity.redis_key) {
    const source = identity.qdrant_point_id || identity.neo4j_node_id || identity.redis_key || 'unknown';
    return `mirror:${createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
  }

  // Lane 5: Quarantine — no recovery possible
  return `quarantine:${createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16)}`;
}

/**
 * Assign packet to identity lane based on field completeness
 */
export function assignIdentityLane(packet: PacketIdentity): LaneAssignment {
  const recovered_packet_key = reconstructPacketKey(packet);

  // Lane 1: Canonical — all three core fields present
  if (packet.packet_key && packet.source_ref && packet.feature_id) {
    return {
      packet_key: packet.packet_key,
      lane: 'canonical',
      confidence: 1.0,
      safe_for_delete: true,
      safe_for_mirror_write: true
    };
  }

  // Lane 2: Recoverable by span — source_ref + byte_start + byte_end
  if (packet.source_ref && packet.byte_start != null && packet.byte_end != null) {
    return {
      packet_key: recovered_packet_key,
      lane: 'recoverable_by_span',
      confidence: 0.8,
      recovered_packet_key,
      recovery_reason: 'Reconstructed from source_ref + byte span',
      safe_for_delete: false,
      safe_for_mirror_write: false
    };
  }

  // Lane 3: Recoverable by hash — source_ref + sha256
  if (packet.source_ref && packet.sha256) {
    return {
      packet_key: recovered_packet_key,
      lane: 'recoverable_by_hash',
      confidence: 0.6,
      recovered_packet_key,
      recovery_reason: 'Reconstructed from source_ref + content hash',
      safe_for_delete: false,
      safe_for_mirror_write: false
    };
  }

  // Lane 4: Mirror orphan — only mirror references present
  if (packet.qdrant_point_id || packet.neo4j_node_id || packet.redis_key) {
    return {
      packet_key: recovered_packet_key,
      lane: 'mirror_orphan',
      confidence: 0.1,
      recovered_packet_key,
      recovery_reason: 'Orphan in mirror store, canonical identity lost',
      safe_for_delete: false,
      safe_for_mirror_write: false
    };
  }

  // Lane 5: Quarantine — cannot prove identity
  return {
    packet_key: recovered_packet_key,
    lane: 'quarantine',
    confidence: 0.0,
    recovered_packet_key,
    recovery_reason: 'No identity fields available',
    safe_for_delete: false,
    safe_for_mirror_write: false
  };
}

/**
 * Query builder for lanes in Postgres
 */
export function buildLaneQuery(lane: IdentityLane): string {
  switch (lane) {
    case 'canonical':
      return `
        SELECT * FROM atlas_packets
        WHERE packet_key IS NOT NULL
          AND source_ref IS NOT NULL
          AND feature_id IS NOT NULL
      `;

    case 'recoverable_by_span':
      return `
        SELECT * FROM atlas_packets
        WHERE packet_key IS NULL
          AND source_ref IS NOT NULL
          AND byte_start IS NOT NULL
          AND byte_end IS NOT NULL
      `;

    case 'recoverable_by_hash':
      return `
        SELECT * FROM atlas_packets
        WHERE packet_key IS NULL
          AND source_ref IS NOT NULL
          AND sha256 IS NOT NULL
          AND (byte_start IS NULL OR byte_end IS NULL)
      `;

    case 'mirror_orphan':
      return `
        SELECT * FROM atlas_packets
        WHERE (packet_key IS NULL OR source_ref IS NULL)
          AND (qdrant_point_id IS NOT NULL OR neo4j_node_id IS NOT NULL OR redis_key IS NOT NULL)
      `;

    case 'quarantine':
      return `
        SELECT * FROM atlas_packets
        WHERE packet_key IS NULL
          AND source_ref IS NULL
          AND sha256 IS NULL
          AND qdrant_point_id IS NULL
          AND neo4j_node_id IS NULL
          AND redis_key IS NULL
      `;
  }
}

/**
 * Safety check before write/delete operations
 */
export function canPerformOperation(lane: IdentityLane, operation: 'read' | 'write' | 'delete'): boolean {
  const safetyMatrix: Record<IdentityLane, Record<string, boolean>> = {
    canonical: { read: true, write: true, delete: true },
    recoverable_by_span: { read: true, write: false, delete: false },
    recoverable_by_hash: { read: true, write: false, delete: false },
    mirror_orphan: { read: true, write: false, delete: false },
    quarantine: { read: true, write: false, delete: false }
  };

  return safetyMatrix[lane]?.[operation] ?? false;
}

/**
 * Audit log entry for identity operations
 */
export interface IdentityAuditLog {
  timestamp: Date;
  packet_key: string;
  lane_before: IdentityLane;
  lane_after: IdentityLane;
  operation: 'assign' | 'recover' | 'promote' | 'demote';
  user_id?: string;
  reason: string;
  confidence_before?: number;
  confidence_after?: number;
}

/**
 * Log identity lane changes for agentic error fixing visibility
 */
export async function logIdentityAudit(
  pool: any,
  audit: IdentityAuditLog
): Promise<void> {
  const query = `
    INSERT INTO identity_audit_logs
    (timestamp, packet_key, lane_before, lane_after, operation, user_id, reason, confidence_before, confidence_after)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

  try {
    await pool.query(query, [
      audit.timestamp,
      audit.packet_key,
      audit.lane_before,
      audit.lane_after,
      audit.operation,
      audit.user_id,
      audit.reason,
      audit.confidence_before,
      audit.confidence_after
    ]);
  } catch (err) {
    console.error('Identity audit log failed:', err);
  }
}

/**
 * Promote packet from recovery lane to canonical (after verification)
 */
export async function promoteToCanonical(
  pool: any,
  packet_key: string,
  source_ref: string,
  feature_id: string,
  user_id: string
): Promise<void> {
  const query = `
    UPDATE atlas_packets
    SET
      packet_key = $1,
      source_ref = $2,
      feature_id = $3,
      identity_lane = 'canonical',
      identity_confidence = 1.0,
      updated_at = NOW()
    WHERE packet_key = $4 OR recovered_packet_key = $4
  `;

  await pool.query(query, [packet_key, source_ref, feature_id, packet_key]);

  await logIdentityAudit(pool, {
    timestamp: new Date(),
    packet_key,
    lane_before: 'recoverable_by_span',
    lane_after: 'canonical',
    operation: 'promote',
    user_id,
    reason: 'Verified and promoted to canonical identity',
    confidence_before: 0.8,
    confidence_after: 1.0
  });
}

/**
 * Demote canonical packet to recovery lane (e.g., after corruption detection)
 */
export async function demoteFromCanonical(
  pool: any,
  packet_key: string,
  reason: string,
  user_id: string
): Promise<void> {
  const query = `
    UPDATE atlas_packets
    SET
      packet_key = NULL,
      identity_lane = 'quarantine',
      identity_confidence = 0.0,
      identity_recovery_reason = $1,
      updated_at = NOW()
    WHERE packet_key = $2
  `;

  await pool.query(query, [reason, packet_key]);

  await logIdentityAudit(pool, {
    timestamp: new Date(),
    packet_key,
    lane_before: 'canonical',
    lane_after: 'quarantine',
    operation: 'demote',
    user_id,
    reason,
    confidence_before: 1.0,
    confidence_after: 0.0
  });
}
