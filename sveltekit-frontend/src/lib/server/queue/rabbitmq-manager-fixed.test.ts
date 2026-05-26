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
