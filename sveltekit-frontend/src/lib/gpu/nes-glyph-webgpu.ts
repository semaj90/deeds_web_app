/**
 * NES CHR97 Glyph Tile — Client-Side WebGPU Bridge
 *
 * Renders a Voronoi semantic tile map from a GlyphTileAtlas.
 * Each pixel is coloured by nearest centroid cluster (2D nearest-neighbour).
 *
 * Pipeline:
 *   GlyphTileAtlas (from /api/glyph/tile-atlas)
 *     → upload tiles (normX, normY, clusterId) to GPU storage buffer
 *     → dispatch WGSL Voronoi compute shader over target_w × target_h pixels
 *     → copy result RGBA bitmap to CPU ArrayBuffer
 *     → draw to caller-supplied <canvas> element
 *
 * Fallback:
 *   When WebGPU is unavailable or the device is lost, falls back to a
 *   CPU Voronoi implementation (same visual output, ~10× slower).
 *
 * OOM prevention:
 *   Each call acquires the shared _computeLock. Concurrent callers queue.
 *
 * Usage:
 *   import { renderGlyphAtlas } from '$lib/gpu/nes-glyph-webgpu';
 *   await renderGlyphAtlas(canvas, atlas, { paletteId: 'nes-yorha' });
 */

import { browser } from '$app/environment';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GlyphTileEntry {
  normX: number;   // 0.0..1.0
  normY: number;   // 0.0..1.0
  clusterId: number;
  runeCount: number;
  confidence: number;
}

export interface RenderOptions {
  /** Output width in pixels (default: 256 — matches NES CHR bank) */
  width?: number;
  /** Output height in pixels (default: 256) */
  height?: number;
  /** Named colour palette (default: 'nes-yorha') */
  paletteId?: keyof typeof PALETTES;
  /** Draw grid lines between tiles (default: true) */
  showGrid?: boolean;
  /** Highlight tile under this cluster ID (-1 = none) */
  highlightCluster?: number;
}

export interface RenderResult {
  backend: 'webgpu' | 'cpu';
  durationMs: number;
  tileCount: number;
}

// ── NES-inspired palettes (8 colours each — indexed by cluster mod 8) ────

export const PALETTES = {
  'nes-yorha': [
    [0x1a, 0x1a, 0x1a, 0xff], // 0 — darkest black
    [0x3a, 0x2c, 0x18, 0xff], // 1 — dark sand
    [0x5a, 0x46, 0x28, 0xff], // 2 — mid sand
    [0x8a, 0x70, 0x42, 0xff], // 3 — warm sand
    [0xc8, 0xa8, 0x64, 0xff], // 4 — bright sand
    [0xe0, 0xcc, 0x88, 0xff], // 5 — pale gold
    [0x2a, 0x3a, 0x2a, 0xff], // 6 — dark green
    [0x48, 0x68, 0x48, 0xff], // 7 — forest
  ],
  'nes-retro': [
    [0x10, 0x10, 0x30, 0xff], // 0 — deep navy
    [0x20, 0x20, 0x80, 0xff], // 1 — NES blue
    [0x20, 0x80, 0x20, 0xff], // 2 — NES green
    [0x80, 0x20, 0x20, 0xff], // 3 — NES red
    [0xd0, 0xb0, 0x10, 0xff], // 4 — NES yellow
    [0xa0, 0x20, 0xa0, 0xff], // 5 — NES purple
    [0x20, 0xa0, 0xb0, 0xff], // 6 — NES cyan
    [0xe0, 0xe0, 0xe0, 0xff], // 7 — NES white
  ],
  'investigation': [
    [0x08, 0x0c, 0x10, 0xff], // 0
    [0x10, 0x20, 0x30, 0xff], // 1
    [0x14, 0x30, 0x48, 0xff], // 2
    [0x18, 0x44, 0x68, 0xff], // 3
    [0x20, 0x60, 0x90, 0xff], // 4
    [0x30, 0x80, 0xb0, 0xff], // 5
    [0x50, 0xa0, 0xc8, 0xff], // 6
    [0x80, 0xc0, 0xe0, 0xff], // 7
  ],
} as const;

// ── WGSL Voronoi Compute Shader ───────────────────────────────────────────
// Dispatched as (ceil(W/8), ceil(H/8), 1) workgroups.
// Each thread colours one pixel with the nearest tile's palette entry.

