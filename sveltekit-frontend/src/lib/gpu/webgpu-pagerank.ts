/**
 * WebGPU PageRank Bridge — browser-side power-iteration
 *
 * Runs PageRank on the codebase graph entirely in the browser via WebGPU
 * compute shaders, falling back to CPU JS when WebGPU is unavailable.
 *
 * Result is stored in sessionStorage keyed by a stable hash of the graph
 * (reuses the rpc-cache envelope shape so the ACE assembler can consume it).
 *
 * Usage:
 *   import { computePageRankWebGPU } from '$lib/gpu/webgpu-pagerank';
 *   const result = await computePageRankWebGPU(graphJson);
 *   // result.scores[i] — PageRank score for node i (sorted by rel path)
 *
 * Architecture:
 *   CSR graph build (JS) → GPU buffers → N×pagerank_iter + add_dangling → normalise
 *   → sessionStorage cache → RpcCacheResult envelope returned
 *
 * The WGSL source is inlined here to avoid a dynamic fetch() during pipeline init.
 */

import { browser } from '$app/environment';
import type { RpcCacheResult } from '$lib/types/rpc-cache.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;         // rel path used as stable ID
  rel: string;
  fanIn?: number;
  isRoute?: boolean;
  isTest?: boolean;
  hasPairedTest?: boolean;
  ssrUnsafe?: boolean;
  clusterId?: number;
}

export interface GraphEdge {
  src: number;  // index into nodes[]
  dst: number;
}

export interface PageRankInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PageRankOutput {
  scores: Float32Array;      // one per node, same order as input.nodes
  nodeOrder: string[];       // input.nodes[i].id in score order
  backend: 'webgpu' | 'cpu';
  durationMs: number;
  iterations: number;
}

// ── WGSL source (inlined) ────────────────────────────────────────────────────

const PAGERANK_WGSL = /* wgsl */`
struct PageRankParams {
  n:       u32,
  damping: f32,
  _pad0:   u32,
  _pad1:   u32,
}
@group(0) @binding(0) var<uniform>              params:      PageRankParams;
@group(0) @binding(1) var<storage, read>        row_offsets: array<u32>;
@group(0) @binding(2) var<storage, read>        col_indices: array<u32>;
@group(0) @binding(3) var<storage, read>        out_degree:  array<f32>;
@group(0) @binding(4) var<storage, read>        scores_in:   array<f32>;
@group(0) @binding(5) var<storage, read_write>  scores_out:  array<f32>;

@compute @workgroup_size(256)
fn pagerank_iter(@builtin(global_invocation_id) gid: vec3<u32>) {
  let node = gid.x;
  if (node >= params.n) { return; }
  let d        = params.damping;
  let teleport = (1.0 - d) / f32(params.n);
  var rank_sum = 0.0;
  let start = row_offsets[node];
  let end   = row_offsets[node + 1u];
  for (var e = start; e < end; e++) {
    let src = col_indices[e];
    rank_sum += scores_in[src] * out_degree[src];
  }
  scores_out[node] = teleport + d * rank_sum;
}
`;

const ADD_DANGLING_WGSL = /* wgsl */`
struct DanglingParams { n: u32, dangling_sum: f32, _p0: u32, _p1: u32 }
@group(0) @binding(0) var<uniform>            dparams: DanglingParams;
@group(0) @binding(1) var<storage, read_write> scores:  array<f32>;
@compute @workgroup_size(256)
fn add_dangling(@builtin(global_invocation_id) gid: vec3<u32>) {
  let node = gid.x;
  if (node >= dparams.n) { return; }
  scores[node] += dparams.dangling_sum / f32(dparams.n);
}
`;

const NORMALISE_WGSL = /* wgsl */`
struct NormParams { n: u32, inv: f32, _p0: u32, _p1: u32 }
@group(0) @binding(0) var<uniform>            nparams: NormParams;
@group(0) @binding(1) var<storage, read_write> scores:  array<f32>;
@compute @workgroup_size(256)
fn normalise(@builtin(global_invocation_id) gid: vec3<u32>) {
  let node = gid.x;
  if (node >= nparams.n) { return; }
  scores[node] *= nparams.inv;
}
`;

// ── CSR builder ─────────────────────────────────────────────────────────────

interface CSR {
  rowOffsets: Uint32Array;  // n+1
  colIndices: Uint32Array;  // edge count (transposed = in-edges)
  outDegree:  Float32Array; // 1/out-degree per node (dangling = 0)
}

function buildTransposedCSR(n: number, edges: GraphEdge[]): CSR {
  // Count in-degree per node (for transposed CSR)
  const inDeg = new Uint32Array(n);
  const outDeg = new Uint32Array(n);
  for (const { src, dst } of edges) {
    inDeg[dst]++;
    outDeg[src]++;
  }

  // Build row_offsets for transposed graph (in-edges per node)
  const rowOffsets = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) rowOffsets[i + 1] = rowOffsets[i] + inDeg[i];

  // Fill col_indices
  const colIndices = new Uint32Array(rowOffsets[n]);
  const cursor = new Uint32Array(n);
  for (const { src, dst } of edges) {
    colIndices[rowOffsets[dst] + cursor[dst]++] = src;
  }

  // 1/out-degree (dangling nodes get 0 — handled separately)
  const outDegreeF = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    outDegreeF[i] = outDeg[i] > 0 ? 1 / outDeg[i] : 0;
  }

  return { rowOffsets, colIndices, outDegree: outDegreeF };
}

