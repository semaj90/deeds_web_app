import { createHash } from 'node:crypto';

export type TensorExchangeRuntime = 'windows-native' | 'wsl2' | 'cpu-only';
export type TensorExchangeTransport =
  | 'NAPI_SYNC_HOST_VIEW'
  | 'NAPI_ASYNC_OWNED_COPY'
  | 'DLPACK_DEVICE'
  | 'ARROW_REF'
  | 'MMAP_REF'
  | 'PROTOBUF_TENSORREF';
export type TensorMemoryDevice = 'CPU' | 'CUDA';
export type TensorExchangeDtype = 'fp32' | 'fp16' | 'bf16' | 'int8' | 'int32' | 'int64';
export type TensorOwnership = 'BORROWED_JS_ARRAYBUFFER' | 'OWNED_NATIVE_BUFFER' | 'DLPACK_SHARED' | 'IMMUTABLE_EXTERNAL_REF';
export type TensorLifetime = 'CALL_SCOPED' | 'PROMISE_SCOPED' | 'EXTERNAL_OWNER';

export interface NativeTensorExchangeV1 {
  schema: 'atlas.native-tensor-exchange.v1';
  exchangeId: string;
  dataRefId: string | null;
  producerRuntime: TensorExchangeRuntime;
  consumerRuntime: TensorExchangeRuntime;
  transportMode: TensorExchangeTransport;
  memoryDevice: TensorMemoryDevice;
  dtype: TensorExchangeDtype;
  shape: number[];
  strides: number[];
  contiguous: boolean;
  byteOffset: number;
  byteLength: number;
  ownership: TensorOwnership;
  lifetime: TensorLifetime;
  synchronization: 'NONE' | 'PRODUCER_CONSUMER_SYNC_REQUIRED';
  immutable: boolean;
  environmentReceiptId: string | null;
  gpuLeaseId: string | null;
  dataChecksum: string | null;
  producerRevision: string;
  checksum: string;
}

const DTYPE_BYTES: Record<TensorExchangeDtype, number> = {
  fp32: 4,
  fp16: 2,
  bf16: 2,
  int8: 1,
  int32: 4,
  int64: 8,
};

