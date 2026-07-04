/**
 * Packet Msgpack Codec
 *
 * Binary transport codec for PacketTopologyEnvelope handoffs.
 * Uses @msgpack/msgpack for compact binary serialization.
 * Fixed-tag enum (0–31) encodes identity fields first for better compression.
 *
 * Format rules (Packet Identity OS):
 *   latent_64  → FP16 tensor → raw bytes in BYTEA / Uint8Array (tag 12)
 *   manifold_4d → FP32 tensor → 4×4 bytes (tag 13)
 *   envelope fields → MsgPack binary (never JSON for binary store)
 *   SSE / NDJSON crossing → Base64 wrapper around MsgPack bytes
 *   Hex → hashes and debug previews only, never full vectors
 */

import { encode, decode } from '@msgpack/msgpack';
import {
  type PacketTopologyEnvelope,
  coerceToPacketEnvelope,
} from '$lib/server/hyperrag/packet-topology-envelope.js';

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

// ── Tensor precision helpers ──────────────────────────────────────────────────

/**
 * Encode a float array as FP16 raw bytes (2 bytes per value).
 * latent_64 is stored as FP16 → 128 bytes instead of 256 (FP32) or 512 (JSON).
 * Precision: ±0.001 — sufficient for SOM/ANN retrieval proximity.
 */
export function encodeFP16(values: number[]): Uint8Array {
  const buf = new Uint8Array(values.length * 2);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setUint16(i * 2, floatToFP16(values[i]), true); // little-endian
  }
  return buf;
}

/** Decode FP16 raw bytes back to float array. */
export function decodeFP16(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: number[] = new Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = fp16ToFloat(view.getUint16(i * 2, true));
  }
  return out;
}

/**
 * Encode a float array as FP32 raw bytes (4 bytes per value).
 * manifold_4d uses FP32 to preserve coordinate precision.
 */
export function encodeFP32(values: number[]): Uint8Array {
  const buf = new Float32Array(values);
  return new Uint8Array(buf.buffer);
}

/** Decode FP32 raw bytes back to float array. */
export function decodeFP32(bytes: Uint8Array): number[] {
  const view = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return Array.from(view);
}

// IEEE 754 FP16 ↔ float32 conversion (no external dependency)
function floatToFP16(v: number): number {
  const f = new Float32Array([v]);
  const b = new Uint32Array(f.buffer)[0];
  const sign = (b >>> 16) & 0x8000;
  const exp  = ((b >>> 23) & 0xff) - 127 + 15;
  const mant = b & 0x7fffff;
  if (exp <= 0)  return sign; // underflow → ±0
  if (exp >= 31) return sign | 0x7c00 | (mant ? 0x200 : 0); // overflow → ±inf/nan
  return sign | (exp << 10) | (mant >>> 13);
}

function fp16ToFloat(h: number): number {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp  = (h >>> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0)  return sign * Math.pow(2, -14) * (mant / 1024);
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

// ── Encode ────────────────────────────────────────────────────────────────────

/**
 * Encode PacketTopologyEnvelope to canonical MsgPack transport bytes.
 *
 * Tensor encoding:
 *   latent_64   → FP16 bytes (128 B) stored as MsgPack bin (tag 12)
 *   manifold_4d → FP32 bytes (16 B) stored as MsgPack bin (tag 13)
 *
 * All other fields: standard MsgPack types (str, int, float, array, map).
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

  // latent_64: FP32[] → FP16 raw bytes (half the wire size)
  if (envelope.latent_64?.length === 64) {
    obj[PacketMsgpackTags.latent_64] = encodeFP16(envelope.latent_64);
  }

  // manifold_4d: {x,y,z,t} → FP32 bytes [x, y, z, t_numeric]
  if (envelope.manifold_4d) {
    const t = typeof envelope.manifold_4d.t === 'number'
      ? envelope.manifold_4d.t
      : new Date(envelope.manifold_4d.t as string).getTime() / 1000;
    obj[PacketMsgpackTags.manifold_4d] = encodeFP32([
      envelope.manifold_4d.x,
      envelope.manifold_4d.y,
      envelope.manifold_4d.z,
      t,
    ]);
  }

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

// ── Decode ────────────────────────────────────────────────────────────────────

/**
 * Expand integer-tagged msgpack object → field-named partial envelope.
 * Handles FP16 (latent_64) and FP32 (manifold_4d) tensor byte buffers inline.
 * Explicit map mirrors PacketMsgpackTags enum — no enum reflection at runtime.
 */
function expandTaggedPacket(obj: Record<number | string, unknown>): Record<string, unknown> {
  const lat = obj[12];
  const man = obj[13];

  const latent_64 = lat instanceof Uint8Array ? decodeFP16(lat) : lat;

  let manifold_4d = man;
  if (man instanceof Uint8Array) {
    const [x, y, z, t] = decodeFP32(man);
    manifold_4d = { x, y, z, t };
  }

  return {
    packet_key:        obj[0],
    packet_id:         obj[1],
    packet_ulid:       obj[2],
    title_id:          obj[3],
    feature_id:        obj[4],
    source_ref:        obj[5],
    directory_path:    obj[6],
    som_row:           obj[7],
    som_col:           obj[8],
    som_cluster:       obj[9],
    community_id:      obj[10],
    kmeans_cluster_id: obj[11],
    latent_64,
    manifold_4d,
    qdrant_point_id:   obj[14],
    neo4j_neighbors:   obj[15],
    page_rank_score:   obj[16],
    summary:           obj[17],
    lexical_nouns:     obj[18],
    lexical_verbs:     obj[19],
    lexical_adverbs_ly:obj[20],
    routing_hints:     obj[21],
    used_concepts:     obj[22],
    supersedes:        obj[23],
    superseded_by:     obj[24],
    created_at:        obj[25],
    updated_at:        obj[26],
    confidence:        obj[27],
    extraction_method: obj[28],
    provenance:        obj[29],
  };
}

/**
 * Decode MsgPack transport bytes → canonical PacketTopologyEnvelope.
 *
 * Tag expansion converts integer keys → field names, then coerceToPacketEnvelope
 * fills missing required fields with safe defaults and Zod-validates the shape.
 *
 * Tensor decode:
 *   tag 12 (latent_64)  : FP16 Uint8Array → number[] (64 floats, 128 bytes)
 *   tag 13 (manifold_4d): FP32 Uint8Array → {x,y,z,t} (16 bytes)
 */
export function decodePacketFromMsgpack(bytes: Uint8Array): PacketTopologyEnvelope {
  try {
    const raw = decode(bytes) as Record<number | string, unknown>;
    return coerceToPacketEnvelope(expandTaggedPacket(raw));
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
export function decodePacketBatchFromNdjsonMsgpack(ndjson: string): PacketTopologyEnvelope[] {
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
    .filter((x) => x !== null) as PacketTopologyEnvelope[];
}

/**
 * Size comparison utility for msgpack vs JSON.
 */
export function compareEncodingSizes(envelope: PacketTopologyEnvelope): {
  json_bytes: number;
  msgpack_bytes: number;
  compression_ratio: number;
} {
  const jsonStr = JSON.stringify(envelope);
  const jsonBytes = new TextEncoder().encode(jsonStr).length;
  const msgpackBytes = encodePacketToMsgpack(envelope).length;

  return {
    json_bytes: jsonBytes,
    msgpack_bytes: msgpackBytes,
    compression_ratio: msgpackBytes / jsonBytes,
  };
}
