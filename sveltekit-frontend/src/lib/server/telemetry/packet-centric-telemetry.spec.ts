import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));

import { buildPacketCentricEvent, extractPacketContext, normalizePacketContext, recordPacketCentricTelemetry } from './packet-centric-telemetry.js';
import { observeTransport } from '../grpc/transport-telemetry.js';
import { ResourceOperationObservationSchema } from './gpu-telemetry.js';

beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));

describe('packet telemetry provenance', () => {
  it('retains explicitly observed nested identity and runtime versions', () => {
    const context = { packet_id: 'packet:one', source_ref: 'src/one.ts', feature_id: 'code.parse', som_cell: '2,3',
      schema_version: 3, embedding_version: 'embedding-model-r2', tool_version: 'tool-r7',
      gpu_kernel_version: 'cuda-kernel-r4', rpc_transport: 'http' };
    expect(normalizePacketContext({ packet_context: context }).packet_context).toEqual(context);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not infer live protocol or model/kernel versions from a surface or strategy', () => {
    const context = extractPacketContext({ surface: 'grpc', proto: 'grpc', retrieval_strategy: 'cold_neschrom' });
    expect(context).toMatchObject({ source_ref: null, schema_version: null, embedding_version: null,
      tool_version: null, gpu_kernel_version: null, rpc_transport: null });
    expect(query).not.toHaveBeenCalled();
  });

  it('supports explicit legacy fields without overriding nested context', () => {
    const context = extractPacketContext({ packet_id: 'legacy', rpc_transport: 'grpc', source_ref: 'src/legacy.ts',
      packet_context: { packet_id: 'qualified', rpc_transport: 'http', source_ref: 'src/qualified.ts' } });
    expect(context).toMatchObject({ packet_id: 'qualified', source_ref: 'src/qualified.ts', rpc_transport: 'http' });
  });

  it('does not attach a different candidate feature or SOM cell to the primary packet', () => {
    const event = buildPacketCentricEvent([{ packet_key: 'first', source_ref: 'src/first.ts' },
      { packet_key: 'second', source_ref: 'src/second.ts', feature_id: 'second-feature', som_cluster: '8,9' }], 4, 'fusion');
    expect(event.packet_context).toMatchObject({ packet_id: 'first', source_ref: 'src/first.ts', feature_id: null,
      som_cell: null, embedding_version: null, rpc_transport: null });
    expect(event.selected_packet_keys).toEqual(['first', 'second']);
    expect(normalizePacketContext(event).packet_context?.feature_id).toBeNull();
  });

  it('preserves explicitly unknown nested provenance instead of filling it from unrelated legacy metadata', () => {
    expect(extractPacketContext({ embedding_version: 'legacy-model', rpc_transport: 'grpc',
      packet_context: { embedding_version: null, rpc_transport: null } })).toMatchObject({ embedding_version: null, rpc_transport: null });
  });

  it('sends preserved provenance to the existing writer without a new table or connection', async () => {
    await recordPacketCentricTelemetry({ packet_context: { packet_id: 'packet:one', source_ref: 'src/one.ts', rpc_transport: 'http' } });
    expect(query).toHaveBeenCalledTimes(1);
    const parameters = query.mock.calls[0][1];
    expect(parameters[12]).toBe('http');
    expect(JSON.parse(parameters[13]).packet_context).toMatchObject({ source_ref: 'src/one.ts', rpc_transport: 'http' });
  });

  it('preserves provenance and codec observations through the existing eval writer when phase_2_telemetry is absent', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('missing relation'), { code: '42P01' }));
    const transport = { schema: 'atlas.transport-codec-telemetry.v1' as const, observed_at: '2026-10-16T04:00:00.000Z',
      operation: 'searchChunks', measurement_scope: 'CLIENT_CODEC_ONLY' as const, rpc_transport: 'grpc' as const,
      http_version: '2' as const, canonicalAuthority: false as const,
      measurements: { protobuf_encode: { calls: 1, failedCalls: 0, milliseconds: 0.1, bytes: 20 },
        protobuf_decode: null, json_stringify: null, json_parse: null } };
    await recordPacketCentricTelemetry({ query: 'bounded query', latency_ms: 3, transport_telemetry: transport,
      packet_context: { packet_id: 'packet:one', source_ref: 'src/one.ts', rpc_transport: 'grpc' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO atlas_retrieval_eval_times');
    const parameters = query.mock.calls[1][1];
    expect(parameters[4]).toBe('src/one.ts');
    expect(parameters[14]).toBe('grpc');
    expect(JSON.parse(parameters[21])).toEqual({ packet_context: expect.objectContaining({ source_ref: 'src/one.ts' }), transport_telemetry: transport });
    expect(parameters[21]).not.toContain('bounded query');
  });

  it('does not fabricate query, protocol, accelerator or cache-source identity for operation-only telemetry', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('missing relation'), { code: '42P01' }));
    await recordPacketCentricTelemetry({ packet_context: { feature_id: 'gpu.attention' }, cache_hit: true });
    const parameters = query.mock.calls[1][1];
    expect(parameters[0]).toBeNull();
    expect(parameters[1]).toBeNull();
    expect(parameters[11]).toBeNull();
    expect(parameters[12]).toBeNull();
    expect(parameters[14]).toBeNull();
    expect(parameters[15]).toBeNull();
  });

  it('does not switch writers on an unrelated database error', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('constraint'), { code: '23514' }));
    await recordPacketCentricTelemetry({ packet_context: { packet_id: 'packet:one' } });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects hidden or arbitrary transport payload fields before invoking either writer', async () => {
    const observation = await observeTransport('grpc', async () => ({}));
    const invalid = Object.assign({}, observation.transportTelemetry, { tensor: [1, 2] });
    await recordPacketCentricTelemetry({ packet_context: { packet_id: 'packet:one' }, transport_telemetry: invalid });
    expect(query).not.toHaveBeenCalled();
  });

  it('retains validated operation wall time in the existing eval payload without inventing GPU kernel time', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('missing relation'), { code: '42P01' }));
    const resource = ResourceOperationObservationSchema.parse({ schema: 'atlas.resource-operation.v1', operation: 'topk',
      native_export: null, requested_kernel: null, kernel_name: null, kernel_ms: null,
      wall_ms: 3.5, duration_scope: 'PIPELINE_WALL_TIME', execution_backend: 'CPU_REFERENCE',
      reported_backend: null, candidate_count: 3, input_dim: 1, output_dim: 2, canonicalAuthority: false });
    await recordPacketCentricTelemetry({ resource_observation: resource, packet_context: { feature_id: 'gpu.pipeline.topk' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO atlas_retrieval_eval_times');
    const payload = JSON.parse(query.mock.calls[1][1][21]);
    expect(payload.resource_observation).toEqual(resource);
    expect(payload.packet_context.gpu_kernel_version).toBeNull();
    expect(payload.packet_context.rpc_transport).toBeNull();
  });
});
