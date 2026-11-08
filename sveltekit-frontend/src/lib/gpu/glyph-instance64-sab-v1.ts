/**
 * glyph-instance64-sab-v1.ts
 *
 * Separate 64-byte WebGPU Glyph Instance Wire Contract (`atlas.glyph-instance-64b.v1`),
 * SharedArrayBuffer / Transferable ArrayBuffer Worker Protocol, and 256-Byte Row-Pitch Helper.
 *
 * Authority & Schema Separation Rules:
 * 1. NEVER reuse the 64-byte LowRankTaskRpcRecord64B ('TSK1', 0x54534B31) or
 *    AlignedKeyframeChunk64B ('KFR1', 0x4B465231) wire layout as a GPU glyph instance buffer.
 * 2. GlyphInstance64 ('GLY1', 0x474C5931, codecVersion=1) places all vec4<f32> fields on
 *    strict 16-byte boundaries (bytes 16..31, 32..47, 48..63) per the W3C WGSL alignment spec.
 * 3. NES `domainByte` (0x00 unresolved, 0x01..0x0A canonical domain) and `paletteIndex`
 *    (NES PPU color code, e.g. 0x2A for `ui` where `domainByte = 0x02`) are independent fields.
 */

export const GLYPH_INSTANCE_64_SCHEMA = 'atlas.glyph-instance-64b.v1' as const;
export const GLYPH_INSTANCE_64_MAGIC = 0x474c5931; // 'GLY1'
export const LOWRANK_TASK_RPC_64_MAGIC = 0x54534b31; // 'TSK1'
export const SCENE_KEYFRAME_64_MAGIC = 0x4b465231; // 'KFR1'
export const GLYPH_INSTANCE_64_CODEC_VERSION = 1;
export const GLYPH_RECORD_BYTES = 64;
export const GLYPH_SAB_HEADER_BYTES = 64;
export const WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT = 256;

export const GlyphBufferState = {
  EMPTY: 0,
  WRITING: 1,
  READY: 2,
  ERROR: 3,
} as const;

export const GlyphStatusFlags = {
  NONE: 0,
  ACTIONABLE: 1 << 0,
  COMPLETED: 1 << 1,
  WAITING: 1 << 2,
  REVIEW_REQUIRED: 1 << 3,
  ROUTED_ACTIVE: 1 << 4,
} as const;

/**
 * WGSL struct definition with 16-byte aligned vec4<f32> fields (total = 64 bytes).
 */
export const GLYPH_INSTANCE_64_WGSL = /* wgsl */ `
struct GlyphInstance64 {
  taskOrdinal:   u32,       // byte 0..3
  domainByte:    u32,       // byte 4..7   (0x00 unresolved, 0x01..0x0A NES LUT domain byte)
  statusFlags:   u32,       // byte 8..11  (bitflags: actionable, completed, waiting, review, routed)
  paletteIndex:  u32,       // byte 12..15 (independent NES color hex, e.g. 0x2A for ui)
  positionScale: vec4<f32>, // byte 16..31 (xyz + uniform scale w, 16-byte aligned)
  rotationA:     vec4<f32>, // byte 32..47 (rot_6d[0..3], 16-byte aligned)
  rotationB:     vec4<f32>, // byte 48..63 (rot_6d[4..5] + 2 zero pad floats, 16-byte aligned)
};
`;

export interface GlyphInstance64Record {
  taskOrdinal: number;
  domainByte: number;
  statusFlags: number;
  paletteIndex: number;
  positionScale: [number, number, number, number];
  rotation6d: [number, number, number, number, number, number];
}

export function fnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.byteLength; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Computes WebGPU-compliant bytesPerRow (multiple of 256 bytes) for texture-to-buffer copies.
 */
export function computeWebGpuRowPitch256(widthPx: number, bytesPerPixel = 4): number {
  if (!Number.isInteger(widthPx) || widthPx <= 0) {
    throw new Error('WEBGPU_INVALID_WIDTH_PX');
  }
  const unpaddedRowBytes = widthPx * bytesPerPixel;
  return (
    Math.ceil(unpaddedRowBytes / WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT) *
    WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT
  );
}

export function assertWebGpuCopyRowPitch256(bytesPerRow: number): void {
  if (
    !Number.isInteger(bytesPerRow) ||
    bytesPerRow <= 0 ||
    bytesPerRow % WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT !== 0
  ) {
    throw new Error(
      `WEBGPU_BYTES_PER_ROW_ALIGNMENT_VIOLATION: ${bytesPerRow} is not a positive multiple of 256`
    );
  }
}

