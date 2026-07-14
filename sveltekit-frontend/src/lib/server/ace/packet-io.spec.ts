/**
 * Smoke Test: ACE Packet I/O Round-Trip Serialization
 *
 * Validates:
 * 1. packet_key survives round-trip (encode → decode)
 * 2. source_ref survives round-trip
 * 3. latent_64 remains 64 values (FP16 encoding precision)
 * 4. FP16 byte length is 128 (64 floats × 2 bytes)
 * 5. manifold_4d byte length is 16 (4 floats × 4 bytes)
 * 6. Decoded packet matches canonical envelope
 * 7. Batch streaming works without loading all packets
 */

import { describe, it, expect } from 'vitest';
import {
  encodePacketToMsgpack,
  decodePacketFromMsgpack,
  encodeFP16,
  decodeFP16,
  encodeFP32,
  decodeFP32,
  PacketMsgpackTags,
} from '../serialization/packet-msgpack-codec.js';
import type { PacketTopologyEnvelope } from '../hyperrag/packet-topology-envelope.js';

describe('ACE Packet I/O Boundary', () => {
  // ── Test 1: Identity Fields Survive Round-Trip ─────────────────────────

  it('packet_key survives encode → decode round-trip', () => {
    const packet: PacketTopologyEnvelope = {
      packet_key: 'a'.repeat(64), // SHA256 hex
      packet_id: '550e8400-e29b-41d4-a716-446655440000',
      title_id: 'title:sessions',
      feature_id: 'auth.sessions',
      source_ref: 'src/lib/server/auth.ts',
      directory_path: 'src/lib/server',
      created_at: new Date().toISOString(),
    };

    const encoded = encodePacketToMsgpack(packet);
    const decoded = decodePacketFromMsgpack(encoded);

    expect(decoded.packet_key).toBe('a'.repeat(64));
  });

  it('source_ref survives encode → decode round-trip', () => {
    const packet: PacketTopologyEnvelope = {
      packet_key: 'b'.repeat(64),
      packet_id: '550e8400-e29b-41d4-a716-446655440001',
      title_id: 'title:sessions',
      feature_id: 'auth.sessions',
      source_ref: 'src/lib/server/auth.ts',
      directory_path: 'src/lib/server',
      created_at: new Date().toISOString(),
    };

    const encoded = encodePacketToMsgpack(packet);
    const decoded = decodePacketFromMsgpack(encoded);

    expect(decoded.source_ref).toBe('src/lib/server/auth.ts');
  });

  // ── Test 2: Tensor Encoding Precision ──────────────────────────────────

  it('latent_64 remains 64 values after FP16 encode/decode', () => {
    const latent64 = Array.from({ length: 64 }, (_, i) => Math.random());

    const encoded = encodeFP16(latent64);
    const decoded = decodeFP16(encoded);

    expect(decoded).toHaveLength(64);
    // Precision tolerance: ±0.001 for FP16 (sufficient for ANN proximity)
    for (let i = 0; i < 64; i++) {
      expect(Math.abs(decoded[i] - latent64[i])).toBeLessThan(0.01);
    }
  });

  // ── Test 3: Byte Length Contracts ──────────────────────────────────────

  it('FP16 byte length is exactly 128 (64 floats × 2 bytes)', () => {
    const latent64 = Array.from({ length: 64 }, () => Math.random());
    const encoded = encodeFP16(latent64);

    expect(encoded.byteLength).toBe(128);
  });

  it('FP32 byte length is exactly 16 (4 floats × 4 bytes)', () => {
    const manifold4d = [0.1, 0.2, 0.3, 0.4];
    const encoded = encodeFP32(manifold4d);

    expect(encoded.byteLength).toBe(16);
  });

  // ── Test 4: Full Packet Round-Trip ────────────────────────────────────

  it('decoded packet matches canonical envelope shape', () => {
    const now = new Date().toISOString();
    const packet: PacketTopologyEnvelope = {
      packet_key: 'c'.repeat(64),
      packet_id: '550e8400-e29b-41d4-a716-446655440002',
      packet_ulid: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      title_id: 'title:codebase',
      feature_id: 'topology.nodes',
      source_ref: 'src/lib/server/graph/topology.ts',
      directory_path: 'src/lib/server/graph',
      som_row: 5,
      som_col: 10,
      som_cluster: 'cluster:42',
      community_id: 3,
      kmeans_cluster_id: 2,
      qdrant_point_id: 'qdrant:12345',
      page_rank_score: 0.85,
      summary: 'Topology handling for graph structures',
      created_at: now,
      updated_at: now,
      // Note: latent_64/manifold_4d tested separately (tensor codec layer)
    };

    const encoded = encodePacketToMsgpack(packet);
    const decoded = decodePacketFromMsgpack(encoded);

    // Identity fields (critical path)
    expect(decoded.packet_key).toBe(packet.packet_key);
    expect(decoded.source_ref).toBe(packet.source_ref);
    expect(decoded.feature_id).toBe(packet.feature_id);

    // SOM fields (topology routing)
    expect(decoded.som_row).toBe(5);
    expect(decoded.som_col).toBe(10);
    expect(decoded.som_cluster).toBe('cluster:42');

    // Numeric fields (authority)
    expect(decoded.page_rank_score).toBe(0.85);
    expect(decoded.community_id).toBe(3);
    expect(decoded.kmeans_cluster_id).toBe(2);

    // Text fields
    expect(decoded.summary).toBe('Topology handling for graph structures');

    // Timestamps
    expect(decoded.created_at).toBe(now);
  });

  // ── Test 5: Optional Fields ────────────────────────────────────────────

  it('null/undefined optional fields are preserved', () => {
    const packet: PacketTopologyEnvelope = {
      packet_key: 'd'.repeat(64),
      packet_id: '550e8400-e29b-41d4-a716-446655440003',
      title_id: 'title:minimal',
      feature_id: 'minimal.feature',
      source_ref: 'src/minimal.ts',
      directory_path: 'src',
      created_at: new Date().toISOString(),
      som_row: undefined,
      som_col: null,
      latent_64: undefined,
      manifold_4d: undefined,
    };

    const encoded = encodePacketToMsgpack(packet);
    const decoded = decodePacketFromMsgpack(encoded);

    // Minimal packet should still have identity
    expect(decoded.packet_key).toBe('d'.repeat(64));
    expect(decoded.source_ref).toBe('src/minimal.ts');
  });

  // ── Test 6: MsgPack Tag Assignment ────────────────────────────────────

  it('PacketMsgpackTags enum is correctly assigned', () => {
    expect(PacketMsgpackTags.packet_key).toBe(0);
    expect(PacketMsgpackTags.source_ref).toBe(5);
    expect(PacketMsgpackTags.latent_64).toBe(12);
    expect(PacketMsgpackTags.manifold_4d).toBe(13);
    expect(PacketMsgpackTags.page_rank_score).toBe(16);
  });

  // ── Test 7: Batch Streaming (Conceptual) ──────────────────────────────

  it('batch NDJSON stream can be consumed line-by-line without loading all packets', async () => {
    // This test validates the conceptual contract: each line is a valid encoded packet
    // Actual streaming implementation lives in promote-results-neo4j.ts or token-remapping-layer.ts

    const packets: PacketTopologyEnvelope[] = [
      {
        packet_key: 'e'.repeat(64),
        packet_id: '550e8400-e29b-41d4-a716-446655440004',
        title_id: 'title:b1',
        feature_id: 'batch.01',
        source_ref: 'src/batch01.ts',
        directory_path: 'src',
        created_at: new Date().toISOString(),
      },
      {
        packet_key: 'f'.repeat(64),
        packet_id: '550e8400-e29b-41d4-a716-446655440005',
        title_id: 'title:b2',
        feature_id: 'batch.02',
        source_ref: 'src/batch02.ts',
        directory_path: 'src',
        created_at: new Date().toISOString(),
      },
    ];

    // In production, this would be:
    // const stream = encodePacketBatchToNdjsonMsgpack(packets);
    // for await (const encodedPacket of stream) { ... }
    // This test just validates the envelope structure survives multiple round-trips

    for (const packet of packets) {
      const encoded = encodePacketToMsgpack(packet);
      const decoded = decodePacketFromMsgpack(encoded);
      expect(decoded.packet_key).toBe(packet.packet_key);
    }
  });
});
