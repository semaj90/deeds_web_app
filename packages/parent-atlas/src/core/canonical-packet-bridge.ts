/**
 * Canonical Packet Bridge
 *
 * Connects @deeds/atlas-core packet identity to parent-atlas validators and adapters.
 * Provides safe extraction and validation of packet identity across all system lanes.
 */

import {
  type PacketIdentity,
  PacketIdentitySchema,
  extractPacketIdentity,
  validatePacketIdentity,
  identitiesEqual,
  mergePacketIdentities,
} from '@deeds/atlas-core/packet';

import {
  type AtlasMemoryEnvelope,
  type GlyphRecord,
  AtlasMemoryEnvelopeSchema,
  GlyphRecordSchema,
  verifyPacketTriple,
  bitfrostKey,
  createMemoryEnvelope,
} from '@deeds/atlas-core/types';

import type { QueryResultRow } from 'pg';

/**
 * Extract canonical packet identity from Postgres row (atlas_packets or atlas_packet_registry)
 * Hard fails on missing required fields: packet_key, source_ref, feature_id
 */
export function extractPacketIdentityFromRow(row: QueryResultRow): PacketIdentity {
  return extractPacketIdentity({
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    feature_id: row.feature_id,
    directory_path: row.directory_path,
    file_path: row.file_path,
    function_symbol: row.function_symbol,
    feature_label: row.feature_label,
  });
}

/**
 * Validate packet identity from row (soft check, for logging)
 * Returns array of validation errors; empty if valid
 */
export function validatePacketIdentityFromRow(row: QueryResultRow): string[] {
  return validatePacketIdentity({
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    feature_id: row.feature_id,
  });
}

/**
 * Verify packet triple consistency between row and expected identity
 * Hard validation: packet_key, source_ref, feature_id must all match
 */
export function verifyPacketIdentityConsistency(
  expected: PacketIdentity,
  row: QueryResultRow
): { consistent: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  if (row.packet_key !== expected.packet_key) {
    mismatches.push(
      `packet_key mismatch: expected "${expected.packet_key}", got "${row.packet_key}"`
    );
  }
  if (row.source_ref !== expected.source_ref) {
    mismatches.push(
      `source_ref mismatch: expected "${expected.source_ref}", got "${row.source_ref}"`
    );
  }
  if (row.feature_id !== expected.feature_id) {
    mismatches.push(
      `feature_id mismatch: expected "${expected.feature_id}", got "${row.feature_id}"`
    );
  }

  return {
    consistent: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Create memory envelope from packet row
 * Useful for audit trail and cross-system communication
 */
export function createEnvelopeFromRow(
  row: QueryResultRow,
  traceId: string,
  payloadKind: 'packet' | 'glyph' | 'reward' | 'training_pair' = 'packet'
): AtlasMemoryEnvelope {
  const identity = extractPacketIdentityFromRow(row);
  return createMemoryEnvelope(
    traceId,
    identity,
    payloadKind,
    row,
    {
      glyphId: row.glyph_id,
      centroidId: row.centroid_id,
      somCluster: row.som_cluster,
      batchId: row.batch_id,
    }
  );
}

/**
 * Export all canonical types for use by parent-atlas modules
 */
export {
  type PacketIdentity,
  type PacketKey,
  type SourceRef,
  type FeatureId,
  PacketIdentitySchema,
  extractPacketIdentity,
  validatePacketIdentity,
  identitiesEqual,
  mergePacketIdentities,
} from '@deeds/atlas-core/packet';

export {
  type AtlasMemoryEnvelope,
  type GlyphRecord,
  AtlasMemoryEnvelopeSchema,
  GlyphRecordSchema,
  verifyPacketTriple,
  bitfrostKey,
  createMemoryEnvelope,
} from '@deeds/atlas-core/types';
