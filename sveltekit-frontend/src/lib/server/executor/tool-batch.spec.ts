import { describe, expect, it } from 'vitest';
import { executeToolBatch, type ToolBatchCall } from './tool-batch.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function readCall(id: string, dependsOn: string[] = []): ToolBatchCall {
  return { id, tool: id, input: {}, effect: 'read', dependsOn };
}

describe('executeToolBatch', () => {
  it('keeps five ready reads within three concurrent slots and returns input order', async () => {
    const firstWaveStarted = deferred();
    const releaseFirstWave = deferred();
    const starts: string[] = [];
    let active = 0;
    let peak = 0;
    const calls = ['read-1', 'read-2', 'read-3', 'read-4', 'read-5'].map((id) => readCall(id));

    const run = executeToolBatch(calls, async (call) => {
      starts.push(call.id);
      active += 1;
      peak = Math.max(peak, active);
      if (starts.length === 3) firstWaveStarted.resolve();
      if (starts.length <= 3) await releaseFirstWave.promise;
      active -= 1;
      return call.id;
    });

    await firstWaveStarted.promise;
    expect(starts).toEqual(['read-1', 'read-2', 'read-3']);
    expect(active).toBe(3);
    releaseFirstWave.resolve();

    const results = await run;
    expect(peak).toBe(3);
    expect(starts).toEqual(['read-1', 'read-2', 'read-3', 'read-4', 'read-5']);
    expect(results.map((result) => result.id)).toEqual(calls.map((call) => call.id));
  });

  it('starts graph expansion only after its dense ANN dependency succeeds', async () => {
    const seedStarted = deferred();
    const releaseSeed = deferred();
    const events: string[] = [];
    const calls = [readCall('dense_search'), readCall('graph_expand', ['dense_search'])];

    const run = executeToolBatch(calls, async (call) => {
      events.push(`start:${call.id}`);
      if (call.id === 'dense_search') {
        seedStarted.resolve();
        await releaseSeed.promise;
        events.push('finish:dense_search');
      }
      return call.id;
    });

    await seedStarted.promise;
    expect(events).toEqual(['start:dense_search']);
    releaseSeed.resolve();
    await run;
    expect(events).toEqual(['start:dense_search', 'finish:dense_search', 'start:graph_expand']);
  });

  it('skips dependents when a prerequisite fails', async () => {
    const invoked: string[] = [];
    const results = await executeToolBatch(
      [readCall('seed'), readCall('expand', ['seed'])],
      async (call) => {
        invoked.push(call.id);
        throw new Error('seed unavailable');
      },
    );

    expect(invoked).toEqual(['seed']);
    expect(results[0]).toMatchObject({ status: 'failed', error: 'seed unavailable' });
    expect(results[1]).toMatchObject({ status: 'skipped', error: 'DEPENDENCY_FAILED:seed' });
  });

  it('serializes writes against reads and other writes', async () => {
    const active: string[] = [];
    const policyViolations: string[] = [];
    const calls: ToolBatchCall[] = [
      readCall('read-a'),
      { id: 'write', tool: 'write', input: {}, effect: 'write' },
      readCall('read-b'),
    ];
    const results = await executeToolBatch(calls, async (call) => {
      if (call.effect === 'write' && active.length > 0) policyViolations.push('write-overlapped');
      if (call.effect === 'read' && active.includes('write')) policyViolations.push('read-overlapped-write');
      active.push(call.id);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active.splice(active.indexOf(call.id), 1);
      return call.id;
    });
    expect(results.every((result) => result.status === 'succeeded')).toBe(true);
    expect(policyViolations).toEqual([]);
  });

  it('rejects cycles and unknown dependencies before invoking any executor', async () => {
    let callsStarted = 0;
    const executor = async () => { callsStarted += 1; return true; };
    await expect(executeToolBatch([readCall('a', ['b']), readCall('b', ['a'])], executor))
      .rejects.toThrow('TOOL_CALL_DEPENDENCY_CYCLE');
    await expect(executeToolBatch([readCall('a', ['missing'])], executor))
      .rejects.toThrow('UNKNOWN_TOOL_DEPENDENCY');
    expect(callsStarted).toBe(0);
  });

  it('aborts a timed-out executor and waits for it to settle before returning', async () => {
    let abortObserved = false;
    const result = await executeToolBatch(
      [readCall('slow')],
      async (_call, signal) => new Promise<string>((resolve) => {
        signal.addEventListener('abort', () => {
          abortObserved = true;
          resolve('late');
        }, { once: true });
      }),
      { timeoutMs: 5 },
    );
    expect(abortObserved).toBe(true);
    expect(result[0]).toMatchObject({ status: 'failed', error: 'TOOL_TIMEOUT' });
  });
});
