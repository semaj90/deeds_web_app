/**
 * turbovec-cuda-client.ts — gRPC client for TurboVecService (port 50062)
 *
 * ANN index search + optional orthogonal transform. CPU/SIMD, no LibTorch.
 * For GPU tensor ops (BatchCosine, EncodeLatent, AssignSom) see gpu-bridge-client.ts.
 *
 * Transport boundary: gRPC = typed high-throughput vector/index calls only.
 * JSON-RPC at :8792 handles agent/tool/debug calls (turbovec-prefilter.ts).
 */
import { ENV } from '$lib/server/env.server.js';
import { buildGrpcClientChannelOptions } from './client-options.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TurboVecHealthResponse {
  ok: boolean;
  indexed: number;
  dim: number;
  bits: number;
  backend: string;
}

export interface TurboVecGrpcCandidate {
  id: string;
  score: number;
  clusterId: number;
}

export interface TurboVecGrpcSearchResponse {
  candidates: TurboVecGrpcCandidate[];
  backend: string;
  indexed: number;
}

export interface TurboVecGrpcTransformResponse {
  projectedVectors: number[];
  count: number;
  outDim: number;
}

export interface TurboVecGrpcUpsertRecord {
  id: string;
  vector: number[] | Float32Array;
  featureId?: string;
  communityId?: number;
  tags?: string[];
}

export interface TurboVecGrpcUpsertResponse {
  indexed: number;
  inserted: number;
  updated: number;
  backend: string;
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

    // Use the canonical split proto (TurboVecService only)
    const PROTO_PATH = resolve(process.cwd(), '../proto/active/turbovec_cuda.proto');

    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const descriptor = grpc.loadPackageDefinition(packageDefinition) as Record<string, any>;
    const pkg = descriptor['turbovec'] as Record<string, any>;
    const TurboVecCudaService = pkg['TurboVecCudaService'] as new (
      address: string,
      credentials: any,
      options?: Record<string, any>
    ) => any;

    _client = new TurboVecCudaService(
      ENV.TURBOVEC_SIDECAR_GRPC_URL,
      grpc.credentials.createInsecure(),
      buildGrpcClientChannelOptions({
        maxConnectionIdleMs: 300_000,
        maxSendMessageLength: 32 * 1024 * 1024,
        maxReceiveMessageLength: 32 * 1024 * 1024,
      })
    );

    return _client;
  } catch (err) {
    if (!_failLogged) {
      console.warn(
        '[turbovec-cuda-client] gRPC init failed, will retry in 30s:',
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
  deadlineMs = 2000
): Promise<T | null> {
  return new Promise((resolve) => {
    client[method](
      req,
      { deadline: Date.now() + deadlineMs },
      (err: Error | null, response: T) => {
        if (err) {
          console.warn(`[turbovec-cuda-client] ${method} error:`, err.message);
          resolve(null);
        } else {
          resolve(response);
        }
      }
    );
  });
}

// ── Exported methods ──────────────────────────────────────────────────────────

export async function turbovecGrpcHealth(): Promise<TurboVecHealthResponse | null> {
  const client = await getClient();
  if (!client) return null;
  return grpcCall<TurboVecHealthResponse>(client, 'health', {}, 3000);
}

export async function turbovecGrpcSearch(
  queryVector: number[] | Float32Array,
  topK = 200,
  transformId = ''
): Promise<TurboVecGrpcSearchResponse | null> {
  const client = await getClient();
  if (!client) return null;
  return grpcCall<TurboVecGrpcSearchResponse>(
    client,
    'search',
    { queryVector: Array.from(queryVector), topK, transformId },
    2000
  );
}

export async function turbovecGrpcUpsert(
  records: TurboVecGrpcUpsertRecord[],
  deadlineMs = 30_000
): Promise<TurboVecGrpcUpsertResponse | null> {
  const client = await getClient();
  if (!client) return null;
  const payload = records.map((r) => ({
    id: r.id,
    vector: Array.from(r.vector),
    featureId: r.featureId ?? '',
    communityId: r.communityId ?? 0,
    tags: r.tags ?? [],
  }));
  return grpcCall<TurboVecGrpcUpsertResponse>(client, 'upsert', { records: payload }, deadlineMs);
}

export async function turbovecGrpcTransform(
  vectors: number[] | Float32Array,
  count: number,
  inDim = 768,
  outDim = 64,
  transformId = ''
): Promise<TurboVecGrpcTransformResponse | null> {
  const client = await getClient();
  if (!client) return null;
  return grpcCall<TurboVecGrpcTransformResponse>(
    client,
    'transform',
    { vectors: Array.from(vectors), count, inDim, outDim, transformId },
    5000
  );
}
