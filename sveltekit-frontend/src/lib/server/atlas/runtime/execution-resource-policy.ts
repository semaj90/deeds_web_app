import { createHash } from 'node:crypto';

export type MemoryTier =
  | 'GPU_VRAM'
  | 'PINNED_HOST'
  | 'HOST_RAM'
  | 'REDIS_VALKEY'
  | 'NVME_MMAP'
  | 'DUCKDB'
  | 'POSTGRES'
  | 'QDRANT'
  | 'NEO4J';

export type ExecutionTransport =
  | 'IN_PROCESS'
  | 'NAPI'
  | 'GRPC'
  | 'QUIC_STREAM'
  | 'PROTOBUF'
  | 'MSGPACK'
  | 'ARROW_IPC'
  | 'MMAP_REF'
  | 'REDIS_KEY'
  | 'DATABASE_REF';

export interface ResourceSnapshot {
  runtime: 'windows-native' | 'wsl2' | 'cpu-only';
  gpuTotalBytes: number;
  gpuFreeBytes: number;
  gpuReservedBytes: number;
  hostFreeBytes: number;
  nvmeFreeBytes: number;
  logicalCpuCount: number;
  activeCpuWorkers: number;
  activeIoWorkers: number;
  activeRpcCalls: number;
}

export interface ResourceRequest {
  operation: string;
  executor: string;
  inputBytes: number;
  outputBytes: number;
  requiresGpu: boolean;
  crossRuntime: boolean;
  immutableLargeInput?: boolean;
  latencySensitive?: boolean;
  allowQuicStream?: boolean;
  environmentReceiptId?: string | null;
  gpuLeaseId?: string | null;
  producerRevision: string;
}

export interface ExecutionResourcePlan {
  schema: 'atlas.execution-resource-plan.v1';
  planId: string;
  operation: string;
  selectedRuntime: ResourceSnapshot['runtime'];
  selectedExecutor: string;
  inputMode: 'INLINE' | 'BINARY_RPC' | 'REFERENCE';
  inputTier: MemoryTier;
  outputTier: MemoryTier;
  transport: ExecutionTransport;
  maxCpuWorkers: number;
  maxIoWorkers: number;
  maxRpcInflight: number;
  admittedGpuBytes: number;
  environmentReceiptId: string | null;
  gpuLeaseId: string | null;
  reasons: string[];
  producerRevision: string;
  checksum: string;
}

const KiB = 1024;
const MiB = 1024 * KiB;
const DEFAULT_GPU_SAFETY_RESERVE = 768 * MiB;
const INLINE_THRESHOLD = 64 * KiB;
const BINARY_RPC_THRESHOLD = 4 * MiB;

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function boundedCpuWorkers(snapshot: ResourceSnapshot): number {
  // Leave at least two logical CPUs for OS/UI/runtime coordination.
  const capacity = Math.max(1, snapshot.logicalCpuCount - 2);
  return Math.max(1, Math.min(capacity, capacity - snapshot.activeCpuWorkers));
}

function boundedIoWorkers(snapshot: ResourceSnapshot): number {
  // IO may overlap more than CPU math, but keep the queue bounded.
  const target = Math.max(2, Math.min(8, Math.ceil(snapshot.logicalCpuCount / 2)));
  return Math.max(1, target - snapshot.activeIoWorkers);
}

function chooseReferenceTier(snapshot: ResourceSnapshot, bytes: number): MemoryTier {
  if (bytes <= snapshot.hostFreeBytes * 0.25) return 'HOST_RAM';
  if (bytes <= snapshot.nvmeFreeBytes * 0.5) return 'NVME_MMAP';
  return 'DUCKDB';
}

