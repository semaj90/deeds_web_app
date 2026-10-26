import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
import { AcpTelemetryCollector } from './acp-mcp-telemetry.js';
import { recordPacketCentricTelemetryAcknowledged } from './packet-centric-telemetry.js';
import { recordRetrievalEvalTelemetry } from './retrieval-recorder.js';
import { AcpObservationSchema } from './acp-observation.js';
import { observeTransport } from '../grpc/transport-telemetry.js';
import { withPacketTelemetryContext } from './packet-telemetry-context.js';

beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));
const observation = AcpObservationSchema.parse({ schema: 'atlas.acp-observation.v1', trace_id: 'trace:one',
  timestamp: '2026-10-16T08:00:00.000Z', node_id: 'fixture', routing_decisions: [], tool_calls: [], async_ops: [], canonicalAuthority: false });

describe('trace correlation through existing writer', () => {
  it('rejects a transport observation from another request before either database entrypoint writes', async () => {
    const response = await withPacketTelemetryContext({ trace_id: 'trace:other' },
      () => observeTransport('http', async () => ({})));
    expect(await recordPacketCentricTelemetryAcknowledged({ trace_id: 'trace:one', transport_telemetry: response.transportTelemetry })).toBe(false);
    await expect(recordRetrievalEvalTelemetry({ surface: 'fixture', environment: 'test', vectorHits: 0, trigramHits: 0, ftsHits: 0,
      hitsPayload: { trace_id: 'trace:one', transport_telemetry: response.transportTelemetry } })).rejects.toThrow('TRACE_CONTEXT_MISMATCH');
    expect(query).not.toHaveBeenCalled();
  });
  it('preserves trace ID through the existing eval fallback independently of packet identity', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('missing table'), { code: '42P01' }));
    expect(await recordPacketCentricTelemetryAcknowledged({ trace_id: 'trace:one', acp_observation: observation,
      packet_context: { packet_id: 'packet:distinct', source_ref: 'src/fixture.ts' } })).toBe(true);
    const payload = JSON.parse(query.mock.calls[1][1][21]);
    expect(payload.trace_id).toBe('trace:one');
    expect(payload.acp_observation.trace_id).toBe('trace:one');
    expect(payload.packet_context.packet_id).toBe('packet:distinct');
  });

  it('rejects conflicting trace IDs at both existing writer entrypoints', async () => {
    expect(await recordPacketCentricTelemetryAcknowledged({ trace_id: 'trace:other', acp_observation: observation })).toBe(false);
    await expect(recordRetrievalEvalTelemetry({ surface: 'fixture', environment: 'test', vectorHits: 0, trigramHits: 0, ftsHits: 0,
      hitsPayload: { trace_id: 'trace:other', acp_observation: observation } })).rejects.toThrow('TRACE_CONTEXT_MISMATCH');
    expect(query).not.toHaveBeenCalled();
  });

  it('does not infer missing correlation or accept oversized identifiers', async () => {
    expect(await recordPacketCentricTelemetryAcknowledged({ packet_context: { packet_id: 'trace:not-a-request' } })).toBe(true);
    expect(JSON.parse(query.mock.calls[0][1][13])).not.toHaveProperty('trace_id');
    query.mockClear();
    expect(await recordPacketCentricTelemetryAcknowledged({ trace_id: 'x'.repeat(129) })).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves explicit null correlation rather than borrowing a collector default', async () => {
    const collector = new AcpTelemetryCollector({ enable_async_flush: false, trace_id: 'trace:default' });
    collector.recordEvents([{ trace_id: null, timestamp: '2026-10-16T08:00:00.000Z',
      routing_decisions: [], tool_calls: [], async_ops: [] }]);
    await collector.flush();
    expect(JSON.parse(query.mock.calls[0][1][13])).toMatchObject({ trace_id: null, acp_observation: { trace_id: null } });
    collector.destroy();
  });
});
