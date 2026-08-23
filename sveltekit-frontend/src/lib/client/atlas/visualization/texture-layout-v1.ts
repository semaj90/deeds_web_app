/**
 * Revisioned CPU reference for RGBA8 texture staging.
 *
 * Text/glyph labels are UTF-8 metadata. Pixels are already encoded RGBA8
 * bytes. They must never share offsets or checksums.
 */

export const TEXTURE_LAYOUT_SCHEMA = 'atlas.texture-layout.v1' as const;
export const RGBA8_BYTES_PER_PIXEL = 4 as const;
export const WEBGPU_COPY_ROW_ALIGNMENT = 256 as const;

export interface Rgba8TextureLayoutV1 {
  schema: typeof TEXTURE_LAYOUT_SCHEMA;
  width: number;
  height: number;
  lod: number;
  format: 'rgba8unorm';
  logicalBytesPerRow: number;
  bytesPerRow: number;
  logicalByteLength: number;
  stagingByteLength: number;
}

export function createRgba8TextureLayout(input: {
  width: number;
  height: number;
  lod: number;
}): Rgba8TextureLayoutV1 {
  if (!Number.isInteger(input.width) || input.width <= 0) throw new Error('width must be a positive integer');
  if (!Number.isInteger(input.height) || input.height <= 0) throw new Error('height must be a positive integer');
  if (!Number.isInteger(input.lod) || input.lod < 0) throw new Error('lod must be a non-negative integer');

  const logicalBytesPerRow = input.width * RGBA8_BYTES_PER_PIXEL;
  const bytesPerRow = Math.ceil(logicalBytesPerRow / WEBGPU_COPY_ROW_ALIGNMENT) * WEBGPU_COPY_ROW_ALIGNMENT;
  return {
    schema: TEXTURE_LAYOUT_SCHEMA,
    width: input.width,
    height: input.height,
    lod: input.lod,
    format: 'rgba8unorm',
    logicalBytesPerRow,
    bytesPerRow,
    logicalByteLength: logicalBytesPerRow * input.height,
    stagingByteLength: bytesPerRow * input.height,
  };
}

/** Copy tightly packed RGBA8 rows into a WebGPU-aligned staging buffer. */
export function stageRgba8Rows(layout: Rgba8TextureLayoutV1, source: Uint8Array): Uint8Array<ArrayBuffer> {
  if (source.byteLength !== layout.logicalByteLength) {
    throw new Error(`RGBA8 source length ${source.byteLength} does not match ${layout.logicalByteLength}`);
  }
  const staged = new Uint8Array(new ArrayBuffer(layout.stagingByteLength));
  for (let row = 0; row < layout.height; row++) {
    const sourceStart = row * layout.logicalBytesPerRow;
    const targetStart = row * layout.bytesPerRow;
    staged.set(source.subarray(sourceStart, sourceStart + layout.logicalBytesPerRow), targetStart);
  }
  return staged;
}

export function rgba8PixelOffset(width: number, x: number, y: number): number {
  if (!Number.isInteger(width) || width <= 0) throw new Error('width must be a positive integer');
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width) {
    throw new Error('pixel coordinate is outside the texture');
  }
  return (y * width + x) * RGBA8_BYTES_PER_PIXEL;
}

export function readRgba8Pixel(source: Uint8Array, width: number, x: number, y: number): readonly [number, number, number, number] {
  const offset = rgba8PixelOffset(width, x, y);
  if (offset + RGBA8_BYTES_PER_PIXEL > source.byteLength) throw new Error('pixel source is truncated');
  return [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]];
}

export function encodeGlyphLabelUtf8(label: string): Uint8Array {
  return new TextEncoder().encode(label);
}
