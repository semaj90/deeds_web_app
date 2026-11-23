/**
 * TensorHandleV1 (4x4x6 Spatial Tile Feature Buffer Codec + Safer 7-State Residency FSM)
 *
 * Byte-for-byte TypeScript mirror of `atlas::native::encode_tensor_handle_4x4x6_v1` /
 * `decode_tensor_handle_4x4x6_v1` in `packages/atlas-native-core/include/tile_assembler.hpp`.
 *
 * Binary layout (160 bytes total = 64-byte header + 48-byte channel affine params + 48-byte INT4 nibbles):
 *   - Bytes   0..3   (4B): Magic 0x54485631 ("THV1" LE)
 *   - Bytes   4..7   (4B): Endian Tag 0x01020304 (LE)
 *   - Bytes   8..11  (4B): candidateOrdinal (uint32 LE)
 *   - Bytes  12..13  (2B): kmeansClusterId (uint16 LE)
 *   - Bytes  14..15  (2B): somBmuId (uint16 LE, 0..399)
 *   - Bytes  16..23  (8B): workspaceRevisionPrefix64 (uint64 LE)
 *   - Bytes  24..31  (8B): sourceRevisionPrefix64 (uint64 LE)
 *   - Bytes  32..55 (24B): Mode-7 / 2D Affine Transform [a, b, tx, c, d, ty] (6 x float32 LE)
 *   - Byte   56      (1B): SafeTileResidencyStateV1 (uint8, 0..6)
 *   - Byte   57      (1B): shapeCode (0x46 = 4x4x6)
 *   - Bytes  58..59  (2B): activeConsumers (uint16 LE)
 *   - Bytes  60..63  (4B): bodyChecksumPrefix32 (first 4 bytes of SHA-256 over bytes 64..159)
 *   - Bytes  64..111 (48B): 6 channels x (min_c: float32 LE, scale_c: float32 LE)
 *   - Bytes 112..159 (48B): 96 x 4-bit quantized nibbles (low nibble = even index, high nibble = odd index)
 */

import { createHash } from 'node:crypto';

export const TENSOR_HANDLE_V1_MAGIC_LE = 0x54485631; // "THV1"
export const TENSOR_HANDLE_V1_ENDIAN_LE = 0x01020304;
export const TENSOR_HANDLE_V1_SHAPE_CODE_4X4X6 = 0x46;
export const TENSOR_HANDLE_V1_HEADER_BYTES = 64;
export const TENSOR_HANDLE_V1_ELEMENT_COUNT = 96; // 4 * 4 * 6
export const TENSOR_HANDLE_V1_TOTAL_BYTES = 160;

export enum SafeTileResidencyStateV1 {
  ABSENT = 0,
  HOST_STAGED = 1,
  GPU_PENDING = 2,
  GPU_READY = 3,
  IN_USE = 4,
  EVICTABLE = 5,
  EVICTED = 6,
}

