/**
 * gpu-bridge-client.ts — gRPC client for GpuBridgeService (port 50062)
 *
 * Handles LibTorch/CUDA N-API matrix operations that are conceptually separate
 * from the TurboVec ANN index. Both run on the same sidecar process for now,
 * but the proto boundary is correct: this service is about GPU tensor ops,
 * not vector-index search.
 *
 * Transport: gRPC at TURBOVEC_SIDECAR_GRPC_URL (same address as TurboVec —
 * the sidecar exposes both services on the same port via a single gRPC server).
 */
import { ENV } from '$lib/server/env.server.js';
import { buildGrpcClientChannelOptions } from './client-options.js';
import { emitTelemetry } from '$lib/server/telemetry/gpu-telemetry.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface GpuBatchCosineResponse {
  scores: number[];
  count: number;
}

export interface GpuEncodeLatentResponse {
  encoded: number[];
  count: number;
  outDim: number;
}

export interface GpuAssignSomResponse {
  clusterIds: number[];
  bmuScores: number[];
}

// ── Client singleton ──────────────────────────────────────────────────────────

let _client: any = null;
let _loadFailed = false;
let _retryAt = 0;
let _failLogged = false;

async function getClient(): Promise<any> {
  if (_loadFailed) {
    if (Date.now() < _retryAt) return null;
    _loadFailed = false;
    _client = null;
  }
  if (_client) return _client;

  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');
    const { resolve } = await import('path');

    const PROTO_PATH = resolve(process.cwd(), '../proto/active/gpu_bridge.proto');

    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const descriptor = grpc.loadPackageDefinition(packageDefinition) as Record<string, any>;
    const pkg = descriptor['gpubridge'] as Record<string, any>;
    const GpuBridgeService = pkg['GpuBridgeService'] as new (
      address: string,
      credentials: any,
      options?: Record<string, any>
    ) => any;

    _client = new GpuBridgeService(
      ENV.TURBOVEC_SIDECAR_GRPC_URL,
      grpc.credentials.createInsecure(),
      buildGrpcClientChannelOptions({
        maxConnectionIdleMs: 300_000,
        maxSendMessageLength: 64 * 1024 * 1024,
        maxReceiveMessageLength: 64 * 1024 * 1024,
      })
    );

    return _client;
  } catch (err) {
    if (!_failLogged) {
      console.warn(
        '[gpu-bridge-client] gRPC init failed, will retry in 30s:',
        (err as Error).message
      );
      _failLogged = true;
    }
    _loadFailed = true;
    _retryAt = Date.now() + 30_000;
    return null;
  }
}

function grpcCall<T>(
  client: any,
  method: string,
  req: Record<string, unknown>,
  deadlineMs = 5000
): Promise<T | null> {
  return new Promise((resolve) => {
    client[method](
      req,
      { deadline: Date.now() + deadlineMs },
      (err: Error | null, response: T) => {
        if (err) {
          console.warn(`[gpu-bridge-client] ${method} error:`, err.message);
          resolve(null);
        } else {
          resolve(response);
        }
      }
    );
  });
}

// ── Exported methods ──────────────────────────────────────────────────────────

export async function gpuBatchCosine(
  queryVector: number[] | Float32Array,
  candidateVectors: number[] | Float32Array,
  candidateCount: number,
  dim = 768
): Promise<GpuBatchCosineResponse | null> {
  const telemetryStart = Date.now();
  const client = await getClient();
  if (!client) {
    try {
      await emitTelemetry({
        kernel_name: 'batchCosineSimilarity',
        gpu_backend: 'cpu_fallback',
        operation: 'cosine',
        candidate_count: candidateCount,
        input_dim: dim,
        output_dim: 1,
        fallback_used: true,
        error_code: 'grpc_client_unavailable',
        duration_ms: Date.now() - telemetryStart,
        rpc_transport: 'grpc'
      });
    } catch {}
    return null;
  }

  const response = await grpcCall<GpuBatchCosineResponse>(
    client,
    'batchCosine',
    {
      queryVector: Array.from(queryVector),
      candidateVectors: Array.from(candidateVectors),
      candidateCount,
      dim,
    },
    8000
  );

  try {
    await emitTelemetry({
      kernel_name: 'batchCosineSimilarity',
      gpu_backend: response ? 'cuda' : 'cpu_fallback',
      operation: 'cosine',
      candidate_count: candidateCount,
      input_dim: dim,
      output_dim: 1,
      fallback_used: !response,
      error_code: response ? undefined : 'grpc_call_failed',
      duration_ms: Date.now() - telemetryStart,
      rpc_transport: 'grpc'
    });
  } catch {}

  return response;
}

export async function gpuEncodeLatent(
  vectors: number[] | Float32Array,
  count: number,
  inDim = 768,
  outDim = 64
): Promise<GpuEncodeLatentResponse | null> {
  const telemetryStart = Date.now();
  const client = await getClient();
  if (!client) {
    try {
      await emitTelemetry({
        kernel_name: 'encodeLatent',
        gpu_backend: 'cpu_fallback',
        operation: 'autoencoder',
        candidate_count: count,
        input_dim: inDim,
        output_dim: outDim,
        fallback_used: true,
        error_code: 'grpc_client_unavailable',
        duration_ms: Date.now() - telemetryStart,
        rpc_transport: 'grpc'
      });
    } catch {}
    return null;
  }

  const response = await grpcCall<GpuEncodeLatentResponse>(
    client,
    'encodeLatent',
    { vectors: Array.from(vectors), count, inDim, outDim },
    8000
  );

  try {
    await emitTelemetry({
      kernel_name: 'encodeLatent',
      gpu_backend: response ? 'cuda' : 'cpu_fallback',
      operation: 'autoencoder',
      candidate_count: count,
      input_dim: inDim,
      output_dim: outDim,
      fallback_used: !response,
      error_code: response ? undefined : 'grpc_call_failed',
      duration_ms: Date.now() - telemetryStart,
      rpc_transport: 'grpc'
    });
  } catch {}

  return response;
}

export async function gpuAssignSom(
  vectors: number[] | Float32Array,
  count: number
): Promise<GpuAssignSomResponse | null> {
  const telemetryStart = Date.now();
  const client = await getClient();
  if (!client) {
    try {
      await emitTelemetry({
        kernel_name: 'assignSom',
        gpu_backend: 'cpu_fallback',
        operation: 'som_assign',
        candidate_count: count,
        input_dim: 768,
        output_dim: 2, // BMU row, col
        fallback_used: true,
        error_code: 'grpc_client_unavailable',
        duration_ms: Date.now() - telemetryStart,
        rpc_transport: 'grpc'
      });
    } catch {}
    return null;
  }

  const response = await grpcCall<GpuAssignSomResponse>(
    client,
    'assignSom',
    { vectors: Array.from(vectors), count },
    8000
  );

  try {
    await emitTelemetry({
      kernel_name: 'assignSom',
      gpu_backend: response ? 'cuda' : 'cpu_fallback',
      operation: 'som_assign',
      candidate_count: count,
      input_dim: 768,
      output_dim: 2,
      fallback_used: !response,
      error_code: response ? undefined : 'grpc_call_failed',
      duration_ms: Date.now() - telemetryStart,
      rpc_transport: 'grpc'
    });
  } catch {}

  return response;
}
