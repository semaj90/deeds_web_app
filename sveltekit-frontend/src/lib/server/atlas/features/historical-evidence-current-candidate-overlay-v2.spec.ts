// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  assertCurrentCandidateIndexV2,
  historicalEvidenceOverlaySetChecksumV2,
  resolveHistoricalEvidenceToCandidates,
  verifyHistoricalEvidenceOverlayV2,
  type CurrentCandidateIndexV2,
  type HistoricalEvidenceInputV2,
} from './historical-evidence-current-candidate-overlay-v2.js';

const SNAP = 'sha256:' + 'a'.repeat(64);
const MAP = 'b'.repeat(64);
const coords = { candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP };

// Ordinals deliberately NOT in sourceRef order, and candidate 2 has two chunks, candidate 5 has none.
const index: CurrentCandidateIndexV2 = {
  ...coords,
  candidates: [
    { candidateOrdinal: 0, packetKey: 'packet:z', sourceRef: 'src/z.ts', sourceRevision: 'sha256:z1' },
    { candidateOrdinal: 2, packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:a1' },
    { candidateOrdinal: 5, packetKey: 'packet:n', sourceRef: 'src/n.ts', sourceRevision: 'sha256:n1' },
  ],
  memberships: [
    { candidateOrdinal: 2, chunkRowId: 'row-b', canonicalChunkId: 'chunk:a:1' },
    { candidateOrdinal: 0, chunkRowId: 'row-z', canonicalChunkId: 'chunk:z:0' },
    { candidateOrdinal: 2, chunkRowId: 'row-a', canonicalChunkId: 'chunk:a:0' },
  ],
};

const base = (over: Partial<HistoricalEvidenceInputV2>): HistoricalEvidenceInputV2 => ({
  evidenceId: 'e1', evidenceKind: 'LEGACY_SUMMARY_HINT', evidenceGranularity: 'CHUNK',
  historicalArtifactRevision: 'sha256:art', historicalEvidenceDigest: 'sha256:ev',
  sourceRef: 'src/a.ts', sourceRevision: 'sha256:a1',
  chunk: { chunkRowId: 'row-a', canonicalChunkId: 'chunk:a:0', packetKey: 'packet:a' }, ...over,
});

describe('historical evidence current-candidate overlay v2', () => {
  it('index is internally consistent', () => expect(() => assertCurrentCandidateIndexV2(index)).not.toThrow());

  it('chunk-grained evidence + exact lineage -> EXACT_CHUNK with the packet ordinal (not a row index)', () => {
    const o = resolveHistoricalEvidenceToCandidates(base({}), index);
    expect(o.resolution.state).toBe('EXACT_CHUNK');
    expect(o.resolution.candidateOrdinals).toEqual([2]);
    expect(o.resolution.chunkRowIds).toEqual(['row-a']);
    expect(o.canonicalAuthority).toBe(false);
    expect(o.retrievalVote).toBe(false);
    verifyHistoricalEvidenceOverlayV2(o, coords);
  });

  it('file-grained evidence -> CURRENT_CHUNK_SET, one-to-many, deterministically ordered', () => {
    const o = resolveHistoricalEvidenceToCandidates(base({ evidenceKind: 'MAPREDUCE_RECORD', evidenceGranularity: 'FILE', chunk: null }), index);
    expect(o.resolution.state).toBe('CURRENT_CHUNK_SET');
    expect(o.resolution.memberships.map((m) => m.chunkRowId)).toEqual(['row-a', 'row-b']);
    expect(o.resolution.candidateOrdinals).toEqual([2]);
    verifyHistoricalEvidenceOverlayV2(o, coords);
  });

  it('set ordering is independent of input order and de-duplicates before checksumming', () => {
    const reversed: CurrentCandidateIndexV2 = { ...index, memberships: [...index.memberships, ...index.memberships].reverse() };
    const ev = base({ evidenceGranularity: 'FILE', chunk: null });
    expect(resolveHistoricalEvidenceToCandidates(ev, reversed).overlayChecksum).toBe(resolveHistoricalEvidenceToCandidates(ev, index).overlayChecksum);
  });

  it('stale revision -> SOURCE_REVISION_CHANGED', () => {
    expect(resolveHistoricalEvidenceToCandidates(base({ sourceRevision: 'sha256:old' }), index).resolution.state).toBe('SOURCE_REVISION_CHANGED');
  });
  it('no packet -> CURRENT_PACKET_NOT_FOUND', () => {
    expect(resolveHistoricalEvidenceToCandidates(base({ sourceRef: 'src/gone.ts' }), index).resolution.state).toBe('CURRENT_PACKET_NOT_FOUND');
  });
  it('packet without proven lineage -> CURRENT_PROVEN_LINEAGE_MISSING (file and chunk grain)', () => {
    const file = base({ sourceRef: 'src/n.ts', sourceRevision: 'sha256:n1', evidenceGranularity: 'FILE', chunk: null });
    expect(resolveHistoricalEvidenceToCandidates(file, index).resolution.state).toBe('CURRENT_PROVEN_LINEAGE_MISSING');
    expect(resolveHistoricalEvidenceToCandidates(base({ chunk: { chunkRowId: 'row-x', canonicalChunkId: 'chunk:a:9', packetKey: 'packet:a' } }), index).resolution.state).toBe('CURRENT_PROVEN_LINEAGE_MISSING');
  });
  it('wrong packetKey for an exact chunk never matches', () => {
    const o = resolveHistoricalEvidenceToCandidates(base({ chunk: { chunkRowId: 'row-a', canonicalChunkId: 'chunk:a:0', packetKey: 'packet:other' } }), index);
    expect(o.resolution.state).toBe('CURRENT_PROVEN_LINEAGE_MISSING');
  });
  it('insufficient identity is classified, never inferred', () => {
    expect(resolveHistoricalEvidenceToCandidates(base({ sourceRevision: null }), index).resolution.state).toBe('HISTORICAL_IDENTITY_INSUFFICIENT');
    expect(resolveHistoricalEvidenceToCandidates(base({ chunk: null }), index).resolution.state).toBe('HISTORICAL_IDENTITY_INSUFFICIENT');
  });
  it('duplicate historical evidence resolves to nothing and records its origin', () => {
    const o = resolveHistoricalEvidenceToCandidates(base({ duplicateOfEvidenceId: 'e0' }), index);
    expect(o.resolution.state).toBe('DUPLICATE_HISTORICAL_EVIDENCE');
    expect(o.resolution.duplicateOfEvidenceId).toBe('e0');
    expect(o.resolution.memberships).toEqual([]);
  });

  it('rejects wrong snapshot and wrong ordinal-map checksum', () => {
    const o = resolveHistoricalEvidenceToCandidates(base({}), index);
    expect(() => verifyHistoricalEvidenceOverlayV2(o, { ...coords, candidateSnapshotRevision: 'sha256:' + 'c'.repeat(64) })).toThrow('HIST_OVERLAY_SNAPSHOT_MISMATCH');
    expect(() => verifyHistoricalEvidenceOverlayV2(o, { ...coords, ordinalMapChecksum: 'd'.repeat(64) })).toThrow('HIST_OVERLAY_ORDINAL_MAP_MISMATCH');
  });

  it('rejects tampering: checksum, ordering, derived views, authority, granularity upgrade', () => {
    const o = resolveHistoricalEvidenceToCandidates(base({ evidenceGranularity: 'FILE', chunk: null }), index);
    const clone = () => JSON.parse(JSON.stringify(o));
    const t1 = clone(); t1.resolution.memberships[0].chunkRowId = 'row-evil';
    expect(() => verifyHistoricalEvidenceOverlayV2(t1, coords)).toThrow();
    const t2 = clone(); t2.resolution.memberships.reverse();
    expect(() => verifyHistoricalEvidenceOverlayV2(t2, coords)).toThrow('HIST_OVERLAY_MEMBERSHIP_ORDER_OR_DUPLICATE');
    const t3 = clone(); t3.resolution.candidateOrdinals = [99];
    expect(() => verifyHistoricalEvidenceOverlayV2(t3, coords)).toThrow('HIST_OVERLAY_DERIVED_VIEW_MISMATCH');
    const t4 = clone(); t4.canonicalAuthority = true;
    expect(() => verifyHistoricalEvidenceOverlayV2(t4, coords)).toThrow('HIST_OVERLAY_AUTHORITY_UPGRADE_REJECTED');
    const t5 = clone(); t5.evidenceGranularity = 'CHUNK';
    expect(() => verifyHistoricalEvidenceOverlayV2(t5, coords)).toThrow('HIST_OVERLAY_CHUNK_GRANULARITY_UPGRADE_REJECTED');
    const t6 = clone(); t6.overlayChecksum = 'sha256:' + '0'.repeat(64);
    expect(() => verifyHistoricalEvidenceOverlayV2(t6, coords)).toThrow('HIST_OVERLAY_CHECKSUM_MISMATCH');
  });

  it('set checksum is order independent', () => {
    const a = resolveHistoricalEvidenceToCandidates(base({ evidenceId: 'a' }), index);
    const b = resolveHistoricalEvidenceToCandidates(base({ evidenceId: 'b', sourceRef: 'src/z.ts', sourceRevision: 'sha256:z1', chunk: { chunkRowId: 'row-z', canonicalChunkId: 'chunk:z:0', packetKey: 'packet:z' } }), index);
    expect(historicalEvidenceOverlaySetChecksumV2([a, b])).toBe(historicalEvidenceOverlaySetChecksumV2([b, a]));
  });

  it('rejects an inconsistent index (orphan membership, duplicate ordinal)', () => {
    expect(() => assertCurrentCandidateIndexV2({ ...index, memberships: [{ candidateOrdinal: 9, chunkRowId: 'r', canonicalChunkId: 'c' }] })).toThrow('HIST_OVERLAY_INDEX_MEMBERSHIP_ORPHAN');
    expect(() => assertCurrentCandidateIndexV2({ ...index, candidates: [index.candidates[0]!, index.candidates[0]!] })).toThrow('HIST_OVERLAY_INDEX_DUPLICATE_ORDINAL');
  });
});
