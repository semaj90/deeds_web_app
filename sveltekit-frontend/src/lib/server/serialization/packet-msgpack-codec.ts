/**
 * Packet Msgpack Codec
 *
 * Binary transport codec for PacketTopologyEnvelope handoffs.
 * Uses @msgpack/msgpack for compact binary serialization.
 * Fixed-tag enum (0–31) encodes identity fields first for better compression.
 */

import { encode, decode } from '@msgpack/msgpack';
import { type PacketTopologyEnvelope } from '$lib/server/hyperrag/packet-topology-envelope.js';

/**
 * Msgpack field tag assignments (compact encoding).
 * Tags 0–31 are fixed-map entries (1-byte overhead in msgpack).
 * Keep high-cardinality fields first for better compression.
 */
export enum PacketMsgpackTags {
  packet_key = 0,
  packet_id = 1,
  packet_ulid = 2,
  title_id = 3,
  feature_id = 4,
  source_ref = 5,
  directory_path = 6,
  som_row = 7,
  som_col = 8,
  som_cluster = 9,
  community_id = 10,
  kmeans_cluster_id = 11,
  latent_64 = 12,
  manifold_4d = 13,
  qdrant_point_id = 14,
  neo4j_neighbors = 15,
  page_rank_score = 16,
  summary = 17,
  lexical_nouns = 18,
  lexical_verbs = 19,
  lexical_adverbs_ly = 20,
  routing_hints = 21,
  used_concepts = 22,
  supersedes = 23,
  superseded_by = 24,
  created_at = 25,
  updated_at = 26,
  confidence = 27,
  extraction_method = 28,
  provenance = 29,
}

/**
 * Encode PacketTopologyEnvelope to transport bytes.
 *
 * TODO: replace the JSON fallback with a real msgpack encoder once the
 * workspace dependency is promoted into this package boundary.
 */
export function encodePacketToMsgpack(envelope: PacketTopologyEnvelope): Uint8Array {
  const obj: Record<number, unknown> = {};

  // Always encode identity fields
  obj[PacketMsgpackTags.packet_key] = envelope.packet_key;
  obj[PacketMsgpackTags.packet_id] = envelope.packet_id;
  obj[PacketMsgpackTags.title_id] = envelope.title_id;
  obj[PacketMsgpackTags.feature_id] = envelope.feature_id;
  obj[PacketMsgpackTags.source_ref] = envelope.source_ref;
  obj[PacketMsgpackTags.created_at] = envelope.created_at;

  // Conditional: include only if present
  if (envelope.packet_ulid) obj[PacketMsgpackTags.packet_ulid] = envelope.packet_ulid;
  if (envelope.directory_path) obj[PacketMsgpackTags.directory_path] = envelope.directory_path;
  if (envelope.som_row !== undefined && envelope.som_row !== null) {
    obj[PacketMsgpackTags.som_row] = envelope.som_row;
  }
  if (envelope.som_col !== undefined && envelope.som_col !== null) {
    obj[PacketMsgpackTags.som_col] = envelope.som_col;
  }
  if (envelope.som_cluster) obj[PacketMsgpackTags.som_cluster] = envelope.som_cluster;
  if (envelope.community_id !== undefined && envelope.community_id !== null) {
    obj[PacketMsgpackTags.community_id] = envelope.community_id;
  }
  if (envelope.kmeans_cluster_id !== undefined && envelope.kmeans_cluster_id !== null) {
    obj[PacketMsgpackTags.kmeans_cluster_id] = envelope.kmeans_cluster_id;
  }
  if (envelope.latent_64) obj[PacketMsgpackTags.latent_64] = envelope.latent_64;
  if (envelope.manifold_4d) obj[PacketMsgpackTags.manifold_4d] = envelope.manifold_4d;
  if (envelope.qdrant_point_id) obj[PacketMsgpackTags.qdrant_point_id] = envelope.qdrant_point_id;
  if (envelope.neo4j_neighbors?.length) obj[PacketMsgpackTags.neo4j_neighbors] = envelope.neo4j_neighbors;
  if (envelope.page_rank_score !== undefined && envelope.page_rank_score !== null) {
    obj[PacketMsgpackTags.page_rank_score] = envelope.page_rank_score;
  }
  if (envelope.summary) obj[PacketMsgpackTags.summary] = envelope.summary;
  if (envelope.lexical_nouns?.length) obj[PacketMsgpackTags.lexical_nouns] = envelope.lexical_nouns;
  if (envelope.lexical_verbs?.length) obj[PacketMsgpackTags.lexical_verbs] = envelope.lexical_verbs;
  if (envelope.lexical_adverbs_ly?.length) {
    obj[PacketMsgpackTags.lexical_adverbs_ly] = envelope.lexical_adverbs_ly;
  }
  if (envelope.routing_hints?.length) obj[PacketMsgpackTags.routing_hints] = envelope.routing_hints;
  if (envelope.used_concepts?.length) obj[PacketMsgpackTags.used_concepts] = envelope.used_concepts;
  if (envelope.supersedes?.length) obj[PacketMsgpackTags.supersedes] = envelope.supersedes;
  if (envelope.superseded_by) obj[PacketMsgpackTags.superseded_by] = envelope.superseded_by;
  if (envelope.updated_at) obj[PacketMsgpackTags.updated_at] = envelope.updated_at;
  if (envelope.confidence !== undefined && envelope.confidence !== null) {
    obj[PacketMsgpackTags.confidence] = envelope.confidence;
  }
  if (envelope.extraction_method) obj[PacketMsgpackTags.extraction_method] = envelope.extraction_method;
  if (envelope.provenance) obj[PacketMsgpackTags.provenance] = envelope.provenance;

  return encode(obj);
}

/**
 * Decode transport bytes back to PacketTopologyEnvelope.
 */
export function decodePacketFromMsgpack(bytes: Uint8Array): Record<string, unknown> {
  try {
    return decode(bytes) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to decode msgpack: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Batch encode packets for streaming (e.g., SSE payload).
 * Returns newline-delimited transport frames.
 */
export function encodePacketBatchToNdjsonMsgpack(envelopes: PacketTopologyEnvelope[]): string {
  return envelopes
    .map((env) => {
      const bytes = encodePacketToMsgpack(env);
      // Base64-encode for safe transmission in newline-delimited format
      return Buffer.from(bytes).toString('base64');
    })
    .join('\n');
}

/**
 * Batch decode newline-delimited transport frames.
 */
export function decodePacketBatchFromNdjsonMsgpack(ndjson: string): Record<string, unknown>[] {
  return ndjson
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        const bytes = Buffer.from(line, 'base64');
        return decodePacketFromMsgpack(bytes);
      } catch (err) {
        console.error(`Failed to decode msgpack line: ${err}`);
        return null;
      }
    })
    .filter((x) => x !== null) as Record<string, unknown>[];
}

/**
 * Size comparison utility for msgpack vs JSON.
 */
export function compareEncodingSizes(envelope: PacketTopologyEnvelope): {
  json_bytes: number;
  msgpack_estimate: number;
  compression_ratio: number;
} {
  const jsonStr = JSON.stringify(envelope);
  const jsonBytes = new TextEncoder().encode(jsonStr).length;
  const msgpackBytes = encodePacketToMsgpack(envelope).length;

  return {
    json_bytes: jsonBytes,
    msgpack_estimate: msgpackBytes,
    compression_ratio: msgpackBytes / jsonBytes,
  };
}
