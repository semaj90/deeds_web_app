import { describe, expect, it, vi } from 'vitest';
import { executeLaneWithDeadline } from './retrieve-candidates.js';
import type { Candidate } from './types.js';

function makeCandidate(packetKey: string): Candidate {
  return {
    id: packetKey,
    packetKey,
    sourceRef: `src/${packetKey}.ts`,
    sourceType: 'code',
    score: 0.9,
    scoreSource: 'bm25',
    payload: {},
  };
}

describe('executeLaneWithDeadline', () => {
  it('distinguishes ok, empty, timed_out, unavailable, and skipped lanes', async () => {
    const okRes = await executeLaneWithDeadline('bm25', 'lexical', 200, async (_signal) => [makeCandidate('p1')]);
    expect(okRes.receipt.status).toBe('ok');
    expect(okRes.receipt.hitCount).toBe(1);
    expect(okRes.candidates).toHaveLength(1);

    const emptyRes = await executeLaneWithDeadline('exact', 'exact', 200, async (_signal) => []);
    expect(emptyRes.receipt.status).toBe('empty');
    expect(emptyRes.receipt.hitCount).toBe(0);
    expect(emptyRes.receipt.error).toBeUndefined();

    const timedOutRes = await executeLaneWithDeadline(
      'qdrant',
      'dense',
      20,
      (signal) => new Promise<Candidate[]>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('late operation should have been aborted')), 150);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      }),
    );
    expect(timedOutRes.receipt.status).toBe('timed_out');
    expect(timedOutRes.receipt.hitCount).toBe(0);
    expect(timedOutRes.receipt.error).toContain('LANE_DEADLINE_EXCEEDED');
    expect(timedOutRes.receipt.cancellationRequested).toBe(true);
    expect(timedOutRes.receipt.cancellationConfirmed).toBe(true);
    expect(timedOutRes.receipt.cancellationSupport).toBe('aborted');

    const unavailableRes = await executeLaneWithDeadline('ast', 'ast', 200, async (_signal) => {
      throw new Error('SIDE_CAR_DOWN');
    });
    expect(unavailableRes.receipt.status).toBe('unavailable');
    expect(unavailableRes.receipt.hitCount).toBe(0);
    expect(unavailableRes.receipt.error).toBe('SIDE_CAR_DOWN');

    const skippedRes = await executeLaneWithDeadline('qdrant', 'dense', 200, async (_signal) => [makeCandidate('x')], {
      skip: true,
      skipReason: 'vector_lanes_disabled',
    });
    expect(skippedRes.receipt.status).toBe('skipped');
    expect(skippedRes.receipt.error).toBe('vector_lanes_disabled');
    expect(skippedRes.candidates).toHaveLength(0);
  });

  it('aborts before lane admission without invoking the operation', async () => {
    const controller = new AbortController();
    controller.abort(new Error('REQUEST_CANCELLED'));
    const operation = vi.fn(async () => [makeCandidate('must-not-run')]);
    const result = await executeLaneWithDeadline('ast', 'ast', 100, operation, { signal: controller.signal });
    expect(result.receipt.status).toBe('cancelled');
    expect(operation).not.toHaveBeenCalled();
  });

  it('cancels active work and consumes a rejection that arrives after the deadline', async () => {
    const result = await executeLaneWithDeadline('rg', 'rg', 10, (signal) => new Promise<Candidate[]>((_resolve, reject) => {
      setTimeout(() => reject(new Error('late cancellation rejection')), 20);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    expect(result.receipt.status).toBe('timed_out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  it('reports unsupported cancellation when an active adapter ignores AbortSignal', async () => {
    let finish!: (rows: Candidate[]) => void;
    const pending = new Promise<Candidate[]>((resolve) => { finish = resolve; });
    const result = await executeLaneWithDeadline('qdrant', 'dense', 10, async () => pending, {
      cancellationConfirmationMs: 5,
    });

    expect(result.receipt.status).toBe('timed_out');
    expect(result.receipt.cancellationRequested).toBe(true);
    expect(result.receipt.cancellationConfirmed).toBe(false);
    expect(result.receipt.cancellationSupport).toBe('unsupported');

    // A late successful result is consumed and cannot mutate the completed receipt.
    finish([makeCandidate('late')]);
    await Promise.resolve();
    expect(result.candidates).toHaveLength(0);
    expect(result.receipt.hitCount).toBe(0);
  });

  it('marks externally cancelled active work distinctly from a genuine empty result', async () => {
    const controller = new AbortController();
    const resultPromise = executeLaneWithDeadline('ast', 'ast', 500, (signal) => new Promise<Candidate[]>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }), { signal: controller.signal });
    controller.abort(new Error('CLIENT_DISCONNECTED'));
    const result = await resultPromise;
    expect(result.receipt.status).toBe('cancelled');
    expect(result.receipt.error).toBe('REQUEST_CANCELLED');
  });
});