const VORONOI_WGSL = /* wgsl */ `
struct Tile {
  norm_x:     f32,
  norm_y:     f32,
  cluster_id: u32,
  rune_count: u32,
  confidence: f32,
  _pad0:      f32,
  _pad1:      f32,
  _pad2:      f32,
}

struct Uniforms {
  tile_count:        u32,
  out_w:             u32,
  out_h:             u32,
  highlight_cluster: i32,   // -1 = none
}

// 8 RGBA8 palette entries, stored as vec4<f32> [0,1] range
struct Palette {
  colors: array<vec4<f32>, 8>,
}

@group(0) @binding(0) var<storage, read>       tiles    : array<Tile>;
@group(0) @binding(1) var<uniform>             uniforms : Uniforms;
@group(0) @binding(2) var<storage, read>       palette  : Palette;
@group(0) @binding(3) var<storage, read_write> out_rgba : array<u32>;   // RGBA8 packed

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let px = gid.x;
  let py = gid.y;

  if (px >= uniforms.out_w || py >= uniforms.out_h) { return; }

  let ux = f32(px) / f32(uniforms.out_w - 1u);
  let uy = f32(py) / f32(uniforms.out_h - 1u);

  // Find nearest tile centroid (brute-force; k ≤ 256 so still fast)
  var best_dist : f32 = 1e30;
  var best_cid  : u32 = 0u;
  var best_conf : f32 = 0.0;

  for (var i : u32 = 0u; i < uniforms.tile_count; i = i + 1u) {
    let t  = tiles[i];
    let dx = t.norm_x - ux;
    let dy = t.norm_y - uy;
    let d2 = dx * dx + dy * dy;
    if (d2 < best_dist) {
      best_dist = d2;
      best_cid  = t.cluster_id;
      best_conf = t.confidence;
    }
  }

  // Palette index = cluster mod 8
  let pal_idx = best_cid % 8u;
  var col = palette.colors[pal_idx];

  // Darken low-confidence tiles slightly
  col = col * (0.5 + 0.5 * clamp(best_conf, 0.0, 1.0));

  // Highlight selected cluster (brighten border pixels)
  if (uniforms.highlight_cluster >= 0 && best_cid == u32(uniforms.highlight_cluster)) {
    col = clamp(col * 1.5, vec4<f32>(0.0), vec4<f32>(1.0));
  }

  // Pack RGBA8
  let r = u32(clamp(col.r * 255.0, 0.0, 255.0));
  let g = u32(clamp(col.g * 255.0, 0.0, 255.0));
  let b = u32(clamp(col.b * 255.0, 0.0, 255.0));
  let a = u32(clamp(col.a * 255.0, 0.0, 255.0));

  out_rgba[py * uniforms.out_w + px] = (a << 24u) | (b << 16u) | (g << 8u) | r;
}
`;

// ── Shared GPU device (lazy init) ─────────────────────────────────────────

let _device: GPUDevice | null = null;
let _pipeline: GPUComputePipeline | null = null;
let _deviceLost = false;

