export * from './packet-envelope.js';

/**
 * Canonical types for atlas-core
 *
 * Shared across all runtime lanes:
 * - RPC requests/responses
 * - RabbitMQ jobs
 * - Redis cache values
 * - ACE/NES packets
 * - Glyph training pairs
 * - Telemetry events
 */

import { z } from 'zod';
import type { PacketIdentity } from '../packet/index.js';

/**
 * Canonical memory envelope — wraps all packet/glyph/training operations
 *
 * Every message that crosses a boundary (RPC, RabbitMQ, Redis, Postgres JSONB)
 * uses this shape. Enables unified serialization, validation, and tracing.
 */
export const AtlasMemoryEnvelopeSchema = z.object({
  trace_id: z.string().uuid().describe('Runtime loop trace ID for tracking'),
  packet_key: z.string().min(1).describe('Canonical packet identifier'),
  source_ref: z.string().min(1).describe('Source file or logical reference'),
  feature_id: z.string().min(1).describe('Feature lane identifier'),
  glyph_id: z.string().optional().describe('Compressed symbolic memory row ID'),
  centroid_id: z.number().optional().describe('Semantic cluster centroid index'),
  som_cluster: z.number().optional().describe('Topology cluster (SOM grid cell)'),
  batch_id: z.string().optional().describe('Training/checkpoint batch identifier'),
  payload_kind: z.enum(['packet', 'glyph', 'reward', 'training_pair']).describe('Type of payload'),
  payload_encoding: z.enum(['json', 'msgpack', 'hex']).default('json').describe('Encoding format'),
  payload: z.unknown().describe('Actual data (varies by payload_kind and encoding)'),
  timestamp: z.number().optional().describe('Milliseconds since epoch'),
});

export type AtlasMemoryEnvelope = z.infer<typeof AtlasMemoryEnvelopeSchema>;

/**
 * Glyph record — derived symbolic memory bound to packet canonical identity
 *
 * This is the join point between:
 * - RPC packets (via packet_key)
 * - Packet registry (via source_ref + feature_id)
 * - BitFrost hot cache (via Redis cache keys)
 * - GPU processing (via centroid_id, som_cluster)
 * - Training pipeline (via batch_id, glyph_id)
 */
export const GlyphRecordSchema = z.object({
  glyph_id: z.string().describe('Primary key for this glyph'),
  packet_key: z.string().describe('Foreign key to atlas_packets.packet_key'),
  source_ref: z.string().describe('Foreign key to atlas_source_refs.source_ref'),
  feature_id: z.string().describe('Foreign key to atlas_feature_labels.feature_id'),
  trace_id: z.string().uuid().describe('Last update trace_id'),
  qdrant_point_id: z.string().optional().describe('Foreign key to Qdrant chunk vector'),
  centroid_id: z.number().optional().describe('Semantic cluster centroid index'),
  som_cluster: z.number().optional().describe('SOM topology cluster number'),
  batch_id: z.string().optional().describe('Training/checkpoint batch'),
  grpo_reward_score: z.number().optional().describe('GRPO reward signal'),
  confidence: z.number().min(0).max(1).optional().describe('Encoding confidence'),
  created_at: z.number().describe('Creation timestamp (ms)'),
  updated_at: z.number().describe('Last update timestamp (ms)'),
});

export type GlyphRecord = z.infer<typeof GlyphRecordSchema>;

/**
 * Unified bitfrost cache key pattern
 */
export function bitfrostKey(kind: string, id: string): string {
  return `bitfrost:${kind}:${id}`;
}

/**
 * Verify packet identity triple (source_ref + feature_id + packet_key match)
 */
export function verifyPacketTriple(
  packet_key: string,
  source_ref: string,
  feature_id: string,
  fromDb: { source_ref: string; feature_id: string; packet_key: string }
): boolean {
  return (
    fromDb.packet_key === packet_key &&
    fromDb.source_ref === source_ref &&
    fromDb.feature_id === feature_id
  );
}

/**
 * Create a memory envelope from packet identity
 */
export function createMemoryEnvelope(
  traceId: string,
  identity: PacketIdentity,
  payloadKind: 'packet' | 'glyph' | 'reward' | 'training_pair',
  payload: unknown,
  options?: { glyphId?: string; centroidId?: number; somCluster?: number; batchId?: string }
): AtlasMemoryEnvelope {
  return {
    trace_id: traceId,
    packet_key: identity.packet_key,
    source_ref: identity.source_ref,
    feature_id: identity.feature_id,
    glyph_id: options?.glyphId,
    centroid_id: options?.centroidId,
    som_cluster: options?.somCluster,
    batch_id: options?.batchId,
    payload_kind: payloadKind,
    payload_encoding: 'json',
    payload,
    timestamp: Date.now(),
  };
}
