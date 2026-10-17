import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
const { record, acknowledge } = vi.hoisted(() => ({ record: vi.fn(), acknowledge: vi.fn() }));
vi.mock('./packet-centric-telemetry.js', () => ({ recordPacketCentricTelemetry: record,
  recordPacketCentricTelemetryAcknowledged: acknowledge }));
import { getPacketTelemetryContext, withPacketTelemetryContext } from './packet-telemetry-context.js';
import { observeStoreRequest } from './gpu-telemetry.js';
import { observeTransport, recordFailedTransportAttempt } from '../grpc/transport-telemetry.js';
import { withMcpToolTelemetry } from './mcp-tool-telemetry.js';

beforeEach(() => {
  record.mockReset().mockResolvedValue(undefined);
  acknowledge.mockReset().mockResolvedValue(true);
});

describe('request-scoped packet telemetry context', () => {
  it('isolates concurrent transport and store observations and restores the outer context', async () => {
    const results = await Promise.all(['first', 'second'].map((name) => withPacketTelemetryContext({
      trace_id: `trace:${name}`, packet_context: { packet_id: `packet:${name}`, source_ref: `src/${name}.ts` },
    }, async () => {
      await new Promise((resolve) => setTimeout(resolve, name === 'first' ? 8 : 1));
      const result = await observeTransport('http', async () => ({ results: [] }), '/fixture');
      await observeStoreRequest('redis', 'get', async () => null);
      return result.transportTelemetry.trace_id;
    })));
    expect(results).toEqual(['trace:first', 'trace:second']);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    for (const [event] of record.mock.calls) {
      const name = event.trace_id.split(':')[1];
      expect(event.packet_context.packet_id).toBe(`packet:${name}`);
      expect(event.resource_observation.trace_id).toBe(event.trace_id);
    }
    expect(getPacketTelemetryContext()).toBeUndefined();
  });

  it('keeps nested unknowns explicit and never merges metadata from different candidate rows', () => {
    withPacketTelemetryContext({ trace_id: 'trace:parent', packet_context: { packet_id: 'packet:parent', feature_id: 'feature:parent' } }, () => {
      withPacketTelemetryContext({}, () => expect(getPacketTelemetryContext()?.trace_id).toBe('trace:parent'));
      withPacketTelemetryContext({ trace_id: null, packet_context: { packet_id: 'packet:child' } }, () => {
        expect(getPacketTelemetryContext()).toEqual({ trace_id: null, packet_context: { packet_id: 'packet:child' } });
      });
      expect(getPacketTelemetryContext()?.packet_context?.packet_id).toBe('packet:parent');
    });
  });

  it('snapshots and strips scope metadata and does not let invalid metadata block the action', () => {
    const input = { packet_id: 'packet:one', tensor: [1, 2] };
    withPacketTelemetryContext({ packet_context: input }, () => {
      input.packet_id = 'packet:changed';
      expect(getPacketTelemetryContext()?.packet_context).toEqual({ packet_id: 'packet:one' });
      expect(Object.isFrozen(getPacketTelemetryContext()?.packet_context)).toBe(true);
    });
    const action = vi.fn(() => getPacketTelemetryContext());
    expect(withPacketTelemetryContext({ trace_id: 'x'.repeat(129) }, action)).toEqual({ trace_id: null, packet_context: null });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('correlates failed transports and inherits request scope inside the actual MCP wrapper', async () => {
    await withPacketTelemetryContext({ trace_id: 'trace:invocation', packet_context: { packet_id: 'packet:invocation' } }, async () => {
      const wrapped = withMcpToolTelemetry('fixture:tool', async () => {
        expect(getPacketTelemetryContext()?.trace_id).toBe('trace:invocation');
        await observeTransport('grpc', async () => null, 'SearchChunks', recordFailedTransportAttempt);
        return { success: true };
      }, () => ({ setex: async () => 'OK' }) as unknown as Redis);
      await wrapped({ trace_id: 'trace:untrusted-argument' });
    });
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0]).toMatchObject({ trace_id: 'trace:invocation',
      packet_context: { packet_id: 'packet:invocation', rpc_transport: 'grpc' } });
    await vi.waitFor(() => expect(acknowledge).toHaveBeenCalledTimes(2));
    expect(acknowledge.mock.calls[0][0].trace_id).toBe('trace:invocation');
  });
});
