import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceQueue: vi.fn(async (_op: string, _queue: string, _meta: unknown, fn: () => Promise<unknown>) => fn()),
  traceLLM: vi.fn(async (_name: string, _meta: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
  },
}));

vi.mock('$lib/server/ai/local-llama-provider.js', () => ({
  LLAMA_SERVER_BASE_URL: 'http://127.0.0.1:8081/v1',
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
  fastJsonParse: vi.fn((text: string) => JSON.parse(text)),
}));

describe('RabbitMQManager dev-reload noise guards', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('silences transient reload and channel-availability errors', async () => {
    const { RabbitMQManager } = await import('./rabbitmq-manager-fixed.js');
    const manager = new RabbitMQManager() as any;

    expect(manager.shouldSilenceError('Vite module runner has been closed')).toBe(true);
    expect(manager.shouldSilenceError('Channel not available')).toBe(true);
    expect(manager.shouldSilenceError('RabbitMQ connection not available')).toBe(true);
    expect(manager.shouldSilenceError('Actual broker authentication failed')).toBe(false);
  });

  it('downgrades dev-reload service import failures to reload-abort warnings', async () => {
    const { RabbitMQManager } = await import('./rabbitmq-manager-fixed.js');
    const manager = new RabbitMQManager() as any;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    manager.logServiceLoadIssue('Redis', new Error('Vite module runner has been closed'));

    expect(warnSpy).toHaveBeenCalledWith('[RabbitMQ] Redis load aborted during dev reload');
    warnSpy.mockRestore();
  });
});

describe('RabbitMQManager initialize() idempotency', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function stubbedManager() {
    const { RabbitMQManager } = await import('./rabbitmq-manager-fixed.js');
    const manager = new RabbitMQManager() as any;
    const connect = vi.fn(async () => {
      manager.connection = { close: vi.fn(async () => {}) };
      manager.channel = { close: vi.fn(async () => {}) };
    });
    manager.loadServices = vi.fn(async () => {});
    manager.connect = connect;
    manager.setupInfrastructure = vi.fn(async () => {});
    manager.startConsumers = vi.fn(async () => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return { manager, connect };
  }

  it('opens one connection for concurrent and repeated calls', async () => {
    const { manager, connect } = await stubbedManager();

    const results = await Promise.all([manager.initialize(), manager.initialize()]);
    await manager.initialize();

    expect(results).toEqual([true, true]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects after the connection is marked lost', async () => {
    const { manager, connect } = await stubbedManager();

    await manager.initialize();
    manager.isInitialized = false; // what the connection close/error handlers now do
    await manager.initialize();

    expect(connect).toHaveBeenCalledTimes(2);
  });
});
