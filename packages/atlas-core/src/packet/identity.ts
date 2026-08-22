/**
 * Canonical Packet Identity
 *
 * One immutable type, used everywhere across all stores.
 * Never duplicate or redefine this shape.
 *
 * Canonical chain: directory_path → source_ref → file_path → function_symbol
 *                   → feature_id → feature_label → packet_key
 *
 * Every packet operation must validate against this spine.
 */

import { z } from 'zod';

/**
 * Canonical packet identity schema (Zod-validated)
 * This is the ONLY packet identity type used in the codebase.
 * Replaces: packetId, packet_id, PacketKey, PacketType, etc.
 */
export const PacketIdentitySchema = z.object({
  packet_key: z.string().min(1).describe('Canonical packet identifier (ace:packet:auth:001)'),
  source_ref: z.string().min(1).describe('Source file reference (src/lib/server/auth.ts)'),
  feature_id: z.string().min(1).describe('Feature lane identifier (auth.sessions)'),
  directory_path: z.string().optional().describe('Directory path (src/lib/server)'),
  file_path: z.string().optional().describe('Full file path (src/lib/server/auth.ts)'),
  function_symbol: z.string().optional().describe('Exported function name (validateSession)'),
  feature_label: z.string().optional().describe('Human-readable feature label (Authentication Sessions)'),
});

export type PacketIdentity = z.infer<typeof PacketIdentitySchema>;

/**
 * Branded types to prevent accidental string substitution
 */
export type PacketKey = string & { readonly __brand: 'PacketKey' };
export type SourceRef = string & { readonly __brand: 'SourceRef' };
export type FeatureId = string & { readonly __brand: 'FeatureId' };

/**
 * Create branded PacketKey (prevents mixing with other strings)
 */
export function createPacketKey(key: string): PacketKey {
  return key as PacketKey;
}

/**
 * Create branded SourceRef (prevents mixing with other strings)
 */
export function createSourceRef(ref: string): SourceRef {
  return ref as SourceRef;
}

/**
 * Create branded FeatureId (prevents mixing with other strings)
 */
export function createFeatureId(id: string): FeatureId {
  return id as FeatureId;
}

/**
 * Extract packet identity from any object (safe, validated)
 * Throws on validation failure (hard fail)
 */
export function extractPacketIdentity(packet: any): PacketIdentity {
  try {
    return PacketIdentitySchema.parse({
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      feature_id: packet.feature_id,
      directory_path: packet.directory_path,
      file_path: packet.file_path,
      function_symbol: packet.function_symbol,
      feature_label: packet.feature_label,
    });
  } catch (err) {
    throw new Error(
      `Failed to extract packet identity: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Validate packet identity exists (soft check, for logging)
 * Returns validation errors if any
 */
export function validatePacketIdentity(packet: any): string[] {
  const errors: string[] = [];

  if (!packet.packet_key) errors.push('missing packet_key');
  if (!packet.source_ref) errors.push('missing source_ref');
  if (!packet.feature_id) errors.push('missing feature_id');

  return errors;
}

/**
 * Compare two packet identities for equality (checks core 3 fields)
 */
export function identitiesEqual(a: PacketIdentity, b: PacketIdentity): boolean {
  return (
    a.packet_key === b.packet_key &&
    a.source_ref === b.source_ref &&
    a.feature_id === b.feature_id
  );
}

/**
 * Merge two packet identities, preferring left's non-null values
 */
export function mergePacketIdentities(left: PacketIdentity, right: PacketIdentity): PacketIdentity {
  return {
    packet_key: left.packet_key || right.packet_key,
    source_ref: left.source_ref || right.source_ref,
    feature_id: left.feature_id || right.feature_id,
    directory_path: left.directory_path ?? right.directory_path,
    file_path: left.file_path ?? right.file_path,
    function_symbol: left.function_symbol ?? right.function_symbol,
    feature_label: left.feature_label ?? right.feature_label,
  };
}