function stableHash(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function contiguousByteLength(shape: readonly number[], dtype: TensorExchangeDtype): number {
  if (!shape.length || shape.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
    throw new Error('TENSOR_EXCHANGE_SHAPE_INVALID');
  }
  return shape.reduce((product, n) => product * n, 1) * DTYPE_BYTES[dtype];
}

export function buildNativeTensorExchange(input: {
  dataRefId?: string | null;
  producerRuntime: TensorExchangeRuntime;
  consumerRuntime: TensorExchangeRuntime;
  transportMode: TensorExchangeTransport;
  memoryDevice: TensorMemoryDevice;
  dtype: TensorExchangeDtype;
  shape: number[];
  strides?: number[];
  contiguous?: boolean;
  byteOffset?: number;
  byteLength?: number;
  ownership: TensorOwnership;
  lifetime: TensorLifetime;
  synchronization?: 'NONE' | 'PRODUCER_CONSUMER_SYNC_REQUIRED';
  immutable?: boolean;
  environmentReceiptId?: string | null;
  gpuLeaseId?: string | null;
  dataChecksum?: string | null;
  producerRevision?: string;
}): NativeTensorExchangeV1 {
  const contiguous = input.contiguous ?? true;
  const expectedBytes = contiguousByteLength(input.shape, input.dtype);
  const byteLength = input.byteLength ?? expectedBytes;
  const byteOffset = input.byteOffset ?? 0;
  const strides = input.strides ?? [];
  const crossRuntime = input.producerRuntime !== input.consumerRuntime;

  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0) throw new Error('TENSOR_EXCHANGE_BYTE_OFFSET_INVALID');
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error('TENSOR_EXCHANGE_BYTE_LENGTH_INVALID');
  if (contiguous && byteLength !== expectedBytes) {
    throw new Error(`TENSOR_EXCHANGE_BYTE_LENGTH_MISMATCH:${byteLength}!=${expectedBytes}`);
  }
  if (strides.length && strides.length !== input.shape.length) throw new Error('TENSOR_EXCHANGE_STRIDE_RANK_MISMATCH');

  if (input.transportMode === 'NAPI_SYNC_HOST_VIEW') {
    if (input.memoryDevice !== 'CPU') throw new Error('TENSOR_EXCHANGE_JS_TYPED_ARRAY_IS_HOST_MEMORY');
    if (input.ownership !== 'BORROWED_JS_ARRAYBUFFER' || input.lifetime !== 'CALL_SCOPED') {
      throw new Error('TENSOR_EXCHANGE_SYNC_NAPI_REQUIRES_CALL_SCOPED_JS_BORROW');
    }
    if (crossRuntime) throw new Error('TENSOR_EXCHANGE_NAPI_CANNOT_CROSS_RUNTIME');
  }

  if (input.transportMode === 'NAPI_ASYNC_OWNED_COPY') {
    if (input.memoryDevice !== 'CPU') throw new Error('TENSOR_EXCHANGE_ASYNC_NAPI_INPUT_IS_HOST_COPY');
    if (input.ownership !== 'OWNED_NATIVE_BUFFER' || input.lifetime !== 'PROMISE_SCOPED') {
      throw new Error('TENSOR_EXCHANGE_ASYNC_NAPI_REQUIRES_OWNED_PROMISE_BUFFER');
    }
    if (crossRuntime) throw new Error('TENSOR_EXCHANGE_NAPI_CANNOT_CROSS_RUNTIME');
  }

  if (input.transportMode === 'DLPACK_DEVICE') {
    if (crossRuntime) throw new Error('TENSOR_EXCHANGE_DLPACK_CROSS_RUNTIME_FORBIDDEN');
    if (input.ownership !== 'DLPACK_SHARED' || input.lifetime !== 'EXTERNAL_OWNER') {
      throw new Error('TENSOR_EXCHANGE_DLPACK_REQUIRES_EXTERNAL_SHARED_OWNER');
    }
    if ((input.synchronization ?? 'NONE') !== 'PRODUCER_CONSUMER_SYNC_REQUIRED') {
      throw new Error('TENSOR_EXCHANGE_DLPACK_SYNC_REQUIRED');
    }
  }

  if (['ARROW_REF', 'MMAP_REF', 'PROTOBUF_TENSORREF'].includes(input.transportMode)) {
    if (input.ownership !== 'IMMUTABLE_EXTERNAL_REF' || input.lifetime !== 'EXTERNAL_OWNER') {
      throw new Error('TENSOR_EXCHANGE_REFERENCE_REQUIRES_IMMUTABLE_EXTERNAL_OWNER');
    }
    if (!input.dataRefId) throw new Error('TENSOR_EXCHANGE_DATA_REF_REQUIRED');
  }

  if (input.memoryDevice === 'CUDA' && (!input.environmentReceiptId || !input.gpuLeaseId)) {
    throw new Error('TENSOR_EXCHANGE_CUDA_PROOF_REQUIRED');
  }

  const body = {
    schema: 'atlas.native-tensor-exchange.v1' as const,
    exchangeId: '',
    dataRefId: input.dataRefId ?? null,
    producerRuntime: input.producerRuntime,
    consumerRuntime: input.consumerRuntime,
    transportMode: input.transportMode,
    memoryDevice: input.memoryDevice,
    dtype: input.dtype,
    shape: [...input.shape],
    strides: [...strides],
    contiguous,
    byteOffset,
    byteLength,
    ownership: input.ownership,
    lifetime: input.lifetime,
    synchronization: input.synchronization ?? 'NONE',
    immutable: input.immutable ?? false,
    environmentReceiptId: input.environmentReceiptId ?? null,
    gpuLeaseId: input.gpuLeaseId ?? null,
    dataChecksum: input.dataChecksum ?? null,
    producerRevision: input.producerRevision ?? 'native-tensor-exchange-v1',
  };
  const checksum = stableHash(body);
  return { ...body, exchangeId: `ntx_${checksum.slice(0, 20)}`, checksum };
}

/**
 * Safe default planner for Node -> native execution.
 *
 * - synchronous in-process calls may borrow a TypedArray for the duration of the
 *   callback; LibTorch may create a CPU from_blob view and then explicitly copy
 *   to CUDA inside that call.
 * - asynchronous native work copies into native-owned host memory before the
 *   worker starts, because worker threads must not depend on mutable JS objects.
 * - large/cross-runtime tensors use immutable references instead of N-API copies.
 */
export function chooseNodeNativeTensorTransport(input: {
  asynchronous: boolean;
  crossRuntime: boolean;
  byteLength: number;
  immutable: boolean;
}): TensorExchangeTransport {
  if (input.crossRuntime) {
    return input.immutable && input.byteLength >= 4 * 1024 * 1024 ? 'MMAP_REF' : 'PROTOBUF_TENSORREF';
  }
  if (input.asynchronous) return 'NAPI_ASYNC_OWNED_COPY';
  return 'NAPI_SYNC_HOST_VIEW';
}
