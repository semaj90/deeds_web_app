import { describe, expect, it } from 'vitest';
import {
  assertFanoutBundleRevisions,
  buildFanoutEvidenceBundleV1,
} from './fanout-evidence-bundle-v1.js';

const item = {
  evidenceId: 'e2', kind: 'STRUCTURAL' as const, sourceRef: 'src/a.ts',
  sourceRevision: 'sha256:source', extractorRevision: 'tree-sitter:v1',
  text: 'const a = 1', startByte: 0, endByte: 11, confidence: 1,
};

describe('FanoutEvidenceBundleV1', () => {
  it('sorts candidates and evidence deterministically', () => {
    const input = {
      schema: 'atlas.fanout-evidence-bundle.v1' as const,
      workspaceRevision: 'sha256:workspace', candidateSnapshotRevision: 'candidate:v1',
      ordinalMapChecksum: 'sha256:ordinal', representationRevisions: { semantic_768: 'semantic:v1' },
      edgePolicyRevision: 'edges:v1', maxHopDepth: 2,
      candidates: [{ candidateOrdinal: 1, packetKey: 'packet:b', sourceRef: 'src/b.ts', sourceRevision: 'sha256:b', evidence: [] },
        { candidateOrdinal: 0, packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', evidence: [item] }],
      summary: { tokenizerRevision: 'tokenizer:v1', tokenBudget: 100, text: 'const a = 1', evidenceOrder: ['e2'], checksum: 'sha256:summary' },
      canonicalAuthority: false as const,
    };
    const bundle = buildFanoutEvidenceBundleV1(input);
    expect(bundle.candidates.map((candidate) => candidate.candidateOrdinal)).toEqual([0, 1]);
    expect(bundle.bundleChecksum).toMatch(/^sha256:/);
    expect(() => assertFanoutBundleRevisions(bundle)).not.toThrow();
  });

  it('rejects evidence from a different source revision', () => {
    const input = {
      schema: 'atlas.fanout-evidence-bundle.v1' as const,
      workspaceRevision: 'sha256:workspace', candidateSnapshotRevision: 'candidate:v1',
      ordinalMapChecksum: 'sha256:ordinal', representationRevisions: {}, edgePolicyRevision: 'edges:v1', maxHopDepth: 1,
      candidates: [{ candidateOrdinal: 0, packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', evidence: [{ ...item, sourceRevision: 'sha256:other' }] }],
      summary: { tokenizerRevision: 'tokenizer:v1', tokenBudget: 10, text: 'x', evidenceOrder: [], checksum: 'sha256:summary' },
      canonicalAuthority: false as const,
    };
    const bundle = buildFanoutEvidenceBundleV1(input);
    expect(() => assertFanoutBundleRevisions(bundle)).toThrow('FANOUT_EVIDENCE_SOURCE_LINEAGE_MISMATCH');
  });
});