async function _getDevice(): Promise<GPUDevice | null> {
  if (!browser) return null;
  if (_deviceLost) return null;
  if (_device) return _device;

  try {
    if (!navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    _device = await adapter.requestDevice({
      label: 'nes-glyph-voronoi',
    });
    _device.lost.then((info) => {
      console.warn('[nes-glyph-webgpu] Device lost:', info.reason, info.message);
      _device = null;
      _pipeline = null;
      _deviceLost = true;
      // Allow recovery on next call after 5s
      setTimeout(() => { _deviceLost = false; }, 5_000);
    });
    return _device;
  } catch {
    return null;
  }
}

async function _getPipeline(device: GPUDevice): Promise<GPUComputePipeline> {
  if (_pipeline) return _pipeline;
  const module = device.createShaderModule({ label: 'voronoi', code: VORONOI_WGSL });
  _pipeline = await device.createComputePipelineAsync({
    label: 'voronoi-pipeline',
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  return _pipeline;
}

// ── Serialise tile data for GPU ───────────────────────────────────────────

function _buildTileBuffer(tiles: GlyphTileEntry[]): Float32Array {
  // 8 floats per tile: normX, normY, clusterId(as float), runeCount(as float), confidence, _pad×3
  const buf = new Float32Array(tiles.length * 8);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    const off = i * 8;
    buf[off]     = t.normX;
    buf[off + 1] = t.normY;
    // Store as bits-reinterpreted u32 via float — GPU shader reads as Tile struct
    const u32view = new Uint32Array(buf.buffer);
    u32view[off + 2] = t.clusterId;
    u32view[off + 3] = t.runeCount;
    buf[off + 4]  = t.confidence;
    // _pad0/1/2 remain 0
  }
  return buf;
}

function _buildPaletteBuffer(palette: readonly (readonly number[])[]): Float32Array {
  // 8 colours × 4 floats (RGBA normalised)
  const buf = new Float32Array(32);
  for (let i = 0; i < 8; i++) {
    const c = palette[i] ?? [0, 0, 0, 255];
    buf[i * 4]     = (c[0] ?? 0) / 255;
    buf[i * 4 + 1] = (c[1] ?? 0) / 255;
    buf[i * 4 + 2] = (c[2] ?? 0) / 255;
    buf[i * 4 + 3] = (c[3] ?? 255) / 255;
  }
  return buf;
}

// ── WebGPU render path ────────────────────────────────────────────────────

async function _renderGPU(
  device: GPUDevice,
  tiles: GlyphTileEntry[],
  width: number,
  height: number,
  palette: readonly (readonly number[])[],
  highlightCluster: number
): Promise<Uint8ClampedArray> {
  const pipeline = await _getPipeline(device);

  const tileBuf = _buildTileBuffer(tiles);
  const palBuf = _buildPaletteBuffer(palette);

  const tileGPU = device.createBuffer({
    label: 'tiles',
    size: tileBuf.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tileGPU, 0, tileBuf as unknown as ArrayBuffer);

  const uniformData = new Uint32Array(4);
  uniformData[0] = tiles.length;
  uniformData[1] = width;
  uniformData[2] = height;
  // highlightCluster stored as i32 — write as Uint32 with same bits
  new Int32Array(uniformData.buffer)[3] = highlightCluster;

  const uniformGPU = device.createBuffer({
    label: 'uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformGPU, 0, uniformData as unknown as ArrayBuffer);

  const paletteGPU = device.createBuffer({
    label: 'palette',
    size: palBuf.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paletteGPU, 0, palBuf as unknown as ArrayBuffer);

  const outSize = width * height * 4; // RGBA8 u32 × pixels but stored as bytes
  const outGPU = device.createBuffer({
    label: 'out_rgba',
    size: width * height * 4, // u32 per pixel
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackGPU = device.createBuffer({
    label: 'readback',
    size: width * height * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0) as GPUBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: tileGPU } },
      { binding: 1, resource: { buffer: uniformGPU } },
      { binding: 2, resource: { buffer: paletteGPU } },
      { binding: 3, resource: { buffer: outGPU } },
    ],
  });

  const enc = device.createCommandEncoder({ label: 'voronoi' });
  const pass = enc.beginComputePass({ label: 'voronoi-pass' });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
  pass.end();
  enc.copyBufferToBuffer(outGPU, 0, readbackGPU, 0, width * height * 4);
  device.queue.submit([enc.finish()]);

  await readbackGPU.mapAsync(GPUMapMode.READ);
  const u32 = new Uint32Array(readbackGPU.getMappedRange().slice(0));
  readbackGPU.unmap();

  // Destroy temp buffers (output survives for canvas draw)
  tileGPU.destroy();
  uniformGPU.destroy();
  paletteGPU.destroy();
  outGPU.destroy();
  readbackGPU.destroy();

  // Convert packed RGBA8 u32 → Uint8ClampedArray (ImageData compatible)
  const rgba = new Uint8ClampedArray(outSize);
  for (let i = 0; i < u32.length; i++) {
    const p = u32[i]!;
    rgba[i * 4] = p & 0xff; // R
    rgba[i * 4 + 1] = (p >> 8) & 0xff; // G
    rgba[i * 4 + 2] = (p >> 16) & 0xff; // B
    rgba[i * 4 + 3] = (p >> 24) & 0xff; // A
  }
  return rgba;
}

// ── CPU fallback Voronoi ──────────────────────────────────────────────────

function _renderCPU(
  tiles: GlyphTileEntry[],
  width: number,
  height: number,
  palette: readonly (readonly number[])[],
  highlightCluster: number
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const ux = px / (width - 1);
      const uy = py / (height - 1);

      let bestDist = Infinity;
      let bestIdx = 0;
      let bestConf = 0;

      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i]!;
        const dx = t.normX - ux;
        const dy = t.normY - uy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          bestIdx = t.clusterId;
          bestConf = t.confidence;
        }
      }

      const palIdx = bestIdx % 8;
      const c = palette[palIdx] ?? [0, 0, 0, 255];
      const dim = 0.5 + 0.5 * Math.max(0, Math.min(1, bestConf));
      const highlight = highlightCluster >= 0 && bestIdx === highlightCluster ? 1.5 : 1.0;

      const off = (py * width + px) * 4;
      rgba[off] = Math.min(255, (c[0] ?? 0) * dim * highlight);
      rgba[off + 1] = Math.min(255, (c[1] ?? 0) * dim * highlight);
      rgba[off + 2] = Math.min(255, (c[2] ?? 0) * dim * highlight);
      rgba[off + 3] = c[3] ?? 255;
    }
  }
  return rgba;
}

