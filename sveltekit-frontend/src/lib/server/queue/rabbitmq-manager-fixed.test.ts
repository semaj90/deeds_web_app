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
    // (see the lifecycle-hardening suite below for the race tests)
    const { manager, connect } = await stubbedManager();

    await manager.initialize();
    manager.isInitialized = false; // what the connection close/error handlers now do
    await manager.initialize();

    expect(connect).toHaveBeenCalledTimes(2);
  });
});

describe('RabbitMQManager lifecycle hardening (fake AMQP, no broker)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function freshManager() {
    const { RabbitMQManager } = await import('./rabbitmq-manager-fixed.js');
    return new RabbitMQManager() as any;
  }

  it('schedules only one reconnect when connection error is followed by close', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = await freshManager();
    const initialize = vi.spyOn(manager, 'initialize').mockResolvedValue(true);

    manager.emit('connection_lost'); // error handler
    manager.emit('connection_lost'); // close handler for the same outage
    await vi.advanceTimersByTimeAsync(120_000);

    expect(initialize).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancels already-registered consumers when startConsumers fails part-way', async () => {
    const manager = await freshManager();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let n = 0;
    const cancel = vi.fn(async () => {});
    manager.channel = {
      prefetch: vi.fn(async () => {}),
      cancel,
      consume: vi.fn(async () => {
        n += 1;
        if (n === 3) throw new Error('consume failed on third queue');
        return { consumerTag: `tag-${n}` };
      }),
    };

    await expect(manager.startConsumers()).rejects.toThrow('consume failed');

    expect(cancel.mock.calls.map((c: any[]) => c[0]).sort()).toEqual(['tag-1', 'tag-2']);
  });

  it('allocates one channel for concurrent ensureChannel() calls', async () => {
    const manager = await freshManager();
    const createChannel = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { on: vi.fn(), close: vi.fn(async () => {}) };
    });
    manager.connection = { createChannel };
    manager.channel = null;

    const [a, b] = await Promise.all([manager.ensureChannel(), manager.ensureChannel()]);

    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});

describe('RabbitMQManager endpoint description', () => {
  it('reports host and port without credentials', async () => {
    vi.resetModules();
    const { RabbitMQManager } = await import('./rabbitmq-manager-fixed.js');
    const manager = new RabbitMQManager() as any;
    manager.url = 'amqp://legal_admin:s3cret@127.0.0.1:5673';
    expect(manager.describeEndpoint()).toBe('127.0.0.1:5673');
    expect(manager.describeEndpoint()).not.toMatch(/s3cret|legal_admin/);
    manager.url = 'not a url';
    expect(manager.describeEndpoint()).toBe('unparseable RABBITMQ_URL');
  });

  it('closes a connection when initial channel allocation fails', async () => {
    vi.resetModules();
    const connection = {
      createChannel: vi.fn(async () => {
        throw new Error('No channels left to allocate');
      }),
      close: vi.fn(async () => {}),
    };
    const connect = vi.fn(async () => connection);
    vi.doMock('amqplib', () => ({ default: { connect } }));

    const { RabbitMQManager } = await import('./rabbitmq-manager-fixed.js');
    const manager = new RabbitMQManager() as any;
    manager.url = 'amqp://legal_admin:s3cret@127.0.0.1:5673';

    await expect(manager.connect()).rejects.toThrow(
      'RabbitMQ connection failed (127.0.0.1:5673): No channels left to allocate',
    );
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(manager.connection).toBeNull();
    expect(manager.channel).toBeNull();
    vi.doUnmock('amqplib');
  });
});