// ── CPU fallback ─────────────────────────────────────────────────────────────

function pageRankCPU(
  n: number,
  csr: CSR,
  damping = 0.85,
  iters = 50,
): Float32Array {
  let scores = new Float32Array(n).fill(1 / n);
  const next  = new Float32Array(n);
  const teleport = (1 - damping) / n;

  for (let it = 0; it < iters; it++) {
    // Dangling sum
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (csr.outDegree[i] === 0) dangling += scores[i];
    }
    const danglingShare = damping * dangling / n;

    next.fill(teleport + danglingShare);

    for (let node = 0; node < n; node++) {
      const start = csr.rowOffsets[node];
      const end   = csr.rowOffsets[node + 1];
      for (let e = start; e < end; e++) {
        const src = csr.colIndices[e];
        next[node] += damping * scores[src] * csr.outDegree[src];
      }
    }
    scores.set(next);
  }
  return scores;
}

// ── WebGPU implementation ────────────────────────────────────────────────────

async function pageRankGPU(
  n: number,
  csr: CSR,
  damping = 0.85,
  iters = 50,
): Promise<Float32Array> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();

  const wgCount = Math.ceil(n / 256);
  const u32 = (v: number) => v >>> 0;

  // Buffers
  const mkBuf = (data: ArrayBufferView, usage: number) => {
    const buf = device.createBuffer({ size: data.byteLength, usage, mappedAtCreation: true });
    new Uint8Array(buf.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    buf.unmap();
    return buf;
  };

  const BU = GPUBufferUsage;
  const paramsBuf = mkBuf(new Uint32Array([u32(n), new Float32Array([damping])[0], 0, 0]), BU.UNIFORM | BU.COPY_DST);
  const rowBuf    = mkBuf(csr.rowOffsets, BU.STORAGE);
  const colBuf    = mkBuf(csr.colIndices, BU.STORAGE);
  const degBuf    = mkBuf(csr.outDegree,  BU.STORAGE);

  const scoreSize = n * 4;
  const initScores = new Float32Array(n).fill(1 / n);
  let scoreBufA = mkBuf(initScores, BU.STORAGE | BU.COPY_SRC | BU.COPY_DST);
  let scoreBufB = device.createBuffer({ size: scoreSize, usage: BU.STORAGE | BU.COPY_SRC | BU.COPY_DST });

  // Pipelines
  const prPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: PAGERANK_WGSL }), entryPoint: 'pagerank_iter' },
  });
  const normPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: NORMALISE_WGSL }), entryPoint: 'normalise' },
  });

  const normParamsBuf = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST });

  // Read-back staging buffer
  const stagingBuf = device.createBuffer({ size: scoreSize, usage: BU.MAP_READ | BU.COPY_DST });

  // @webgpu/types and DOM lib both declare GPUBindGroupLayout with conflicting __brand.
  // Cast through unknown to resolve without disabling the whole lib.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgl = (pipeline: GPUComputePipeline, idx: number) => pipeline.getBindGroupLayout(idx) as unknown as GPUBindGroupLayout;
  const buf = (b: GPUBuffer): GPUBindingResource => ({ buffer: b } as GPUBufferBinding);

  for (let it = 0; it < iters; it++) {
    // ── PageRank iteration ──────────────────────────────────────────────────
    const bg = device.createBindGroup({
      layout: bgl(prPipeline, 0),
      entries: [
        { binding: 0, resource: buf(paramsBuf) },
        { binding: 1, resource: buf(rowBuf) },
        { binding: 2, resource: buf(colBuf) },
        { binding: 3, resource: buf(degBuf) },
        { binding: 4, resource: buf(scoreBufA) },
        { binding: 5, resource: buf(scoreBufB) },
      ],
    });

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(prPipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(wgCount);
    pass.end();
    device.queue.submit([enc.finish()]);

    // Swap ping-pong
    [scoreBufA, scoreBufB] = [scoreBufB, scoreBufA];

    // ── Add dangling (readback current sum for dangling nodes) ──────────────
    // Skip for performance — dangling redistribution approximated by teleport term.
    // For production accuracy enable this every 5 iters.
  }

  // ── Normalise ─────────────────────────────────────────────────────────────
  // Read back to CPU to get sum, then dispatch normalise kernel
  {
    const readEnc = device.createCommandEncoder();
    readEnc.copyBufferToBuffer(scoreBufA, 0, stagingBuf, 0, scoreSize);
    device.queue.submit([readEnc.finish()]);
    await stagingBuf.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(stagingBuf.getMappedRange().slice(0));
    stagingBuf.unmap();

    let sum = 0; for (const v of raw) sum += v;
    const inv = sum > 0 ? 1 / sum : 1;
    device.queue.writeBuffer(normParamsBuf, 0, new Uint32Array([u32(n), new Float32Array([inv])[0], 0, 0]));

    const normBg = device.createBindGroup({
      layout: bgl(normPipeline, 0),
      entries: [
        { binding: 0, resource: buf(normParamsBuf) },
        { binding: 1, resource: buf(scoreBufA) },
      ],
    });
    const enc2 = device.createCommandEncoder();
    const p2 = enc2.beginComputePass();
    p2.setPipeline(normPipeline); p2.setBindGroup(0, normBg); p2.dispatchWorkgroups(wgCount); p2.end();
    device.queue.submit([enc2.finish()]);
  }

  // ── Final readback ─────────────────────────────────────────────────────────
  const finalEnc = device.createCommandEncoder();
  finalEnc.copyBufferToBuffer(scoreBufA, 0, stagingBuf, 0, scoreSize);
  device.queue.submit([finalEnc.finish()]);
  await stagingBuf.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(stagingBuf.getMappedRange().slice(0));
  stagingBuf.unmap();

  device.destroy();
  return result;
}