// ── Grid overlay ──────────────────────────────────────────────────────────

function _drawGrid(
  ctx: CanvasRenderingContext2D,
  tiles: GlyphTileEntry[],
  gridW: number,
  gridH: number,
  canvasW: number,
  canvasH: number
): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5;
  const cellW = canvasW / gridW;
  const cellH = canvasH / gridH;
  for (let x = 0; x <= gridW; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellW, 0);
    ctx.lineTo(x * cellW, canvasH);
    ctx.stroke();
  }
  for (let y = 0; y <= gridH; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellH);
    ctx.lineTo(canvasW, y * cellH);
    ctx.stroke();
  }
}

// ── Serial lock (prevent concurrent GPU build OOM) ────────────────────────

let _renderLock: Promise<void> = Promise.resolve();

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Render a GlyphTileAtlas as a Voronoi bitmap onto `canvas`.
 *
 * @param canvas   - Target canvas element
 * @param atlasData - Atlas from server (JSON or pre-parsed)
 * @param opts     - Render options
 */
export async function renderGlyphAtlas(
  canvas: HTMLCanvasElement,
  atlasData: {
    tiles: GlyphTileEntry[];
    gridW?: number;
    gridH?: number;
    tileCount?: number;
  },
  opts: RenderOptions = {}
): Promise<RenderResult> {
  if (!browser) throw new Error('renderGlyphAtlas is client-only');

  const {
    width = 256,
    height = 256,
    paletteId = 'nes-yorha',
    showGrid = true,
    highlightCluster = -1,
  } = opts;

  const tiles = atlasData.tiles;
  if (!tiles || tiles.length === 0) {
    const ctx2 = canvas.getContext('2d');
    if (ctx2) {
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
    }
    return { backend: 'cpu', durationMs: 0, tileCount: 0 };
  }

  const palette = PALETTES[paletteId] ?? PALETTES['nes-yorha'];

  // Acquire serial render lock
  let release!: () => void;
  const myTurn = new Promise<void>((res) => {
    release = res;
  });
  const prev = _renderLock;
  _renderLock = myTurn;
  await prev;

  const t0 = performance.now();
  let backend: 'webgpu' | 'cpu' = 'cpu';
  let rgbaPixels: Uint8ClampedArray;

  try {
    const device = await _getDevice();
    if (device) {
      try {
        rgbaPixels = await _renderGPU(device, tiles, width, height, palette, highlightCluster);
        backend = 'webgpu';
      } catch (err) {
        console.warn('[nes-glyph-webgpu] GPU render failed, falling back to CPU:', err);
        rgbaPixels = _renderCPU(tiles, width, height, palette, highlightCluster);
      }
    } else {
      rgbaPixels = _renderCPU(tiles, width, height, palette, highlightCluster);
    }

    // Draw to canvas
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = new ImageData(
        new Uint8ClampedArray(rgbaPixels.buffer as ArrayBuffer),
        width,
        height
      );
      ctx.putImageData(imageData, 0, 0);

      if (showGrid && atlasData.gridW && atlasData.gridH) {
        _drawGrid(ctx, tiles, atlasData.gridW, atlasData.gridH, width, height);
      }
    }
  } finally {
    release();
  }

  return {
    backend,
    durationMs: Math.round(performance.now() - t0),
    tileCount: tiles.length,
  };
}

/**
 * Pick tile nearest to a pointer event (for interactive hover/click).
 *
 * @param e      - Mouse or pointer event on the canvas
 * @param tiles  - Tile entries from the atlas
 * @returns nearest tile index, or -1 if empty
 */
export function pickGlyphTile(
  e: { offsetX: number; offsetY: number },
  canvas: HTMLCanvasElement,
  tiles: GlyphTileEntry[],
): number {
  if (!tiles.length) return -1;
  const ux = e.offsetX / canvas.width;
  const uy = e.offsetY / canvas.height;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    const d = (t.normX - ux) ** 2 + (t.normY - uy) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Release the shared GPU device.
 * Call when the component using the atlas unmounts.
 */
export function destroyGlyphDevice(): void {
  if (_device) {
    _device.destroy();
    _device = null;
    _pipeline = null;
  }
}
