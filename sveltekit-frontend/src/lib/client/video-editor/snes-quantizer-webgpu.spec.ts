import { describe, expect, it } from 'vitest';
import {
  quantizeFrameSnes4Bit,
  rgb888ToRgb555,
  rgb555ToRgb888,
  PIXELS_PER_UINT32,
  SNES_PALETTE_COLORS,
} from './snes-quantizer-webgpu.js';
import { createFixedPointBox, projectFixedPointBox2D, FIXED_POINT_SCALE } from './retro-wireframe-proxy.js';
import { OPFSVideoCache } from './opfs-video-cache.js';

describe('snes-quantizer-webgpu', () => {
  it('converts RGB888 to 15-bit RGB555 and back accurately', () => {
    const c555 = rgb888ToRgb555(255, 0, 0); // Pure Red
    expect(c555).toBe(0x7c00); // (31 << 10)
    const [r, g, b] = rgb555ToRgb888(c555);
    expect(r).toBeGreaterThanOrEqual(248);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('quantizes RGBA pixels into 16-color 4-bit SNES packed buffer and detects tile deltas', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Frame 1: solid green
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4 + 0] = 0;
      rgba[i * 4 + 1] = 200;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 255;
    }

    const frame1 = quantizeFrameSnes4Bit(rgba, width, height);
    expect(frame1.width).toBe(16);
    expect(frame1.height).toBe(16);
    expect(frame1.paletteRgb555.length).toBe(SNES_PALETTE_COLORS);
    expect(frame1.packedIndices.length).toBe((16 * 16) / PIXELS_PER_UINT32);
    expect(frame1.totalTiles).toBe(4); // (16/8) * (16/8) = 4 tiles
    expect(frame1.changedTileCount).toBe(4); // First frame marks all tiles changed

    // Frame 2: change only top-left 8x8 tile (tile 0) to bright red
    const rgba2 = new Uint8ClampedArray(rgba);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const idx = (y * width + x) * 4;
        rgba2[idx + 0] = 255;
        rgba2[idx + 1] = 0;
        rgba2[idx + 2] = 0;
      }
    }

    const frame2 = quantizeFrameSnes4Bit(rgba2, width, height, frame1.packedIndices);
    expect(frame2.totalTiles).toBe(4);
    // Only tile 0 changed, skipping 75% of unchanged tiles!
    expect(frame2.changedTileCount).toBe(1);
    expect(frame2.changeRatio).toBe(0.25);
    expect(frame2.tileDeltaBitset[0] & 0x01).toBe(1); // bit 0 set
  });
});

describe('retro-wireframe-proxy (Donkey Kong Country 16-Bit Fixed Point)', () => {
  it('creates quantized 16-bit bounding boxes and projects to 2D screen coordinates', () => {
    const box = createFixedPointBox('suspect-1', 'A. Vance', 0, 0, 0, 1.0, 2.0, 0.5, 0.99, 2);
    expect(box.vertices.length).toBe(24);
    expect(box.vertices[0]).toBe(-500); // -0.5m * 1000
    expect(box.vertices[1]).toBe(-1000); // -1.0m * 1000
    expect(box.lineIndices.length).toBe(24); // 12 edges * 2

    const lines2d = projectFixedPointBox2D(box, 800, 600, 2.0);
    expect(lines2d.length).toBe(12);
    for (const line of lines2d) {
      expect(Number.isFinite(line[0])).toBe(true);
      expect(Number.isFinite(line[1])).toBe(true);
      expect(Number.isFinite(line[2])).toBe(true);
      expect(Number.isFinite(line[3])).toBe(true);
    }
  });
});

describe('opfs-video-cache', () => {
  it('writes and reads video chunks from cache', async () => {
    const cache = OPFSVideoCache.getInstance();
    const payload = new Uint8Array([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70]); // ftyp mp4
    const meta = await cache.writeVideo('ev-test-01', payload, {
      filename: 'security_feed.mp4',
      mimeType: 'video/mp4',
      totalFrames: 120,
    });

    expect(meta.evidenceId).toBe('ev-test-01');
    expect(meta.sizeBytes).toBe(8);

    const readBack = await cache.readVideo('ev-test-01');
    expect(readBack).not.toBeNull();
    expect(readBack?.length).toBe(8);
    expect(readBack?.[4]).toBe(0x66); // 'f'

    const readMeta = await cache.readMetadata('ev-test-01');
    expect(readMeta?.filename).toBe('security_feed.mp4');

    await cache.deleteVideo('ev-test-01');
  });
});
