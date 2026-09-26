// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { qualifyEvidenceV2, type CurrentSourceBindingV2, type IndexedChunkEvidenceV2, type PacketChunkMembershipV2, type PacketLineageIdentityV2 } from './lineage-qualification-v2.js';

const binding: CurrentSourceBindingV2 = { packetKey: 'packet:1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace', bindingChecksum: 'sha256:binding' };
const packet: PacketLineageIdentityV2 = { packetKey: 'packet:1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevisionMirror: null };
const membership: PacketChunkMembershipV2 = { packetKey: 'packet:1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', membershipStatus: 'EXACT_MULTI_MEMBER', revisionStatus: 'PROVEN', chunkRowId: 'row-1', canonicalChunkId: 'chunk-1', lineageProducerRevision: 'lineage-v1', lineageBindingChecksum: 'sha256:lineage' };
const chunk: IndexedChunkEvidenceV2 = { id: 'row-1', canonicalChunkId: 'chunk-1', sourceRef: 'src/a.ts', fileContentHash: 'source', sourceRevisionMirror: null, workspaceRevisionMirror: null, contentEmbeddingPresent: true, summaryTextPresent: true, summaryEmbeddingPresent: true, summaryEmbeddingAdmissionBound: false };
const run = (over: Partial<Parameters<typeof qualifyEvidenceV2>[0]> = {}) => qualifyEvidenceV2({ expectedWorkspaceRevision: binding.workspaceRevision, expectedMembershipStatus: 'EXACT_MULTI_MEMBER', expectedChunkRowId: 'row-1', expectedCanonicalChunkId: 'chunk-1', sourceBinding: binding, packet, memberships: [membership], indexedChunks: [chunk], ...over });

describe('qualifyEvidenceV2', () => {
  it('qualifies through exact source binding, proven membership and exact chunk row; null mirrors are diagnostic only', () => {
    const result = run();
    expect(result.packetState).toBe('PACKET_REVISION_QUALIFIED');
    expect(result.chunkState).toBe('CHUNK_REVISION_QUALIFIED');
    expect(result.eligibility).toBe('CHUNK_REVISION_QUALIFIED');
    expect(result.semantic768State).toBe('AVAILABLE');
    expect(result.summaryState).toBe('AVAILABLE');
    expect(result.summarySemanticState).toBe('UNBOUND');
    expect(result.lineageDiagnostic).toEqual({ chunkSourceRevisionMirror: null, chunkWorkspaceRevisionMirror: null, mirrorsRequired: false });
  });

  it('blocks missing membership but preserves packet qualification', () => {
    const result = run({ memberships: [] });
    expect(result.chunkState).toBe('LINEAGE_MISSING');
    expect(result.eligibility).toBe('PACKET_REVISION_QUALIFIED');
  });

  it('rejects source/workspace binding drift', () => {
    expect(run({ expectedWorkspaceRevision: 'sha256:other' }).chunkState).toBe('SOURCE_BINDING_MISMATCH');
    expect(run({ sourceBinding: { ...binding, sourceRevision: 'sha256:other' } }).chunkState).toBe('SOURCE_BINDING_MISMATCH');
    expect(run({ sourceBinding: { ...binding, workspaceRevision: 'sha256:other' } }).chunkState).toBe('SOURCE_BINDING_MISMATCH');
  });

  it('distinguishes lineage source-ref, source-revision, chunk-row and canonical-id mismatches', () => {
    expect(run({ memberships: [{ ...membership, sourceRef: 'src/other.ts' }] }).chunkState).toBe('LINEAGE_SOURCE_REF_MISMATCH');
    expect(run({ memberships: [{ ...membership, sourceRevision: 'sha256:older' }] }).chunkState).toBe('LINEAGE_SOURCE_REVISION_MISMATCH');
    expect(run({ memberships: [{ ...membership, chunkRowId: 'other-row' }] }).chunkState).toBe('CHUNK_ROW_MISMATCH');
    expect(run({ memberships: [{ ...membership, canonicalChunkId: 'other-chunk' }] }).chunkState).toBe('CANONICAL_CHUNK_MISMATCH');
  });

  it('requires exact membership status and PROVEN revision status', () => {
    expect(run({ memberships: [{ ...membership, membershipStatus: 'CANDIDATE' }] }).chunkState).toBe('MEMBERSHIP_STATUS_MISMATCH');
    expect(run({ memberships: [{ ...membership, revisionStatus: 'CANDIDATE' }] }).chunkState).toBe('LINEAGE_STATUS_NOT_PROVEN');
  });

  it('requires lineage chunk_row_id to resolve to the exact indexed row and canonical ID', () => {
    expect(run({ indexedChunks: [{ ...chunk, id: 'other-row' }] }).chunkState).toBe('CHUNK_ROW_MISMATCH');
    expect(run({ indexedChunks: [{ ...chunk, canonicalChunkId: 'other-chunk' }] }).chunkState).toBe('CANONICAL_CHUNK_MISMATCH');
  });

  it('keeps missing representation and summary separate from lineage', () => {
    const result = run({ indexedChunks: [{ ...chunk, contentEmbeddingPresent: false, summaryTextPresent: false, summaryEmbeddingPresent: false, summaryEmbeddingAdmissionBound: false }] });
    expect(result.chunkState).toBe('CHUNK_REVISION_QUALIFIED');
    expect(result.semantic768State).toBe('MISSING');
    expect(result.summaryState).toBe('MISSING');
    expect(result.summarySemanticState).toBe('MISSING');
  });

  it('does not call a stored vector available when its chunk identity is unqualified', () => {
    const result = run({ memberships: [{ ...membership, canonicalChunkId: 'changed-chunk' }] });
    expect(result.chunkState).toBe('CANONICAL_CHUNK_MISMATCH');
    expect(result.semantic768State).toBe('UNQUALIFIED');
    expect(result.summarySemanticState).toBe('UNBOUND');
  });

  it('rejects duplicate lineage or indexed-row resolution as ambiguous', () => {
    expect(run({ memberships: [membership, membership] }).chunkState).toBe('AMBIGUOUS_LINEAGE');
    expect(run({ indexedChunks: [chunk, chunk] }).chunkState).toBe('AMBIGUOUS_LINEAGE');
  });
});
