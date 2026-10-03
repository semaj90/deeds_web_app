import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rabbitmq } = vi.hoisted(() => ({ rabbitmq: { consume: vi.fn() } }));

vi.mock('./rabbitmq-manager-fixed.js', () => ({ rabbitmq }));

import { QueueWorker, WorkerRegistry, type WorkerStats } from './queue-worker.js';

class ReadyWorker extends QueueWorker<unknown> {
  readonly queue = 'cache.invalidate' as const;
  async process(): Promise<void> {}
}

class FailingWorker extends QueueWorker<unknown> {
  readonly queue = 'document.embed' as const;
  async process(): Promise<void> {}
}

class DisabledWorker extends QueueWorker<unknown> {
  readonly queue = 'evidence.process' as const;
  async process(): Promise<void> {}
}

class ControlledWorker extends QueueWorker<unknown> {
  private state: WorkerStats['readinessState'] = 'NOT_STARTED';
  private error: string | null = null;

  constructor(
    readonly queue: 'cache.invalidate' | 'document.embed' | 'evidence.process',
    private readonly outcome: 'ready' | 'failed'
  ) { super(); }

  async process(): Promise<void> {}

  override async start(): Promise<void> {
    if (this.state === 'DISABLED') return;
    if (this.outcome === 'failed') {
      this.state = 'FAILED';
      this.error = 'broker unavailable';
      throw new Error(this.error);
    }
    this.state = 'READY';
  }

  override markDisabled(): void {
    this.state = 'DISABLED';
    this.error = null;
  }

  override getStats(): Readonly<WorkerStats> {
    return {
      processed: 0,
      failed: 0,
      retried: 0,
      dlqCount: 0,
      avgProcessingMs: 0,
      lastProcessedAt: null,
      isRunning: this.state === 'READY',
      readinessState: this.state,
      startError: this.error,
    };
  }
}

describe('queue worker readiness', () => {
  beforeEach(() => rabbitmq.consume.mockReset());

  it('marks READY only after RabbitMQ consume registration resolves', async () => {
    rabbitmq.consume.mockResolvedValue(undefined);
    const worker = new ReadyWorker();

    await worker.start();

    expect(worker.getStats()).toMatchObject({ isRunning: true, readinessState: 'READY', startError: null });
    expect(rabbitmq.consume).toHaveBeenCalledOnce();
  });

  it('propagates consume registration failure and records FAILED', async () => {
    rabbitmq.consume.mockRejectedValue(new Error('broker unavailable'));
    const worker = new FailingWorker();

    await expect(worker.start()).rejects.toThrow('broker unavailable');

    expect(worker.getStats()).toMatchObject({ isRunning: false, readinessState: 'FAILED', startError: 'broker unavailable' });
  });

  it('does not attempt RabbitMQ registration for an intentionally disabled worker', async () => {
    const worker = new DisabledWorker();
    worker.markDisabled();

    await worker.start();

    expect(worker.getStats()).toMatchObject({ isRunning: false, readinessState: 'DISABLED' });
    expect(rabbitmq.consume).not.toHaveBeenCalled();
  });

  it('aggregates READY, DEGRADED, FAILED, and DISABLED worker states without masking failures', async () => {
    const ready = new ControlledWorker('cache.invalidate', 'ready');
    const failed = new ControlledWorker('document.embed', 'failed');
    const disabled = new ControlledWorker('evidence.process', 'ready');
    const registry = new WorkerRegistry();
    registry.register(ready);
    registry.register(failed);
    registry.register(disabled, { enabled: false });

    const result = await registry.startAll();

    expect(result).toMatchObject({ started: 1, failed: 1, disabled: 1, state: 'DEGRADED', total: 3 });
    expect(registry.getStatus().workers).toMatchObject({
      'cache.invalidate': { state: 'READY' },
      'document.embed': { state: 'FAILED', startError: 'broker unavailable' },
      'evidence.process': { state: 'DISABLED' },
    });
    expect(result.errors).toEqual(['document.embed: broker unavailable']);
    expect(rabbitmq.consume).not.toHaveBeenCalled();
  });

  it('reports an all-failed registry as FAILED and an all-disabled registry as DISABLED', async () => {
    const readyRegistry = new WorkerRegistry();
    readyRegistry.register(new ControlledWorker('cache.invalidate', 'ready'));
    expect((await readyRegistry.startAll()).state).toBe('READY');

    const failedRegistry = new WorkerRegistry();
    failedRegistry.register(new ControlledWorker('document.embed', 'failed'));
    expect((await failedRegistry.startAll()).state).toBe('FAILED');

    const disabledRegistry = new WorkerRegistry();
    disabledRegistry.register(new ControlledWorker('evidence.process', 'ready'), { enabled: false });
    expect((await disabledRegistry.startAll()).state).toBe('DISABLED');
    expect(rabbitmq.consume).not.toHaveBeenCalled();
  });
});
