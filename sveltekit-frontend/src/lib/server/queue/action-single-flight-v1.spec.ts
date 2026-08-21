import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  const transaction = vi.fn(async (callback: (tx: { execute: typeof execute }) => unknown) =>
    callback({ execute }),
  );
  return { execute, transaction };
});

vi.mock('$lib/server/db/client.js', () => ({
  db: { execute: mocks.execute, transaction: mocks.transaction },
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
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.transaction.mockClear();
  });

  it('returns an existing immutable receipt without trying to acquire a lease', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [receiptRow] });

    const claim = await claimActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-a',
      leaseMs: 30_000,
    });

    expect(claim.kind).toBe('receipt');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('acquires a lease with the database-issued fencing token when no receipt exists', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          action_key: 'action-key-00000001',
          lease_owner: 'worker-a',
          fencing_token: '7',
          lease_expires_at: new Date('2099-08-21T00:01:00.000Z'),
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

  it('returns an already-persisted receipt before locking or inserting again', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [receiptRow] });

    const receipt = await completeActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-a',
      fencingToken: '3',
      outputArtifact: artifact,
      producerRevision: 'producer-v1',
    });

    expect(receipt.fencingToken).toBe('4');
    expect(receipt.outputArtifact.artifactId).toBe('artifact-output-1');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('persists a receipt only while the current fenced lease is live according to Postgres', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          action_key: 'action-key-00000001',
          lease_owner: 'worker-a',
          fencing_token: '3',
          lease_expires_at: new Date('2099-08-21T00:01:00.000Z'),
          lease_is_live: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ ...receiptRow, fencing_token: '3' }],
      });

    const receipt = await completeActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-a',
      fencingToken: '3',
      outputArtifact: artifact,
      producerRevision: 'producer-v1',
    });

    expect(receipt.fencingToken).toBe('3');
    expect(mocks.execute).toHaveBeenCalledTimes(3);
  });

  it('rejects a stale fencing token when no receipt exists', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          action_key: 'action-key-00000001',
          lease_owner: 'worker-new',
          fencing_token: '4',
          lease_expires_at: new Date('2099-08-21T00:01:00.000Z'),
          lease_is_live: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(completeActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-stale',
      fencingToken: '2',
      outputArtifact: artifact,
      producerRevision: 'producer-v1',
    })).rejects.toThrow(/STALE_ACTION_FENCE/);
  });

  it('rejects a lease that Postgres reports expired even if app clock differs', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          action_key: 'action-key-00000001',
          lease_owner: 'worker-a',
          fencing_token: '3',
          lease_expires_at: new Date('2099-08-21T00:01:00.000Z'),
          lease_is_live: false,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(completeActionWork({
      actionKey: 'action-key-00000001',
      leaseOwner: 'worker-a',
      fencingToken: '3',
      outputArtifact: artifact,
      producerRevision: 'producer-v1',
    })).rejects.toThrow(/STALE_ACTION_FENCE/);
  });
});