/**
 * Allocates a SharedArrayBuffer when `crossOriginIsolated === true`, or falls back to a
 * transferable ArrayBuffer when `allowTransferableFallback === true`.
 */
export function allocateGlyphTransportBuffer(
  taskCount: number,
  options: { crossOriginIsolated: boolean; allowTransferableFallback?: boolean }
): {
  buffer: SharedArrayBuffer | ArrayBuffer;
  mode: 'SHARED_ARRAY_BUFFER' | 'TRANSFERABLE_ARRAY_BUFFER_FALLBACK';
  totalBytes: number;
} {
  if (!Number.isInteger(taskCount) || taskCount <= 0) {
    throw new Error('GLYPH_INVALID_TASK_COUNT');
  }
  const totalBytes = GLYPH_SAB_HEADER_BYTES + taskCount * GLYPH_RECORD_BYTES;
  if (options.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
    return {
      buffer: new SharedArrayBuffer(totalBytes),
      mode: 'SHARED_ARRAY_BUFFER',
      totalBytes,
    };
  }
  if (!options.allowTransferableFallback) {
    throw new Error('SHARED_MEMORY_UNAVAILABLE');
  }
  return {
    buffer: new ArrayBuffer(totalBytes),
    mode: 'TRANSFERABLE_ARRAY_BUFFER_FALLBACK',
    totalBytes,
  };
}

/**
 * Writes a batch of GlyphInstance64 records into the 64-byte-header transport buffer
 * using the lock-free generation-counter protocol.
 */
export function writeGlyphInstance64Batch(
  buffer: SharedArrayBuffer | ArrayBuffer,
  records: readonly GlyphInstance64Record[],
  activeSlot = 0
): { generation: number; checksumFnv1a32: number } {
  const expectedBytes = GLYPH_SAB_HEADER_BYTES + records.length * GLYPH_RECORD_BYTES;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `GLYPH_BUFFER_BYTE_LENGTH_MISMATCH: expected ${expectedBytes}, got ${buffer.byteLength}`
    );
  }

  const control = new Int32Array(buffer, 0, 16);
  const isShared = typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer;

  if (isShared) {
    Atomics.store(control, 0, GlyphBufferState.WRITING);
    Atomics.add(control, 1, 1); // odd generation while writing
  } else {
    control[0] = GlyphBufferState.WRITING;
    control[1] = (control[1] || 0) + 1;
  }

  const view = new DataView(buffer, GLYPH_SAB_HEADER_BYTES, records.length * GLYPH_RECORD_BYTES);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const base = i * GLYPH_RECORD_BYTES;
    if (r.domainByte < 0 || r.domainByte > 0x0a) {
      throw new Error(`GLYPH_DOMAIN_BYTE_OUT_OF_RANGE: ${r.domainByte}`);
    }
    view.setUint32(base + 0, r.taskOrdinal >>> 0, true);
    view.setUint32(base + 4, r.domainByte >>> 0, true);
    view.setUint32(base + 8, r.statusFlags >>> 0, true);
    view.setUint32(base + 12, r.paletteIndex >>> 0, true);

    // positionScale: vec4<f32> at byte 16..31
    view.setFloat32(base + 16, r.positionScale[0], true);
    view.setFloat32(base + 20, r.positionScale[1], true);
    view.setFloat32(base + 24, r.positionScale[2], true);
    view.setFloat32(base + 28, r.positionScale[3], true);

    // rotationA: vec4<f32> at byte 32..47 (first 4 floats of rot_6d)
    view.setFloat32(base + 32, r.rotation6d[0], true);
    view.setFloat32(base + 36, r.rotation6d[1], true);
    view.setFloat32(base + 40, r.rotation6d[2], true);
    view.setFloat32(base + 44, r.rotation6d[3], true);

    // rotationB: vec4<f32> at byte 48..63 (remaining 2 floats of rot_6d + 0.0, 0.0 padding)
    view.setFloat32(base + 48, r.rotation6d[4], true);
    view.setFloat32(base + 52, r.rotation6d[5], true);
    view.setFloat32(base + 56, 0.0, true);
    view.setFloat32(base + 60, 0.0, true);
  }

  const payloadBytes = new Uint8Array(
    buffer,
    GLYPH_SAB_HEADER_BYTES,
    records.length * GLYPH_RECORD_BYTES
  );
  const checksum = fnv1a32(payloadBytes);

  control[2] = GLYPH_INSTANCE_64_MAGIC;
  control[3] = GLYPH_INSTANCE_64_CODEC_VERSION;
  control[4] = records.length;
  control[5] = GLYPH_RECORD_BYTES;
  control[6] = activeSlot;
  control[7] = checksum | 0;

  let finalGen: number;
  if (isShared) {
    finalGen = Atomics.add(control, 1, 1) + 1; // even generation when ready
    Atomics.store(control, 0, GlyphBufferState.READY);
    Atomics.notify(control, 0);
  } else {
    control[1] += 1;
    finalGen = control[1];
    control[0] = GlyphBufferState.READY;
  }

  return { generation: finalGen, checksumFnv1a32: checksum };
}

