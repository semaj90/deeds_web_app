import { beforeEach, describe, expect, it, vi } from 'vitest';

const { packetRecord, legacyRecord } = vi.hoisted(() => ({
  packetRecord: vi.fn().mockResolvedValue(undefined), legacyRecord: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./retrieval-recorder.js', () => ({ recordRetrievalTelemetry: legacyRecord }));
vi.mock('./packet-centric-telemetry.js', () => ({ recordPacketCentricTelemetry: packetRecord }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { NODE_ENV: 'test' } }));
import { recordACERetrievalTelemetry } from './ace-telemetry-emitter.js';
import { observeTransport } from '../grpc/transport-telemetry.js';

beforeEach(() => {
  packetRecord.mockReset().mockResolvedValue(undefined);
  legacyRecord.mockReset().mockResolvedValue(undefined);
});

describe('ACE telemetry provenance forwarding', () => {
  it('forwards an explicitly supplied trace ID without generating one from packet identity or query', async () => {
    await recordACERetrievalTelemetry({ query: 'fixture', latencyMs: 2, retrievalStrategy: 'fusion',
      traceId: 'trace:ace-fixture', packetContext: { packet_id: 'packet:fixture' } });
    expect(packetRecord.mock.calls[0][0].trace_id).toBe('trace:ace-fixture');
  });
  it('does not fabricate a runtime or transport when metrics contain no observations', async () => {
    await recordACERetrievalTelemetry({ query: 'bounded diagnostic', latencyMs: 2, retrievalStrategy: 'fusion' });
    expect(packetRecord.mock.calls[0][0].packet_context).toMatchObject({ schema_version: null,
      embedding_version: null, tool_version: null, gpu_kernel_version: null, rpc_transport: null });
    expect(legacyRecord.mock.calls[0][0].writeEvalTimes).toBe(false);
  });

  it('forwards the supplied packet context and source reference unchanged', async () => {
    const packetContext = { packet_id: 'packet:one', source_ref: 'src/one.ts', rpc_transport: 'http', tool_version: 'observed-r3' };
    await recordACERetrievalTelemetry({ query: 'bounded diagnostic', latencyMs: 2, retrievalStrategy: 'fusion', packetContext });
    expect(packetRecord.mock.calls[0][0].packet_context).toEqual(packetContext);
  });

  it('forwards measured codec observations and uses their actual transport rather than a caller label', async () => {
    const observed = await observeTransport('grpc', async () => ({ results: [] }), 'searchChunks');
    await recordACERetrievalTelemetry({ query: 'bounded diagnostic', latencyMs: 2, retrievalStrategy: 'fusion',
      packetContext: { packet_id: 'packet:one', rpc_transport: 'jsonrpc' }, transportTelemetry: observed.transportTelemetry });
    expect(packetRecord.mock.calls[0][0].packet_context.rpc_transport).toBe('grpc');
    expect(packetRecord.mock.calls[0][0].transport_telemetry).toEqual(observed.transportTelemetry);
    expect(legacyRecord.mock.calls[0][0].writeEvalTimes).toBe(false);
  });
});
