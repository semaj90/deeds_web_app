import { describe, expect, it } from 'vitest';
import {
  PacketChunkMembershipV1Schema,
  toAtlasPacketChunkLineageRow,
} from './packet-chunk-membership-v1.js';

const validBase = {
  schema: 'atlas.packet-chunk-membership.v1' as const,
  packetKey: 'packet:11fc3e3cc2d0',
  canonicalChunkId: 'card:src/lib/gpu/gpu-compute-pipeline.ts:0852bd8c141bccf6',
  chunkRowId: '0000d635-8df8-4a03-a1b0-e33d2699f6c0',
  sourceRef: 'src/lib/gpu/gpu-compute-pipeline.ts',
  sourceNamespace: 'workspace:sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9',
  chunkOrdinal: 0,
  lineageProducerRevision: 'packet-chunk-lineage-backfill:v1',
  evidenceRefs: ['docs/reports/packet-chunk-lineage-backfill-canary-01-results.json'],
};

describe('PacketChunkMembershipV1Schema', () => {
  it('accepts a proven, revision-proven membership', () => {
    const result = PacketChunkMembershipV1Schema.safeParse({
      ...validBase,
      sourceRevision: 'sha256:5b13...',
      membershipStatus: 'EXACT_MULTI_MEMBER',
      revisionStatus: 'PROVEN',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a proven membership with an honestly UNPROVEN revision (the expected common case for legacy data)', () => {
    const result = PacketChunkMembershipV1Schema.safeParse({
      ...validBase,
      sourceRevision: null,
      membershipStatus: 'EXACT_SINGLE_MEMBER',
      revisionStatus: 'UNPROVEN',
    });
    expect(result.success).toBe(true);
  });

  it('rejects revisionStatus=PROVEN with a null sourceRevision (no synthesized revision permitted)', () => {
    const result = PacketChunkMembershipV1Schema.safeParse({
      ...validBase,
      sourceRevision: null,
      membershipStatus: 'EXACT_SINGLE_MEMBER',
      revisionStatus: 'PROVEN',
    });
    expect(result.success).toBe(false);
  });

  it('rejects revisionStatus=UNPROVEN with a non-null sourceRevision (status/value must agree)', () => {
    const result = PacketChunkMembershipV1Schema.safeParse({
      ...validBase,
      sourceRevision: 'sha256:5b13...',
      membershipStatus: 'EXACT_SINGLE_MEMBER',
      revisionStatus: 'UNPROVEN',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing sourceNamespace -- no row is admissible without proven namespace', () => {
    const result = PacketChunkMembershipV1Schema.safeParse({
      ...validBase,
      sourceNamespace: '',
      sourceRevision: null,
      membershipStatus: 'EXACT_SINGLE_MEMBER',
      revisionStatus: 'UNPROVEN',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an AMBIGUOUS-shaped status -- this table only represents proven membership, not candidates', () => {
    const result = PacketChunkMembershipV1Schema.safeParse({
      ...validBase,
      sourceRevision: null,
      membershipStatus: 'AMBIGUOUS',
      revisionStatus: 'UNPROVEN',
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (.strict())', () => {
    const result = PacketChunkMembershipV1Schema.safeParse({
      ...validBase,
      sourceRevision: null,
      membershipStatus: 'EXACT_SINGLE_MEMBER',
      revisionStatus: 'UNPROVEN',
      confidence: 0.97,
    });
    expect(result.success).toBe(false);
  });

  it('toAtlasPacketChunkLineageRow maps camelCase to the snake_case relation shape 1:1', () => {
    const membership = PacketChunkMembershipV1Schema.parse({
      ...validBase,
      sourceRevision: null,
      membershipStatus: 'EXACT_MULTI_MEMBER',
      revisionStatus: 'UNPROVEN',
    });
    const row = toAtlasPacketChunkLineageRow(membership, '2026-09-01T00:00:00.000Z');
    expect(row).toEqual({
      packet_key: validBase.packetKey,
      canonical_chunk_id: validBase.canonicalChunkId,
      chunk_row_id: validBase.chunkRowId,
      source_ref: validBase.sourceRef,
      source_namespace: validBase.sourceNamespace,
      source_revision: null,
      membership_status: 'EXACT_MULTI_MEMBER',
      revision_status: 'UNPROVEN',
      chunk_ordinal: validBase.chunkOrdinal,
      lineage_producer_revision: validBase.lineageProducerRevision,
      evidence_refs: validBase.evidenceRefs,
      created_at: '2026-09-01T00:00:00.000Z',
    });
  });
});