/**
 * Validates and decodes a GlyphInstance64 transport buffer, rejecting wire-schema collisions,
 * torn writes (generation mismatch), or corrupted payloads.
 */
export function readGlyphInstance64Batch(
  buffer: SharedArrayBuffer | ArrayBuffer
): {
  generation: number;
  recordCount: number;
  checksumFnv1a32: number;
  records: GlyphInstance64Record[];
} {
  if (buffer.byteLength < GLYPH_SAB_HEADER_BYTES) {
    throw new Error('GLYPH_BUFFER_TOO_SMALL');
  }
  const control = new Int32Array(buffer, 0, 16);
  const isShared = typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer;

  const stateBefore = isShared ? Atomics.load(control, 0) : control[0];
  const genBefore = isShared ? Atomics.load(control, 1) : control[1];

  if (stateBefore !== GlyphBufferState.READY || genBefore % 2 !== 0) {
    throw new Error(
      `GLYPH_BUFFER_NOT_READY_OR_TORN_GENERATION: state=${stateBefore}, gen=${genBefore}`
    );
  }

  const magic = control[2];
  if (magic !== GLYPH_INSTANCE_64_MAGIC) {
    throw new Error(
      `GLYPH_WIRE_SCHEMA_COLLISION_FORBIDDEN: expected magic 0x${GLYPH_INSTANCE_64_MAGIC.toString(16)}, got 0x${(magic >>> 0).toString(16)}`
    );
  }
  const codecVersion = control[3];
  if (codecVersion !== GLYPH_INSTANCE_64_CODEC_VERSION) {
    throw new Error(`GLYPH_UNSUPPORTED_CODEC_VERSION: ${codecVersion}`);
  }

  const recordCount = control[4];
  const recordBytes = control[5];
  const expectedChecksum = control[7] >>> 0;
  if (
    recordBytes !== GLYPH_RECORD_BYTES ||
    buffer.byteLength !== GLYPH_SAB_HEADER_BYTES + recordCount * GLYPH_RECORD_BYTES
  ) {
    throw new Error('GLYPH_RECORD_LAYOUT_MISMATCH');
  }

  const payloadBytes = new Uint8Array(
    buffer,
    GLYPH_SAB_HEADER_BYTES,
    recordCount * GLYPH_RECORD_BYTES
  );
  const actualChecksum = fnv1a32(payloadBytes);
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `GLYPH_PAYLOAD_CHECKSUM_MISMATCH: expected ${expectedChecksum}, got ${actualChecksum}`
    );
  }

  const view = new DataView(buffer, GLYPH_SAB_HEADER_BYTES, recordCount * GLYPH_RECORD_BYTES);
  const records: GlyphInstance64Record[] = new Array(recordCount);
  for (let i = 0; i < recordCount; i++) {
    const base = i * GLYPH_RECORD_BYTES;
    records[i] = {
      taskOrdinal: view.getUint32(base + 0, true),
      domainByte: view.getUint32(base + 4, true),
      statusFlags: view.getUint32(base + 8, true),
      paletteIndex: view.getUint32(base + 12, true),
      positionScale: [
        view.getFloat32(base + 16, true),
        view.getFloat32(base + 20, true),
        view.getFloat32(base + 24, true),
        view.getFloat32(base + 28, true),
      ],
      rotation6d: [
        view.getFloat32(base + 32, true),
        view.getFloat32(base + 36, true),
        view.getFloat32(base + 40, true),
        view.getFloat32(base + 44, true),
        view.getFloat32(base + 48, true),
        view.getFloat32(base + 52, true),
      ],
    };
  }

  const genAfter = isShared ? Atomics.load(control, 1) : control[1];
  if (genAfter !== genBefore) {
    throw new Error(
      `GLYPH_BUFFER_NOT_READY_OR_TORN_GENERATION: concurrent writer modified buffer (${genBefore} -> ${genAfter})`
    );
  }

  return {
    generation: genBefore,
    recordCount,
    checksumFnv1a32: actualChecksum,
    records,
  };
}