export function transitionSafeTileResidencyV1(input: {
  current: SafeTileResidencyStateV1;
  target: SafeTileResidencyStateV1;
  transferCompleted: boolean;
  activeConsumers: number;
  revisionMatched?: boolean;
  leaseExpiresAtMs?: number | null;
  evictedAtMs?: number | null;
  nowMs?: number;
}): SafeTileResidencyStateV1 {
  if (input.revisionMatched === false) {
    return SafeTileResidencyStateV1.ABSENT;
  }
  if (input.evictedAtMs !== undefined && input.evictedAtMs !== null) {
    return SafeTileResidencyStateV1.EVICTED;
  }
  const nowMs = input.nowMs ?? Date.now();
  if (
    input.leaseExpiresAtMs !== undefined &&
    input.leaseExpiresAtMs !== null &&
    nowMs >= input.leaseExpiresAtMs &&
    (input.target === SafeTileResidencyStateV1.IN_USE ||
      input.target === SafeTileResidencyStateV1.GPU_READY)
  ) {
    throw new Error('SAFE_RESIDENCY_LEASE_EXPIRED');
  }
  const { current, target, transferCompleted, activeConsumers } = input;
  switch (current) {
    case SafeTileResidencyStateV1.ABSENT:
      if (target === SafeTileResidencyStateV1.HOST_STAGED) return target;
      break;
    case SafeTileResidencyStateV1.HOST_STAGED:
      if (
        target === SafeTileResidencyStateV1.GPU_PENDING ||
        target === SafeTileResidencyStateV1.EVICTED
      )
        return target;
      break;
    case SafeTileResidencyStateV1.GPU_PENDING:
      if (target === SafeTileResidencyStateV1.GPU_READY) {
        if (!transferCompleted)
          throw new Error('SAFE_RESIDENCY_GPU_READY_REQUIRES_TRANSFER_COMPLETE');
        return target;
      }
      break;
    case SafeTileResidencyStateV1.GPU_READY:
      if (
        target === SafeTileResidencyStateV1.IN_USE ||
        target === SafeTileResidencyStateV1.EVICTABLE
      )
        return target;
      break;
    case SafeTileResidencyStateV1.IN_USE:
      if (target === SafeTileResidencyStateV1.GPU_READY) return target;
      if (target === SafeTileResidencyStateV1.EVICTABLE) {
        if (activeConsumers > 0)
          throw new Error('SAFE_RESIDENCY_EVICTABLE_REQUIRES_ZERO_CONSUMERS');
        return target;
      }
      break;
    case SafeTileResidencyStateV1.EVICTABLE:
      if (target === SafeTileResidencyStateV1.IN_USE) return target;
      if (target === SafeTileResidencyStateV1.EVICTED) {
        if (activeConsumers > 0)
          throw new Error('SAFE_RESIDENCY_EVICT_REQUIRES_ZERO_CONSUMERS');
        return target;
      }
      break;
    case SafeTileResidencyStateV1.EVICTED:
      if (
        target === SafeTileResidencyStateV1.HOST_STAGED ||
        target === SafeTileResidencyStateV1.ABSENT
      )
        return target;
      break;
  }
  throw new Error('SAFE_RESIDENCY_TRANSITION_FORBIDDEN');
}

/** Pre-read VRAM pressure / lease TTL / eviction check before reading a resident GPU tile. */
export function assertGpuTileReadableV1(input: {
  residencyState: SafeTileResidencyStateV1;
  revisionMatched?: boolean;
  leaseExpiresAtMs?: number | null;
  evictedAtMs?: number | null;
  nowMs?: number;
}): { readable: boolean; reason: string | null } {
  if (input.revisionMatched === false) {
    return { readable: false, reason: 'STALE_REVISION' };
  }
  if (input.evictedAtMs !== undefined && input.evictedAtMs !== null) {
    return { readable: false, reason: 'TILE_EVICTED' };
  }
  const nowMs = input.nowMs ?? Date.now();
  if (
    input.leaseExpiresAtMs !== undefined &&
    input.leaseExpiresAtMs !== null &&
    nowMs >= input.leaseExpiresAtMs
  ) {
    return { readable: false, reason: 'RESIDENCY_LEASE_EXPIRED' };
  }
  if (
    input.residencyState !== SafeTileResidencyStateV1.GPU_READY &&
    input.residencyState !== SafeTileResidencyStateV1.IN_USE
  ) {
    return { readable: false, reason: 'TILE_NOT_RESIDENT' };
  }
  return { readable: true, reason: null };
}

export interface ResidentGpuTileRecordV1 {
  tileId: string;
  residencyState: SafeTileResidencyStateV1;
  byteSize: number;
  activeConsumers: number;
  revisionMatched?: boolean;
  leaseExpiresAtMs?: number | null;
  evictedAtMs?: number | null;
}

export interface VramPressureEvictionResultV1 {
  triggered: boolean;
  freeVramMiB: number;
  minFreeVramMiB: number;
  evictedTileIds: string[];
  reclaimedBytes: number;
  skippedPinnedCount: number;
}

