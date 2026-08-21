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

import { enqueueTask, publishOutboxBatch } from './outbox.js';

function uuid(fill: string): string {
  return `${fill.repeat(8)}-${fill.repeat(4)}-4${fill.repeat(3)}-8${fill.repeat(3)}-${fill.repeat(12)}`;
}

describe('authoritative task outbox', () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.transaction.mockClear();
  });

  it('writes workflow_task and workflow_outbox inside one database transaction', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });

    await enqueueTask({
      runId: uuid('1'),
      requestId: uuid('2'),
      commandType: 'retrieval.materialize',
      capability: 'artifact.materialize',
      targetWorkerClass: 'artifact-worker',
      payload: { artifactRefs: ['artifact:input'] },
      timeoutMs: 30_000,
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('marks an outbox row delivered only after the publisher promise resolves', async () => {
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{
          id: uuid('3'),
          routing_key: 'atlas.work.retrieval.materialize',
          exchange: 'atlas.tasks.v1',
          payload: { command: { commandType: 'retrieval.materialize' } },
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    let confirmed = false;
    const publishFn = vi.fn(async () => {
      confirmed = true;
    });

    const result = await publishOutboxBatch(publishFn, 10);

    expect(result).toEqual({ attempted: 1, delivered: 1 });
    expect(confirmed).toBe(true);
    expect(publishFn).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('does not count a rejected broker publication as delivered', async () => {
    mocks.execute
      .mockResolvedValueOnce({
        rows: [{
          id: uuid('4'),
          routing_key: 'atlas.work.retrieval.materialize',
          exchange: 'atlas.tasks.v1',
          payload: { command: { commandType: 'retrieval.materialize' } },
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await publishOutboxBatch(
      vi.fn(async () => { throw new Error('broker confirm rejected'); }),
      10,
    );

    expect(result).toEqual({ attempted: 1, delivered: 0 });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
});
