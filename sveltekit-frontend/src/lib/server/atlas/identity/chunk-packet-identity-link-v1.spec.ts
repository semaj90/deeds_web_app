import { describe, expect, it } from 'vitest';
import {
  classifyChunkPacketIdentityLink,
  type ChunkPacketCandidateEvidenceV1,
} from './chunk-packet-identity-link-v1.js';

function evidence(overrides: Partial<ChunkPacketCandidateEvidenceV1> = {}): ChunkPacketCandidateEvidenceV1 {
  return {
    source: 'fixture',
    method: 'EXACT_SOURCE_SPAN',
    packetKey: 'ace:packet:0123456789ab',
    sourceRef: 'src/lib/example.ts#run',
    sourceRevision: 'git:abc123',
    startByte: 10,
    endByte: 40,
    contentHash: 'a'.repeat(64),
    treeNodeId: 'tree-1',
    evidenceRef: 'fixture:1',
    ...overrides,
  };
}

describe('AtlasChunkPacketIdentityLinkV1', () => {
  it('admits one exact existing canonical packet', () => {
    const result = classifyChunkPacketIdentityLink({
      qdrantCollection: 'codebase_chunks_512',
      qdrantPointId: 42,
      chunkIndexId: 42,
      sourceRef: 'src/lib/example.ts#run',
      evidence: [evidence({ method: 'EXACT_CANONICAL_ID' })],
    });

    expect(result.admission).toBe('ADMITTED');
    expect(result.confidence).toBe('EXACT');
    expect(result.canonicalPacketKey).toBe('ace:packet:0123456789ab');
    expect(result.canonicalPacketMinted).toBe(false);
    expect(result.canonicalWritesAllowed).toBe(false);
  });

  it('admits a uniquely resolved exact source span', () => {
    const result = classifyChunkPacketIdentityLink({
      qdrantCollection: 'codebase_chunks_512',
      qdrantPointId: '42',
      chunkIndexId: '42',
      evidence: [evidence()],
    });

    expect(result.admission).toBe('ADMITTED');
    expect(result.confidence).toBe('UNIQUE_DERIVATION');
    expect(result.matchMethod).toBe('EXACT_SOURCE_SPAN');
  });

  it('never admits content-hash-only convergence', () => {
    const result = classifyChunkPacketIdentityLink({
      qdrantCollection: 'codebase_chunks_512',
      qdrantPointId: '42',
      evidence: [evidence({ method: 'CONTENT_HASH_UNIQUE' })],
    });

    expect(result.admission).toBe('REVIEW');
    expect(result.confidence).toBe('UNIQUE_DERIVATION');
    expect(result.canonicalPacketKey).toBeNull();
    expect(result.reasonCodes).toContain('CONTENT_HASH_ONLY_CANNOT_AUTHORIZE_CANONICAL_LINK');
  });

  it('quarantines when evidence does not resolve an existing packet key', () => {
    const result = classifyChunkPacketIdentityLink({
      qdrantCollection: 'codebase_chunks_512',
      qdrantPointId: '42',
      evidence: [evidence({ method: 'CONTENT_HASH_UNIQUE', packetKey: null })],
    });

    expect(result.admission).toBe('QUARANTINED');
    expect(result.matchMethod).toBe('UNRESOLVED');
    expect(result.canonicalPacketKey).toBeNull();
  });

  it('forces operator review when equally strong evidence resolves multiple packet keys', () => {
    const result = classifyChunkPacketIdentityLink({
      qdrantCollection: 'codebase_chunks_512',
      qdrantPointId: '42',
      evidence: [
        evidence({ packetKey: 'ace:packet:aaaaaaaaaaaa', evidenceRef: 'fixture:a' }),
        evidence({ packetKey: 'ace:packet:bbbbbbbbbbbb', evidenceRef: 'fixture:b' }),
      ],
    });

    expect(result.admission).toBe('REVIEW');
    expect(result.confidence).toBe('AMBIGUOUS');
    expect(result.matchMethod).toBe('AMBIGUOUS');
    expect(result.candidatePacketKeys).toEqual(['ace:packet:aaaaaaaaaaaa', 'ace:packet:bbbbbbbbbbbb']);
  });

  it('rejects strong-evidence lineage disagreement even for the same packet key', () => {
    const result = classifyChunkPacketIdentityLink({
      qdrantCollection: 'codebase_chunks_512',
      qdrantPointId: '42',
      evidence: [
        evidence({ sourceRef: 'src/a.ts#run', evidenceRef: 'fixture:a' }),
        evidence({ sourceRef: 'src/b.ts#run', evidenceRef: 'fixture:b' }),
      ],
    });

    expect(result.admission).toBe('REVIEW');
    expect(result.reasonCodes).toContain('STRONG_EVIDENCE_LINEAGE_CONFLICT');
  });
});