export function createVramPressureEvictionCoordinatorV1(options: {
  minFreeVramMiB?: number;
  onEvict?: (tile: ResidentGpuTileRecordV1) => void;
} = {}) {
  const defaultMinFreeVramMiB = options.minFreeVramMiB ?? 1536;
  const lru = new Map<string, ResidentGpuTileRecordV1>();

  return {
    registerOrTouch(tile: ResidentGpuTileRecordV1): void {
      lru.delete(tile.tileId);
      lru.set(tile.tileId, tile);
    },
    getTile(tileId: string): ResidentGpuTileRecordV1 | undefined {
      return lru.get(tileId);
    },
    onVramPressure(input: {
      freeVramMiB: number;
      minFreeVramMiB?: number;
      targetReclaimBytes?: number;
      nowMs?: number;
    }): VramPressureEvictionResultV1 {
      const threshold = input.minFreeVramMiB ?? defaultMinFreeVramMiB;
      const nowMs = input.nowMs ?? Date.now();
      const needReclaim =
        input.freeVramMiB < threshold || (input.targetReclaimBytes ?? 0) > 0;
      if (!needReclaim) {
        return {
          triggered: false,
          freeVramMiB: input.freeVramMiB,
          minFreeVramMiB: threshold,
          evictedTileIds: [],
          reclaimedBytes: 0,
          skippedPinnedCount: 0,
        };
      }

      const evictedTileIds: string[] = [];
      let reclaimedBytes = 0;
      let skippedPinnedCount = 0;

      for (const [tileId, tile] of Array.from(lru.entries())) {
        if (
          input.targetReclaimBytes !== undefined &&
          reclaimedBytes >= input.targetReclaimBytes
        ) {
          break;
        }
        if (
          tile.residencyState !== SafeTileResidencyStateV1.EVICTABLE ||
          tile.activeConsumers > 0
        ) {
          skippedPinnedCount += 1;
          continue;
        }
        tile.residencyState = transitionSafeTileResidencyV1({
          current: tile.residencyState,
          target: SafeTileResidencyStateV1.EVICTED,
          transferCompleted: true,
          activeConsumers: tile.activeConsumers,
          nowMs,
        });
        tile.evictedAtMs = nowMs;
        lru.delete(tileId);
        evictedTileIds.push(tileId);
        reclaimedBytes += tile.byteSize;
        options.onEvict?.(tile);
      }

      return {
        triggered: true,
        freeVramMiB: input.freeVramMiB,
        minFreeVramMiB: threshold,
        evictedTileIds,
        reclaimedBytes,
        skippedPinnedCount,
      };
    },
  };
}

export interface TensorHandle4x4x6EncodeInputV1 {
  values96: Float32Array | readonly number[];
  candidateOrdinal: number;
  kmeansClusterId: number;
  somBmuId: number;
  workspaceRevisionPrefix64: bigint;
  sourceRevisionPrefix64: bigint;
  affine2x3: readonly [number, number, number, number, number, number];
  residencyState?: SafeTileResidencyStateV1;
  activeConsumers?: number;
}

export interface TensorHandle4x4x6DecodedV1 {
  candidateOrdinal: number;
  kmeansClusterId: number;
  somBmuId: number;
  workspaceRevisionPrefix64: bigint;
  sourceRevisionPrefix64: bigint;
  affine2x3: [number, number, number, number, number, number];
  residencyState: SafeTileResidencyStateV1;
  activeConsumers: number;
  values96: Float32Array;
}

function computeBodyCrcPrefix32(body96: Uint8Array): number {
  const digest = createHash('sha256').update(body96).digest();
  return digest.readUInt32LE(0);
}

