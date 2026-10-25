import { beforeEach, describe, expect, it, vi } from 'vitest';
const { record } = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock('./packet-centric-telemetry.js', () => ({ recordPacketCentricTelemetry: record }));
import { emitTelemetry, observeComputeOperation, observeStoreRequest, recordResourceOperation, ResourceOperationObservationSchema, SupportedComputeKernelOperations } from './gpu-telemetry.js';

beforeEach(() => record.mockReset().mockResolvedValue(undefined));

describe('resource telemetry projection', () => {
  it('forwards validated wall time without treating a remote backend label or requested export as kernel proof', async () => {
    await emitTelemetry({ kernel_name: 'batchCosineTopK', gpu_backend: 'cuda', operation: 'topk', duration_ms: 3,
      input_dim: 768, candidate_count: 4, tensor: new Float32Array([1, 2]) });
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const event = record.mock.calls[0][0];
    expect(event.resource_observation).toMatchObject({ reported_backend: 'cuda', requested_kernel: 'batchCosineTopK',
      execution_backend: 'REMOTE_UNVERIFIED', kernel_name: null, kernel_ms: null, wall_ms: 3 });
    expect(event.resource_observation).not.toHaveProperty('tensor');
    expect(event.packet_context).toEqual({ feature_id: 'gpu.pipeline.topk' });
  });

  it('rejects extra data and nonfinite durations and never lets telemetry failure escape', async () => {
    await emitTelemetry({ kernel_name: 'x', gpu_backend: 'cuda', operation: 'topk', duration_ms: Infinity });
    expect(record).not.toHaveBeenCalled();
    const base = { schema: 'atlas.resource-operation.v1', operation: 'topk', native_export: null, requested_kernel: null,
      kernel_name: null, kernel_ms: null, wall_ms: 1, duration_scope: 'PIPELINE_WALL_TIME',
      execution_backend: 'CPU_REFERENCE', reported_backend: null, candidate_count: 2, input_dim: 1, output_dim: 1, canonicalAuthority: false };
    expect(ResourceOperationObservationSchema.safeParse({ ...base, tensor: [1] }).success).toBe(false);
    expect(ResourceOperationObservationSchema.safeParse({ ...base, kernel_ms: 0.2 }).success).toBe(false);
    record.mockRejectedValueOnce(new Error('fixture writer unavailable'));
    await expect(recordResourceOperation(ResourceOperationObservationSchema.parse(base))).resolves.toBeUndefined();
  });
});

describe('independent store request observations', () => {
  it.each([
    ['redis', 'get'], ['redis', 'hgetall'], ['redis', 'hmget'],
    ['qdrant', 'points_query'], ['neo4j', 'read_query'],
  ] as const)('times %s %s without capturing its result', async (service, operation) => {
    const result = { privateContents: 'must not enter telemetry' };
    const request = vi.fn().mockResolvedValue(result);
    const context = { packet_id: 'packet:fixture', source_ref: 'src/fixture.ts' };
    expect(await observeStoreRequest(service, operation, request, context)).toBe(result);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const event = record.mock.calls[0][0];
    expect(event.packet_context).toEqual(context);
    expect(event.resource_observation).toMatchObject({ schema: 'atlas.store-operation.v1', service, operation,
      outcome: 'RETURNED', duration_scope: 'CLIENT_REQUEST_WALL_TIME', kernel_name: null, kernel_ms: null });
    expect(event.latency_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(event)).not.toContain(result.privateContents);
    expect(ResourceOperationObservationSchema.safeParse(event.resource_observation).success).toBe(true);
  });

  it('preserves the original rejection and emits a failed observation without error contents', async () => {
    const failure = new Error('private query and credentials');
    await expect(observeStoreRequest('neo4j', 'read_query', () => { throw failure; })).rejects.toBe(failure);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0].resource_observation.outcome).toBe('THREW');
    expect(JSON.stringify(record.mock.calls[0][0])).not.toContain(failure.message);
  });

  it('does not wait for the telemetry writer and does not confuse null cache results with failure', async () => {
    record.mockImplementationOnce(() => new Promise(() => {}));
    await expect(observeStoreRequest('redis', 'get', async () => null)).resolves.toBeNull();
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0].resource_observation.outcome).toBe('RETURNED');
  });

  it('isolates concurrent observations and rejects invalid service-operation combinations', async () => {
    await Promise.all([
      observeStoreRequest('redis', 'get', async () => 1),
      observeStoreRequest('qdrant', 'points_query', async () => 2),
    ]);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    const observations = record.mock.calls.map(([event]) => event.resource_observation);
    expect(observations.map((observation) => observation.service).sort()).toEqual(['qdrant', 'redis']);
    const base = observations[0];
    expect(ResourceOperationObservationSchema.safeParse({ ...base, service: 'neo4j', operation: 'get' }).success).toBe(false);
    expect(ResourceOperationObservationSchema.safeParse({ ...base, wall_ms: Infinity }).success).toBe(false);
    expect(ResourceOperationObservationSchema.safeParse({ ...base, response: [1, 2] }).success).toBe(false);
  });
});

describe('compute kernel operation observations', () => {
  it.each([
    'embedding',
    'gemm',
    'cosine_similarity',
    'topk',
    'cross_encoder',
    'autoencoder',
    'som_lookup',
  ] as const)('times and tracks compute operation %s with packet context', async (op) => {
    const action = vi.fn().mockResolvedValue({ status: 'computed' });
    const context = {
      packet_id: 'nes:feat_deeds:0123456789ab',
      feature_id: 'real_estate.deeds',
      som_cell: '12,7',
      schema_version: 2,
      embedding_version: 'embeddinggemma:2.0',
      gpu_kernel_version: 'cuvs_cagra_v1',
    };

    const result = await observeComputeOperation(
      op,
      {
        requestedKernel: `kernel_${op}_cuda`,
        reportedBackend: 'cuda',
        candidateCount: 128,
        inputDim: 768,
        outputDim: 256,
      },
      action,
      context
    );

    expect(result).toEqual({ status: 'computed' });
    expect(action).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));

    const event = record.mock.calls[0][0];
    expect(event.packet_context).toEqual(context);
    expect(event.resource_observation).toMatchObject({
      schema: 'atlas.resource-operation.v1',
      operation: op,
      requested_kernel: `kernel_${op}_cuda`,
      reported_backend: 'cuda',
      candidate_count: 128,
      input_dim: 768,
      output_dim: 256,
      kernel_name: null,
      kernel_ms: null,
      canonicalAuthority: false,
    });
    expect(event.resource_observation.wall_ms).toBeGreaterThanOrEqual(0);
    expect(ResourceOperationObservationSchema.safeParse(event.resource_observation).success).toBe(true);
  });
});
