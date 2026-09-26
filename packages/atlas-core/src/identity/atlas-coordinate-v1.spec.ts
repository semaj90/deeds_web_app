import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_ELIGIBILITY_V1,
  assertChunkEvidenceCoordinateV1,
  atlasCoordinateV1Schema,
  chunkEvidenceCoordinateV1Schema,
  packetEvidenceCoordinateV1Schema,
  satisfiesEvidenceEligibilityV1,
  toPacketEvidenceCoordinateV1,
  type ChunkEvidenceCoordinateV1,
  type EvidenceEligibilityV1,
  type PacketEvidenceCoordinateV1,
  type RequiredEvidenceEligibilityV1,
} from './atlas-coordinate-v1.js';

const base = {
  workspaceRevision: 'sha256:' + 'a'.repeat(64),
  candidateSnapshotRevision: 'sha256:' + 'b'.repeat(64),
  ordinalMapChecksum: 'c'.repeat(64),
  coordinateArtifactChecksum: 'sha256:' + 'd'.repeat(64),
};
const packet: PacketEvidenceCoordinateV1 = { ...base, packetKey: 'packet:1' };
const chunk: ChunkEvidenceCoordinateV1 = {
  ...packet, canonicalChunkId: 'chunk:1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:' + 'e'.repeat(64),
  chunkLineageRevision: 'lineage:1', lineageBindingChecksum: 'sha256:' + 'f'.repeat(64),
};

describe('AtlasCoordinateV1', () => {
  it('requires all four coordinate fields and stays strict', () => {
    expect(atlasCoordinateV1Schema.safeParse(base).success).toBe(true);
    for (const k of Object.keys(base)) {
      const { [k as keyof typeof base]: _omit, ...rest } = base;
      expect(atlasCoordinateV1Schema.safeParse(rest).success).toBe(false);
      expect(atlasCoordinateV1Schema.safeParse({ ...base, [k]: '' }).success).toBe(false);
    }
    expect(atlasCoordinateV1Schema.safeParse({ ...base, packet_id: 'x' }).success).toBe(false);
  });
  it('accepts optional revision fields but does not normalize opaque values', () => {
    const c = atlasCoordinateV1Schema.parse({ ...base, graphRevision: 'g1', featureRevision: 'f1', representationId: 'semantic_768', representationRevision: 'r1' });
    expect(c.ordinalMapChecksum).toBe('c'.repeat(64)); // bare hex kept as given, not prefixed
    expect(c.candidateSnapshotRevision.startsWith('sha256:')).toBe(true);
  });
});

describe('Packet vs chunk evidence coordinates', () => {
  it('a packet coordinate is not a chunk coordinate (runtime)', () => {
    expect(packetEvidenceCoordinateV1Schema.safeParse(packet).success).toBe(true);
    expect(chunkEvidenceCoordinateV1Schema.safeParse(packet).success).toBe(false);
    expect(() => assertChunkEvidenceCoordinateV1(packet)).toThrow('CHUNK_EVIDENCE_COORDINATE_REQUIRED');
    expect(() => assertChunkEvidenceCoordinateV1({ packetKey: 'packet:1' })).toThrow('CHUNK_EVIDENCE_COORDINATE_REQUIRED');
  });
  it('a packet coordinate is not assignable where a chunk coordinate is required (compile time)', () => {
    const needsChunk = (_c: ChunkEvidenceCoordinateV1) => true;
    // @ts-expect-error a packet-only coordinate must not satisfy a chunk-derived feature input
    needsChunk(packet);
    // @ts-expect-error a bare packet key must not either
    needsChunk({ packetKey: 'packet:1' });
    expect(needsChunk(chunk)).toBe(true);
  });
  it('every chunk lineage field is individually required, and storage locators are rejected', () => {
    for (const k of ['canonicalChunkId', 'sourceRef', 'sourceRevision', 'chunkLineageRevision', 'lineageBindingChecksum', 'packetKey'] as const) {
      const { [k]: _omit, ...rest } = chunk;
      expect(chunkEvidenceCoordinateV1Schema.safeParse(rest).success).toBe(false);
    }
    expect(chunkEvidenceCoordinateV1Schema.safeParse({ ...chunk, chunk_row_id: 7 }).success).toBe(false);
    expect(chunkEvidenceCoordinateV1Schema.safeParse({ ...chunk, packet_id: 'x' }).success).toBe(false);
    expect(chunkEvidenceCoordinateV1Schema.safeParse({ ...chunk, qdrantPointId: 9 }).success).toBe(false);
  });
  it('a chunk coordinate projects to a valid packet coordinate, never the reverse', () => {
    // sourceRevision is a legitimate optional field of the base coordinate, so the projection keeps it; only chunk-only fields are dropped
    expect(toPacketEvidenceCoordinateV1(chunk)).toEqual({ ...packet, sourceRevision: chunk.sourceRevision });
    expect(assertChunkEvidenceCoordinateV1(chunk)).toEqual(chunk);
  });
});

describe('Evidence eligibility', () => {
  const required: RequiredEvidenceEligibilityV1[] = ['PACKET_REVISION_QUALIFIED', 'CHUNK_REVISION_QUALIFIED', 'SYMBOL_REVISION_QUALIFIED'];
  it('full satisfaction matrix', () => {
    const expected: Record<EvidenceEligibilityV1, RequiredEvidenceEligibilityV1[]> = {
      PACKET_REVISION_QUALIFIED: ['PACKET_REVISION_QUALIFIED'],
      CHUNK_REVISION_QUALIFIED: ['PACKET_REVISION_QUALIFIED', 'CHUNK_REVISION_QUALIFIED'],
      SYMBOL_REVISION_QUALIFIED: ['SYMBOL_REVISION_QUALIFIED'],
      SOURCE_GROUP_ONLY: [],
      DEGRADED: [],
      INELIGIBLE: [],
    };
    for (const actual of EVIDENCE_ELIGIBILITY_V1) {
      const got = required.filter((r) => satisfiesEvidenceEligibilityV1(actual, r));
      expect(got).toEqual(expected[actual]);
    }
  });
  it('the motivating rule: an exact packet match never satisfies a chunk-derived feature', () => {
    expect(satisfiesEvidenceEligibilityV1('PACKET_REVISION_QUALIFIED', 'CHUNK_REVISION_QUALIFIED')).toBe(false);
    expect(satisfiesEvidenceEligibilityV1('PACKET_REVISION_QUALIFIED', 'PACKET_REVISION_QUALIFIED')).toBe(true);
  });
});