export function encodeTensorHandle4x4x6V1(input: TensorHandle4x4x6EncodeInputV1): Buffer {
  if (input.values96.length !== TENSOR_HANDLE_V1_ELEMENT_COUNT) {
    throw new Error('TENSOR_HANDLE_V1_REQUIRES_96_VALUES');
  }
  if (!Number.isInteger(input.somBmuId) || input.somBmuId < 0 || input.somBmuId >= 400) {
    throw new Error('TENSOR_HANDLE_V1_SOM_BMU_OUT_OF_RANGE');
  }
  const f32Vals = Float32Array.from(input.values96);
  for (let i = 0; i < TENSOR_HANDLE_V1_ELEMENT_COUNT; i++) {
    if (!Number.isFinite(f32Vals[i])) throw new Error('TENSOR_HANDLE_V1_NONFINITE_VALUE');
  }
  const f32Aff = Float32Array.from(input.affine2x3);
  if (f32Aff.length !== 6 || f32Aff.some((v) => !Number.isFinite(v))) {
    throw new Error('TENSOR_HANDLE_V1_NONFINITE_AFFINE');
  }

  const buf = Buffer.alloc(TENSOR_HANDLE_V1_TOTAL_BYTES, 0);
  const chMin = new Float32Array(6).fill(1e9);
  const chMax = new Float32Array(6).fill(-1e9);
  const chScale = new Float32Array(6);

  for (let cell = 0; cell < 16; cell++) {
    for (let ch = 0; ch < 6; ch++) {
      const v = f32Vals[cell * 6 + ch];
      if (v < chMin[ch]) chMin[ch] = v;
      if (v > chMax[ch]) chMax[ch] = v;
    }
  }

  for (let ch = 0; ch < 6; ch++) {
    const range = Math.max(Math.fround(chMax[ch] - chMin[ch]), Math.fround(1e-8));
    chScale[ch] = Math.fround(range / 15.0);
    buf.writeFloatLE(chMin[ch], 64 + ch * 8);
    buf.writeFloatLE(chScale[ch], 64 + ch * 8 + 4);
  }

  for (let idx = 0; idx < TENSOR_HANDLE_V1_ELEMENT_COUNT; idx += 2) {
    const ch0 = idx % 6;
    const ch1 = (idx + 1) % 6;
    const denom0 = Math.fround(chScale[ch0] * 15.0);
    const denom1 = Math.fround(chScale[ch1] * 15.0);
    const n0 = Math.min(1, Math.max(0, Math.fround(Math.fround(f32Vals[idx] - chMin[ch0]) / denom0)));
    const n1 = Math.min(1, Math.max(0, Math.fround(Math.fround(f32Vals[idx + 1] - chMin[ch1]) / denom1)));
    const q0 = Math.round(Math.fround(n0 * 15.0)) & 0x0f;
    const q1 = Math.round(Math.fround(n1 * 15.0)) & 0x0f;
    buf[112 + (idx >> 1)] = q0 | (q1 << 4);
  }

  const crcPrefix = computeBodyCrcPrefix32(buf.subarray(64, 160));

  buf.writeUInt32LE(TENSOR_HANDLE_V1_MAGIC_LE, 0);
  buf.writeUInt32LE(TENSOR_HANDLE_V1_ENDIAN_LE, 4);
  buf.writeUInt32LE(input.candidateOrdinal >>> 0, 8);
  buf.writeUInt16LE(input.kmeansClusterId & 0xffff, 12);
  buf.writeUInt16LE(input.somBmuId & 0xffff, 14);
  buf.writeBigUInt64LE(BigInt.asUintN(64, input.workspaceRevisionPrefix64), 16);
  buf.writeBigUInt64LE(BigInt.asUintN(64, input.sourceRevisionPrefix64), 24);
  for (let a = 0; a < 6; a++) {
    buf.writeFloatLE(f32Aff[a], 32 + a * 4);
  }
  buf[56] = (input.residencyState ?? SafeTileResidencyStateV1.HOST_STAGED) & 0xff;
  buf[57] = TENSOR_HANDLE_V1_SHAPE_CODE_4X4X6;
  buf.writeUInt16LE((input.activeConsumers ?? 0) & 0xffff, 58);
  buf.writeUInt32LE(crcPrefix >>> 0, 60);

  return buf;
}