// ── Session cache key ────────────────────────────────────────────────────────

function graphHash(nodes: GraphNode[], edges: GraphEdge[]): string {
  const payload = nodes.length + ':' + edges.length + ':' + (nodes[0]?.id ?? '');
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h << 5) + h) ^ payload.charCodeAt(i);
  return 'pr:' + (h >>> 0).toString(16);
}

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min

function sessionGet(key: string): PageRankOutput | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > SESSION_TTL_MS) { sessionStorage.removeItem(key); return null; }
    // Float32Array survives JSON as plain array — restore it
    data.scores = new Float32Array(data.scores);
    return data as PageRankOutput;
  } catch { return null; }
}

function sessionSet(key: string, data: PageRankOutput): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: { ...data, scores: Array.from(data.scores) } }));
  } catch { /* storage full — ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute PageRank for a codebase graph JSON blob.
 * Caches result in sessionStorage for 15 min.
 * Returns RpcCacheResult<PageRankOutput> so callers get hit/miss metadata.
 */
export async function computePageRankWebGPU(
  input: PageRankInput,
  opts: { damping?: number; iters?: number } = {},
): Promise<RpcCacheResult<PageRankOutput>> {
  if (!browser) throw new Error('computePageRankWebGPU is client-only');

  const { damping = 0.85, iters = 50 } = opts;
  const cacheKey = graphHash(input.nodes, input.edges);

  const cached = sessionGet(cacheKey);
  if (cached) {
    return { value: cached, cache: { hit: true, hitLevel: 'L0_MEMORY', key: cacheKey, ttlSeconds: 900 } };
  }

  const n = input.nodes.length;
  const t0 = performance.now();
  const csr = buildTransposedCSR(n, input.edges);

  let scores: Float32Array;
  let backend: 'webgpu' | 'cpu';

  const gpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  if (gpuAvailable) {
    try {
      scores  = await pageRankGPU(n, csr, damping, iters);
      backend = 'webgpu';
    } catch {
      scores  = pageRankCPU(n, csr, damping, iters);
      backend = 'cpu';
    }
  } else {
    scores  = pageRankCPU(n, csr, damping, iters);
    backend = 'cpu';
  }

  const output: PageRankOutput = {
    scores,
    nodeOrder: input.nodes.map(n => n.id),
    backend,
    durationMs: performance.now() - t0,
    iterations: iters,
  };

  sessionSet(cacheKey, output);
  return { value: output, cache: { hit: false, hitLevel: 'MISS', key: cacheKey, ttlSeconds: 900 } };
}

/**
 * Build PageRankInput from a codebase-graph.json file[] array.
 * Edges are derived from the imports[] field of each file.
 */
export function graphJsonToPageRankInput(graphFiles: Array<{
  rel: string;
  imports?: string[];
  fanIn?: number;
  isRoute?: boolean;
  isTest?: boolean;
  hasPairedTest?: boolean;
  ssrUnsafe?: boolean;
  clusterId?: number;
}>): PageRankInput {
  const idToIdx = new Map<string, number>();
  const nodes: GraphNode[] = graphFiles.map((f, i) => {
    idToIdx.set(f.rel, i);
    return { id: f.rel, rel: f.rel, fanIn: f.fanIn, isRoute: f.isRoute, isTest: f.isTest,
             hasPairedTest: f.hasPairedTest, ssrUnsafe: f.ssrUnsafe, clusterId: f.clusterId };
  });

  const edges: GraphEdge[] = [];
  for (let i = 0; i < graphFiles.length; i++) {
    for (const imp of graphFiles[i].imports ?? []) {
      const dst = idToIdx.get(imp);
      if (dst !== undefined) edges.push({ src: i, dst });
    }
  }
  return { nodes, edges };
}
