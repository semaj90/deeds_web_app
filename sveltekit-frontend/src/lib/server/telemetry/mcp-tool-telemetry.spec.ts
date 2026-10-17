import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
const { query, setex } = vi.hoisted(() => ({ query: vi.fn(), setex: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
import { withMcpToolTelemetry } from './mcp-tool-telemetry.js';
import { AcpTelemetryCollector } from './acp-mcp-telemetry.js';

const getRedis = () => ({ setex }) as unknown as Redis;
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  setex.mockReset().mockResolvedValue('OK');
});

describe('MCP wrapper handoff and timer lifetime', () => {
  it('keeps explicit invocation trace context separate from untrusted tool arguments', async () => {
    const wrapped = withMcpToolTelemetry('fixture:tool', async () => ({ success: true }), getRedis);
    await wrapped({ trace_id: 'trace:argument-not-authority', packet_key: 'packet:argument' }, {
      trace_id: 'trace:trusted-invocation', packet_context: { packet_id: 'packet:qualified-input' },
    });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    for (const [, parameters] of query.mock.calls) {
      const payload = JSON.parse(parameters[13]);
      expect(payload.trace_id).toBe('trace:trusted-invocation');
      expect(payload.acp_observation.trace_id).toBe('trace:trusted-invocation');
      expect(payload.packet_context.packet_id).toBe('packet:qualified-input');
      expect(JSON.stringify(payload)).not.toContain('argument-not-authority');
    }
  });
  it.each([true, false])('preserves explicit success=%s and records the matching outcome', async (success) => {
    const destroy = vi.spyOn(AcpTelemetryCollector.prototype, 'destroy');
    const result = { success, content: 'private tool response' };
    const handler = vi.fn().mockResolvedValue(result);
    const wrapped = withMcpToolTelemetry('fixture:tool', handler, getRedis);
    expect(await wrapped({ query: 'private user query' })).toBe(result);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    const event = JSON.parse(query.mock.calls[1][1][13]);
    expect(event.acp_observation.async_ops[0].status).toBe(success ? 'success' : 'failure');
    expect(JSON.parse(setex.mock.calls[0][2]).status).toBe(success ? 'success' : 'error');
    expect(JSON.stringify(event)).not.toContain('private');
    destroy.mockRestore();
  });

  it('preserves the original exception and does not persist its contents into Redis metrics', async () => {
    const destroy = vi.spyOn(AcpTelemetryCollector.prototype, 'destroy');
    const failure = new Error('private request credentials');
    const wrapped = withMcpToolTelemetry('fixture:tool', async () => { throw failure; }, getRedis);
    await expect(wrapped({})).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    const metric = JSON.parse(setex.mock.calls[0][2]);
    expect(metric).toMatchObject({ status: 'error', error_kind: 'HANDLER_THROWN' });
    expect(JSON.stringify(metric)).not.toContain(failure.message);
    expect(JSON.stringify(query.mock.calls)).not.toContain(failure.message);
    destroy.mockRestore();
  });

  it('does not delay a handler result on a pending packet writer', async () => {
    let release!: (value: { rows: unknown[] }) => void;
    query.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const wrapped = withMcpToolTelemetry('fixture:tool', async () => ({ success: true }), getRedis);
    await expect(wrapped({})).resolves.toEqual({ success: true });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    release({ rows: [] });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  });
});