export function decodeTensorHandle4x4x6V1(
  bytes: Uint8Array,
  expectedWorkspaceRevisionPrefix64: bigint,
): TensorHandle4x4x6DecodedV1 {
  if (bytes.byteLength !== TENSOR_HANDLE_V1_TOTAL_BYTES) {
    throw new Error('TENSOR_HANDLE_V1_BYTE_LENGTH_INVALID');
  }
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.readUInt32LE(0) !== TENSOR_HANDLE_V1_MAGIC_LE) {
    throw new Error('TENSOR_HANDLE_V1_MAGIC_MISMATCH');
  }
  if (buf.readUInt32LE(4) !== TENSOR_HANDLE_V1_ENDIAN_LE) {
    throw new Error('TENSOR_HANDLE_V1_ENDIAN_MISMATCH');
  }
  if (buf[57] !== TENSOR_HANDLE_V1_SHAPE_CODE_4X4X6) {
    throw new Error('TENSOR_HANDLE_V1_SHAPE_CODE_MISMATCH');
  }
  const wsRev = buf.readBigUInt64LE(16);
  if (wsRev !== BigInt.asUintN(64, expectedWorkspaceRevisionPrefix64)) {
    throw new Error('TENSOR_HANDLE_V1_STALE_WORKSPACE_REVISION');
  }
  const expectedCrc = computeBodyCrcPrefix32(buf.subarray(64, 160));
  if (buf.readUInt32LE(60) !== expectedCrc) {
    throw new Error('TENSOR_HANDLE_V1_BODY_CHECKSUM_MISMATCH');
  }

  const chMin = new Float32Array(6);
  const chScale = new Float32Array(6);
  for (let ch = 0; ch < 6; ch++) {
    chMin[ch] = buf.readFloatLE(64 + ch * 8);
    chScale[ch] = buf.readFloatLE(64 + ch * 8 + 4);
  }

  const values96 = new Float32Array(TENSOR_HANDLE_V1_ELEMENT_COUNT);
  for (let idx = 0; idx < TENSOR_HANDLE_V1_ELEMENT_COUNT; idx += 2) {
    const packed = buf[112 + (idx >> 1)];
    const q0 = packed & 0x0f;
    const q1 = (packed >>> 4) & 0x0f;
    const ch0 = idx % 6;
    const ch1 = (idx + 1) % 6;
    values96[idx] = Math.fround(chMin[ch0] + Math.fround(q0 * chScale[ch0]));
    values96[idx + 1] = Math.fround(chMin[ch1] + Math.fround(q1 * chScale[ch1]));
  }

  const affine2x3: [number, number, number, number, number, number] = [
    buf.readFloatLE(32),
    buf.readFloatLE(36),
    buf.readFloatLE(40),
    buf.readFloatLE(44),
    buf.readFloatLE(48),
    buf.readFloatLE(52),
  ];

  return {
    candidateOrdinal: buf.readUInt32LE(8),
    kmeansClusterId: buf.readUInt16LE(12),
    somBmuId: buf.readUInt16LE(14),
    workspaceRevisionPrefix64: wsRev,
    sourceRevisionPrefix64: buf.readBigUInt64LE(24),
    affine2x3,
    residencyState: buf[56] as SafeTileResidencyStateV1,
    activeConsumers: buf.readUInt16LE(58),
    values96,
  };
}

/**
 * Applies the Mode-7 / 2D affine transform [a, b, tx, c, d, ty] to a 2D tile coordinate (u, v):
 *   x_world = a * u + b * v + tx
 *   y_world = c * u + d * v + ty
 */
export function projectMode7Affine2x3V1(
  affine2x3: readonly [number, number, number, number, number, number],
  u: number,
  v: number,
): [number, number] {
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    throw new Error('TENSOR_HANDLE_V1_NONFINITE_COORDINATE');
  }
  if (affine2x3.length !== 6 || affine2x3.some((c) => !Number.isFinite(c))) {
    throw new Error('TENSOR_HANDLE_V1_NONFINITE_AFFINE');
  }
  const fAff = Float32Array.from(affine2x3);
  const fu = Math.fround(u);
  const fv = Math.fround(v);
  const x = Math.fround(Math.fround(Math.fround(fAff[0] * fu) + Math.fround(fAff[1] * fv)) + fAff[2]);
  const y = Math.fround(Math.fround(Math.fround(fAff[3] * fu) + Math.fround(fAff[4] * fv)) + fAff[5]);
  return [x, y];
}

/**
 * Projects all 16 cell centers (col + 0.5, row + 0.5) of a 4x4 tile into world/frustum coordinates.
 */
export function projectTileGrid4x4Mode7V1(
  affine2x3: readonly [number, number, number, number, number, number],
): Array<{ row: number; col: number; xWorld: number; yWorld: number }> {
  const grid: Array<{ row: number; col: number; xWorld: number; yWorld: number }> = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const [xWorld, yWorld] = projectMode7Affine2x3V1(affine2x3, col + 0.5, row + 0.5);
      grid.push({ row, col, xWorld, yWorld });
    }
  }
  return grid;
}
