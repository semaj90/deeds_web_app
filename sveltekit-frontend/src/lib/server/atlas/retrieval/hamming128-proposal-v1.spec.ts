import { describe, expect, it, vi } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { ComputePool } from '$lib/server/workers/compute-pool.js';
import { scoreHamming128ProposalV1 } from './hamming128-proposal-v1.js';

const workspaceRevision = 'sha256:workspace-fixture';
const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision: 'snapshot:fixture-v1',
  workspaceRevision,
  producerRevision: 'producer:fixture-v1',
  candidates: [
    { canonicalId: 'chunk:b', packetKey: 'packet:b', sourceRef: 'src/b.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: 'sha256:source-b', graphRevision: null, semanticRevision: 'semantic:v1', degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
    { canonicalId: 'chunk:a', packetKey: 'packet:a', sourceRef: 'src/a.ts', treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: 'sha256:source-a', graphRevision: null, semanticRevision: 'semantic:v1', degradedIdentity: false, evidenceRefs: [], representationBindings: [] },
  ],
});

describe('scoreHamming128ProposalV1', () => {
  it('binds worker scores to the checksum-verified map ordinals', async () => {
    const run = vi.fn(async (_type: string, payload: any) => ({
      schema: 'atlas.hamming128.worker-result.v1',
      authority: 'PROPOSAL_ONLY',
      backend: 'AVX2',
      candidateOrdinals: payload.candidateOrdinals,
      distances: new Uint16Array([1, 4]),
    }));

    const result = await scoreHamming128ProposalV1({
      computePool: { run } as any,
      ordinalMap,
      representationRevision: 'sign-bitset128:fixture-v1',
      querySignature: new Uint8Array(16),
      candidateSignatures: [
        { candidateOrdinal: 1, signature: new Uint8Array(16).fill(2) },
        { candidateOrdinal: 0, signature: new Uint8Array(16).fill(1) },
      ],
    });

    expect(run).toHaveBeenCalledWith('hamming128.proposal', expect.objectContaining({
      candidateOrdinals: new Uint32Array([0, 1]),
    }), { timeoutMs: 5000 });
    expect(result.authority).toBe('PROPOSAL_ONLY');
    expect(result.ordinalMapChecksum).toBe(ordinalMap.ordinalMapChecksum);
    expect(result.rows.map((row) => [row.candidateOrdinal, row.canonicalId, row.hammingDistance])).toEqual([
      [0, 'chunk:a', 1],
      [1, 'chunk:b', 4],
    ]);
  });

  it('rejects duplicate and out-of-map candidate ordinals before scheduling', async () => {
    const run = vi.fn();
    const input = {
      computePool: { run } as any,
      ordinalMap,
      representationRevision: 'sign-bitset128:fixture-v1',
      querySignature: new Uint8Array(16),
      candidateSignatures: [
        { candidateOrdinal: 0, signature: new Uint8Array(16) },
        { candidateOrdinal: 0, signature: new Uint8Array(16) },
      ],
    };

    await expect(scoreHamming128ProposalV1(input)).rejects.toThrow('HAMMING128_DUPLICATE_CANDIDATE_ORDINAL');
    await expect(scoreHamming128ProposalV1({
      ...input,
      candidateSignatures: [{ candidateOrdinal: 2, signature: new Uint8Array(16) }],
    })).rejects.toThrow('HAMMING128_ORDINAL_OUTSIDE_MAP');
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects stale ordinal-map checksums before scheduling', async () => {
    const run = vi.fn();
    const corrupted = { ...ordinalMap, ordinalMapChecksum: '0'.repeat(64) };
    await expect(scoreHamming128ProposalV1({
      computePool: { run } as any,
      ordinalMap: corrupted,
      representationRevision: 'sign-bitset128:fixture-v1',
      querySignature: new Uint8Array(16),
      candidateSignatures: [],
    })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it('runs the bounded proposal task on a real server worker', async () => {
    const computePool = new ComputePool(1, 1, 1024 * 1024);
    try {
      const result = await scoreHamming128ProposalV1({
        computePool,
        ordinalMap,
        representationRevision: 'sign-bitset128:fixture-v1',
        querySignature: new Uint8Array(16),
        candidateSignatures: [
          { candidateOrdinal: 1, signature: new Uint8Array(16).fill(255) },
          { candidateOrdinal: 0, signature: new Uint8Array(16).fill(1) },
        ],
      });

      expect(result.authority).toBe('PROPOSAL_ONLY');
      expect(result.backend).toBe('SCALAR');
      expect(result.rows.map((row) => [row.candidateOrdinal, row.hammingDistance])).toEqual([[0, 16], [1, 128]]);
    } finally {
      await computePool.dispose();
    }
  });
});
