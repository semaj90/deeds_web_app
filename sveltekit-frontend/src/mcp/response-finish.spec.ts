import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForMcpResponseFinish } from './response-finish.js';

class FakeResponse extends EventEmitter {
  writableFinished = false;
}

describe('waitForMcpResponseFinish', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves when the response finishes', async () => {
    const response = new FakeResponse();
    const pending = waitForMcpResponseFinish(response, 1000);

    response.emit('finish');

    await expect(pending).resolves.toBe('finished');
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('resolves when the response closes', async () => {
    const response = new FakeResponse();
    const pending = waitForMcpResponseFinish(response, 1000);

    response.emit('close');

    await expect(pending).resolves.toBe('closed');
  });

  it('uses a bounded fallback timeout', async () => {
    vi.useFakeTimers();
    const response = new FakeResponse();
    const pending = waitForMcpResponseFinish(response, 25);

    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toBe('timeout');
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('returns immediately when the response already finished', async () => {
    const response = new FakeResponse();
    response.writableFinished = true;

    await expect(waitForMcpResponseFinish(response)).resolves.toBe('finished');
  });
});
