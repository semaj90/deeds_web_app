import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('$lib/server/db/client.js', () => ({
  db: { execute },
}));

import {
  claimActionWork,
  completeActionWork,
} from './action-single-flight-v1.js';

const artifact = {
  schema: 'atlas.artifact-address.v1' as const,
  artifactId: 'artifact-output-1',
  artifactHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  schemaId: 'atlas.output.v1',
  checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  revisionSetHash: 'cccccccccccccccccccccccccccccccc',
  revisions: {},
  locator: {
    storage: 'POSTGRES' as const,
    table: 'workflow_artifacts',
    primaryKey: 'artifact-output-1',
  },
};

const receiptRow = {
  action_key: 'action-key-00000001',
  fencing_token: '4',
  output_artifact_address: artifact,
  producer_revision: 'producer-v1',
  completed_at: new Date('2026-08-21T00:00:00.000Z'),
};

describe('ActionKey single-flight', () => {
  beforeEach(() => execute.mockReset());

  it('returns an existing immutable receipt without trying to acquire a lease', async () => {
    execute.mockResolvedValueOnce({ rows: [receiptRow] });

    const claim = await claimActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-a',
      leaseMs: 30_000,
    });

    expect(claim.kind).toBe('receipt');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('acquires a lease with the database-issued fencing token when no receipt exists', async () => {
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          action_key: 'action-key-00000001',
          lease_owner: 'worker-a',
          fencing_token: '7',
          lease_expires_at: new Date('2026-08-21T00:01:00.000Z'),
        }],
      });

    const claim = await claimActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-a',
      leaseMs: 30_000,
    });

    expect(claim).toMatchObject({
      kind: 'lease',
      lease: { fencingToken: '7', leaseOwner: 'worker-a' },
    });
  });

  it('returns the already-persisted receipt when duplicate completion loses the insert race', async () => {
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [receiptRow] });

    const receipt = await completeActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-a',
      fencingToken: '3',
      outputArtifact: artifact,
      producerRevision: 'producer-v1',
    });

    expect(receipt.fencingToken).toBe('4');
    expect(receipt.outputArtifact.artifactId).toBe('artifact-output-1');
  });

  it('rejects a stale fencing token when no receipt exists', async () => {
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(completeActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-stale',
      fencingToken: '2',
      outputArtifact: artifact,
      producerRevision: 'producer-v1',
    })).rejects.toThrow(/STALE_ACTION_FENCE/);
  });
});
