import { describe, expect, it, vi } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: { execute: mockExecute },
  pgRows: (result: unknown) => {
    if (Array.isArray(result)) return result;
    const r = result as { rows?: unknown[] };
    return r.rows ?? [];
  },
}));

import { PostgresLatent256CandidateProvider, LATENT_256_DIM } from './latent256-candidate-provider.js';

const CHECKPOINT_REVISION = 'checkpoint-abc123';

function halfvecString(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

const validVec = Array.from({ length: LATENT_256_DIM }, (_, i) => i / LATENT_256_DIM);

describe('PostgresLatent256CandidateProvider', () => {
  it('returns an empty result without querying when packetKeys is empty', async () => {
    const provider = new PostgresLatent256CandidateProvider();
    const result = await provider.hydrate({
      packetKeys: [],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ requested: 0, found: 0, missing: 0, revisionMismatch: 0, invalidShape: 0 });
  });

  it('accepts a row with the correct checkpoint revision and valid shape', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'a', latent_256: halfvecString(validVec), latent_256_checkpoint_revision: CHECKPOINT_REVISION }],
    });
    const provider = new PostgresLatent256CandidateProvider();
    const result = await provider.hydrate({
      packetKeys: ['a'],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    expect(result.found).toBe(1);
    expect(result.vectors.get('a')).toHaveLength(LATENT_256_DIM);
  });

  it('treats a wrong checkpoint revision as absent (revisionMismatch, not found)', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'a', latent_256: halfvecString(validVec), latent_256_checkpoint_revision: 'some-other-revision' }],
    });
    const provider = new PostgresLatent256CandidateProvider();
    const result = await provider.hydrate({
      packetKeys: ['a'],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    expect(result.found).toBe(0);
    expect(result.revisionMismatch).toBe(1);
    expect(result.vectors.has('a')).toBe(false);
  });

  it('treats a wrong dimension as absent (invalidShape), not found', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'a', latent_256: halfvecString([1, 2, 3]), latent_256_checkpoint_revision: CHECKPOINT_REVISION }],
    });
    const provider = new PostgresLatent256CandidateProvider();
    const result = await provider.hydrate({
      packetKeys: ['a'],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    expect(result.found).toBe(0);
    expect(result.invalidShape).toBe(1);
    expect(result.vectors.has('a')).toBe(false);
  });

  it('treats NaN/Infinity values as absent (invalidShape), not found', async () => {
    const badVec = [...validVec];
    badVec[10] = NaN;
    badVec[20] = Infinity;
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'a', latent_256: halfvecString(badVec), latent_256_checkpoint_revision: CHECKPOINT_REVISION }],
    });
    const provider = new PostgresLatent256CandidateProvider();
    const result = await provider.hydrate({
      packetKeys: ['a'],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    expect(result.found).toBe(0);
    expect(result.invalidShape).toBe(1);
  });

  it('counts a row with no id match as missing, distinct from revisionMismatch/invalidShape', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const provider = new PostgresLatent256CandidateProvider();
    const result = await provider.hydrate({
      packetKeys: ['does-not-exist'],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    expect(result.missing).toBe(1);
    expect(result.found).toBe(0);
    expect(result.revisionMismatch).toBe(0);
    expect(result.invalidShape).toBe(0);
  });

  it('produces an identical receiptChecksum for an identical rerun (deterministic, order-independent over packetKeys)', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ id: 'a', latent_256: halfvecString(validVec), latent_256_checkpoint_revision: CHECKPOINT_REVISION }],
    });
    const provider = new PostgresLatent256CandidateProvider();
    const run1 = await provider.hydrate({
      packetKeys: ['a'],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    const run2 = await provider.hydrate({
      packetKeys: ['a'],
      candidateSnapshotRevision: 'snap',
      representationRevision: 'rep',
      checkpointRevision: CHECKPOINT_REVISION,
    });
    expect(run1.receiptChecksum).toBe(run2.receiptChecksum);
  });
});