export function planExecutionResources(
  request: ResourceRequest,
  snapshot: ResourceSnapshot,
): ExecutionResourcePlan {
  if (request.inputBytes < 0 || request.outputBytes < 0) throw new Error('byte counts must be non-negative');

  const reasons: string[] = [];
  const totalPayload = request.inputBytes + request.outputBytes;
  let inputMode: ExecutionResourcePlan['inputMode'];
  let inputTier: MemoryTier;
  let transport: ExecutionTransport;

  if (!request.crossRuntime) {
    if (totalPayload <= INLINE_THRESHOLD) {
      inputMode = 'INLINE';
      inputTier = 'HOST_RAM';
      transport = snapshot.runtime === 'windows-native' ? 'NAPI' : 'IN_PROCESS';
      reasons.push('small same-runtime control/data payload');
    } else if (request.immutableLargeInput || totalPayload > BINARY_RPC_THRESHOLD) {
      inputMode = 'REFERENCE';
      inputTier = chooseReferenceTier(snapshot, request.inputBytes);
      transport = inputTier === 'NVME_MMAP' ? 'MMAP_REF' : inputTier === 'DUCKDB' ? 'DATABASE_REF' : 'ARROW_IPC';
      reasons.push('large immutable input uses reference/offload transport');
    } else {
      inputMode = 'BINARY_RPC';
      inputTier = 'PINNED_HOST';
      transport = 'PROTOBUF';
      reasons.push('medium same-runtime binary payload');
    }
  } else if (request.immutableLargeInput || totalPayload > BINARY_RPC_THRESHOLD) {
    inputMode = 'REFERENCE';
    inputTier = chooseReferenceTier(snapshot, request.inputBytes);
    transport = inputTier === 'NVME_MMAP' ? 'MMAP_REF' : 'ARROW_IPC';
    reasons.push('large Windows/WSL payload referenced through immutable shared artifact');
  } else {
    inputMode = 'BINARY_RPC';
    inputTier = 'PINNED_HOST';
    transport = request.allowQuicStream && !request.latencySensitive ? 'QUIC_STREAM' : 'GRPC';
    reasons.push(transport === 'GRPC' ? 'reliable cross-language worker RPC' : 'optional multiplexed stream transport');
  }

  let admittedGpuBytes = 0;
  if (request.requiresGpu) {
    if (!request.environmentReceiptId || !request.gpuLeaseId) {
      throw new Error('GPU execution requires environmentReceiptId and gpuLeaseId');
    }
    const physicallyAvailable = Math.max(
      0,
      snapshot.gpuFreeBytes - snapshot.gpuReservedBytes - DEFAULT_GPU_SAFETY_RESERVE,
    );
    const requested = Math.max(request.inputBytes, request.outputBytes);
    if (requested > physicallyAvailable) {
      throw new Error(`GPU_VRAM_BUDGET_EXCEEDED:${requested}>${physicallyAvailable}`);
    }
    admittedGpuBytes = requested;
    reasons.push('GPU bytes admitted beneath shared Windows/WSL safety reserve');
  }

  const outputTier: MemoryTier = request.requiresGpu && request.outputBytes <= admittedGpuBytes
    ? 'GPU_VRAM'
    : request.outputBytes <= snapshot.hostFreeBytes * 0.25
      ? 'HOST_RAM'
      : 'NVME_MMAP';

  const body = {
    schema: 'atlas.execution-resource-plan.v1' as const,
    planId: '',
    operation: request.operation,
    selectedRuntime: snapshot.runtime,
    selectedExecutor: request.executor,
    inputMode,
    inputTier,
    outputTier,
    transport,
    maxCpuWorkers: boundedCpuWorkers(snapshot),
    maxIoWorkers: boundedIoWorkers(snapshot),
    maxRpcInflight: Math.max(1, Math.min(16, 16 - snapshot.activeRpcCalls)),
    admittedGpuBytes,
    environmentReceiptId: request.environmentReceiptId ?? null,
    gpuLeaseId: request.gpuLeaseId ?? null,
    reasons,
    producerRevision: request.producerRevision,
  };
  const checksum = hash(body);
  return { ...body, planId: `erp_${checksum.slice(0, 20)}`, checksum };
}
