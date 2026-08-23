import { describe, expect, it } from 'vitest';
import {
  createRgba8TextureLayout,
  encodeGlyphLabelUtf8,
  readRgba8Pixel,
  rgba8PixelOffset,
  stageRgba8Rows,
} from './texture-layout-v1.js';

describe('texture layout v1', () => {
  it('keeps UTF-8 glyph labels separate from pixel bytes', () => {
    expect(Array.from(encodeGlyphLabelUtf8('😀'))).toEqual([240, 159, 152, 128]);
    const layout = createRgba8TextureLayout({ width: 2, height: 2, lod: 3 });
    expect(layout.logicalBytesPerRow).toBe(8);
    expect(layout.bytesPerRow).toBe(256);
  });

  it('pads each RGBA8 row without changing pixel order', () => {
    const layout = createRgba8TextureLayout({ width: 2, height: 2, lod: 0 });
    const source = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const staged = stageRgba8Rows(layout, source);
    expect(staged.byteLength).toBe(512);
    expect(Array.from(staged.slice(0, 8))).toEqual(Array.from(source.slice(0, 8)));
    expect(Array.from(staged.slice(256, 264))).toEqual(Array.from(source.slice(8, 16)));
    expect(staged.slice(8, 256).every((byte) => byte === 0)).toBe(true);
  });

  it('rejects compressed or truncated data at the raw RGBA8 boundary', () => {
    const layout = createRgba8TextureLayout({ width: 1, height: 1, lod: 0 });
    expect(() => stageRgba8Rows(layout, new Uint8Array([1, 2, 3]))).toThrow(/does not match/);
  });

  it('uses ImageData-compatible row-major RGBA coordinates', () => {
    const pixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(rgba8PixelOffset(2, 0, 0)).toBe(0);
    expect(rgba8PixelOffset(2, 1, 1)).toBe(12);
    expect(readRgba8Pixel(pixels, 2, 1, 1)).toEqual([13, 14, 15, 16]);
    expect(() => rgba8PixelOffset(2, 2, 0)).toThrow(/outside/);
  });
});
