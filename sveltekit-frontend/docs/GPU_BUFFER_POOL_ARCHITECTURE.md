# GPU Buffer Pool + NES CHR-ROM Cache Integration

## Overview

The GPU compute pipeline (`src/lib/gpu/gpu-compute-pipeline.ts`) uses a **GPUBufferPool** with power-of-2 size-class bucketing to eliminate per-dispatch buffer allocation overhead. This document explains the buffer pool design and how it integrates with the 7-layer NES CHR-ROM cache hierarchy.

---

## 7-Layer Cache Hierarchy

```
┌──────────────────────────────────────────────────────────────────────┐
│  L0  LokiJS Session Cache         (in-memory, sync, 5-10min TTL)   │
│      Router decisions, recent replies, glyph cache promotions       │
│      src/lib/cache/loki-cache.svelte.ts (356L)                     │
├──────────────────────────────────────────────────────────────────────┤
│  L1  IndexedDB Persistent Cache    (browser, async, 7-day TTL)     │
│      Embeddings, chat history, CHR-ROM97 cartridges, GPU results   │
│      src/lib/ai/client-cache.ts (406L)                             │
├──────────────────────────────────────────────────────────────────────┤
│  L2  NES CHR-ROM Pattern Cache     (in-memory, glyph rendering)    │
│      8×8 NES tile patterns, bank-mapped (8 ASCII banks)            │
│      Auto-cleanup: 30min unused + accessCount < 3                  │
│      src/lib/systems/glyph-cache-system.ts (563L)                  │
├──────────────────────────────────────────────────────────────────────┤
│  L3  GPU Buffer Pool ← NEW         (device-lifetime, size-bucketed)│
│      Reusable GPUBuffers via queue.writeBuffer()                   │
│      Power-of-2 size classes (min 256B)                            │
│      src/lib/gpu/gpu-compute-pipeline.ts (GPUBufferPool class)     │
├──────────────────────────────────────────────────────────────────────┤
│  L4  CHR-ROM97 Cartridge Binary    (FP16 compressed, binary codec) │
│      Manifold projection (768-dim → 4D), graph CSR, rune blocks   │
│      src/lib/server/cartridge/chr97-builder.ts (320L)              │
│      src/lib/shared/chr97-reader.ts (144L, browser-safe parser)    │
├──────────────────────────────────────────────────────────────────────┤
│  L5  Server Memory + Redis Cache   (5min / configurable TTL)       │
│      Template cache, LLM response cache, export cache              │
│      src/lib/server/cache.ts + src/lib/server/redis.ts             │
├──────────────────────────────────────────────────────────────────────┤
│  L6  Service Logic                 (DB, vector search, inference)   │
│      PostgreSQL + Qdrant + Neo4j + Ollama                          │
│      Write-back to L0-L5 on miss                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## GPU Buffer Pool Design

### Problem

Each WGSL compute dispatch previously created and destroyed GPU buffers:

| Shader | Buffers Created | Buffers Destroyed | Per Dispatch |
|--------|----------------|-------------------|-------------|
| Cosine Similarity | 5 (params, query, docs, result, staging) | 5 | 10 GPU API calls wasted |
| L2 Normalize | 3 (params, vectors, staging) | 3 | 6 GPU API calls wasted |
| Matrix Multiply | 5 (params, A, B, C, staging) | 5 | 10 GPU API calls wasted |

For search reranking (hot path), cosine similarity runs per user query — 10 wasted GPU API calls each time.

### Solution: Size-Class Bucketed Pool

```
Requested: 3072 bytes (768-dim × 4 bytes)
Size class: 4096 bytes (next power of 2)
Pool key:   "72:4096" (usage flags : size class)

First call:  pool.acquire() → creates 4096B buffer (MISS)
Second call: pool.acquire() → returns existing buffer (HIT)
             queue.writeBuffer() updates data in-place
```

**Size classes**: 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, ...

### API

```typescript
class GPUBufferPool {
  acquire(size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer
  release(buffer: GPUBuffer): void
  get stats(): BufferPoolStats  // { acquired, hits, hitRate, pooledBuffers, pooledBytes }
  destroy(): void               // Clean up all pooled buffers
}
```

### Typical Buffer Lifecycle

```
1. pool.acquire(3072, STORAGE | COPY_DST)     → 4096B buffer (new or reused)
2. device.queue.writeBuffer(buffer, 0, data)   → upload 3072B into 4096B buffer
3. encoder.dispatch(...)                        → GPU compute
4. pool.release(buffer)                         → back to pool for reuse
```

### Pool Key Strategy

```
Key = "${usage_flags}:${size_class}"

Examples:
  "72:256"     → UNIFORM | COPY_DST, 256B  (params buffers)
  "136:4096"   → STORAGE | COPY_DST, 4096B (query vectors)
  "136:524288" → STORAGE | COPY_DST, 512KB (document batches)
  "33:4096"    → MAP_READ | COPY_DST, 4KB  (staging readback)
```

Buffers only reuse when **both** usage flags and size class match.

### Device Loss Recovery

```typescript
device.lost.then((info) => {
  bufferPool.destroy();     // All pooled GPUBuffers become invalid
  pipelineCache.clear();    // GPUComputePipelines invalid too
  backend = 'cpu';          // Graceful fallback
});
```

---

## Integration with CHR-ROM Cache

### Current Data Flow

```
User types search query
  ↓
L0: LokiJS router decision cache (sync, <0.1ms)
  ↓ miss
Client Router determines: local ONNX or server Ollama
  ↓ local path
L1: IndexedDB embedding cache (async, 1-5ms)
  ↓ miss
ONNX embeddinggemma (768-dim, WebGPU/WASM)
  ↓ store to L1
L3: GPU Buffer Pool — cosine similarity dispatch
  ├─ Acquire 5 buffers from pool
  ├─ writeBuffer() data uploads
  ├─ WGSL cosine shader (workgroup 256)
  ├─ Staging readback via mapAsync
  └─ Release 5 buffers to pool
  ↓ results
L0: Cache reranked results to LokiJS (5min TTL)
  ↓
Display ranked search results
```

### CHR-ROM97 Cartridge ↔ GPU Pipeline

The CHR-ROM97 binary format stores FP16-compressed embedding manifolds (768-dim → 4D projection). These can feed directly into GPU compute:

```
CHR-ROM97 Cartridge (L4)
  ├─ TensorBank: FP16 embeddings → decompress to Float32 → GPU buffer
  ├─ Manifold[4]: 4D projection → spatial hash for fast kNN prefilter
  └─ GraphCSR: Neighbor indices → GPU-accelerated graph traversal
```

---

## Enhancement Roadmap

### Phase 1: CHR-ROM97 → GPU Direct Pipeline

**Goal**: Load cartridge tensor banks directly into GPU buffers, skip CPU intermediary.

```typescript
// Current: Cartridge → CPU Float32Array → writeBuffer → GPU
const cartridge = await clientCache.getCartridge(caseId);
const tensors = parseTensorBank(cartridge); // FP16 → Float32 on CPU
const result = await gpuCompute.cosineSimilarity(query, tensors, count);

// Enhanced: Cartridge → GPU buffer (FP16 decode in WGSL shader)
const cartridge = await clientCache.getCartridge(caseId);
const rawFP16 = extractTensorBankRaw(cartridge); // No CPU decode
const result = await gpuCompute.cosineSimilarityFP16(query, rawFP16, count);
```

**New WGSL shader needed**: FP16 → F32 conversion in compute shader:
```wgsl
fn fp16_to_f32(bits: u32) -> f32 {
  let sign = (bits >> 15u) & 1u;
  let exp = (bits >> 10u) & 0x1Fu;
  let mantissa = bits & 0x3FFu;
  // IEEE 754 half-precision decode...
}
```

**Benefit**: Eliminates CPU-side FP16→Float32 conversion for tensor banks. GPU does the decode during compute.

### Phase 2: Glyph Quantization on GPU

**Goal**: Move glyph pattern quantization (`base64FP32Quantizer`) from CPU Canvas to GPU compute.

```
Current:  OffscreenCanvas → getImageData → CPU quantize → Float32Array
Enhanced: OffscreenCanvas → GPU texture → WGSL quantize shader → GPU buffer
```

**New WGSL shader**: Texture sampling + quantization:
```wgsl
@group(0) @binding(0) var glyph_texture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> quantized: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pixel = textureLoad(glyph_texture, vec2<u32>(gid.x % 8u, gid.x / 8u), 0);
  quantized[gid.x] = pixel.r; // Grayscale intensity
}
```

**Benefit**: Batch glyph rendering (256 glyphs per bank) → single GPU dispatch instead of 256 CPU iterations.

### Phase 3: Graph CSR Traversal on GPU

**Goal**: Use WGSL compute to traverse CHR-ROM97 graph CSR for kNN neighbor lookups.

```
Current:  CPU loop over CSR offsets + edges arrays
Enhanced: GPU parallel BFS/DFS over CSR in a single dispatch
```

```wgsl
@group(0) @binding(0) var<storage, read> offsets: array<u32>;
@group(0) @binding(1) var<storage, read> edges: array<u32>;
@group(0) @binding(2) var<storage, read> embeddings: array<f32>;
@group(0) @binding(3) var<storage, read_write> distances: array<f32>;

@compute @workgroup_size(256)
fn bfs_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let node = gid.x;
  let start = offsets[node];
  let end = offsets[node + 1u];
  // Parallel neighbor distance computation
  for (var e = start; e < end; e = e + 1u) {
    let neighbor = edges[e];
    distances[neighbor] = cosine_dist(node, neighbor);
  }
}
```

**Benefit**: Graph neighbor discovery scales with GPU parallelism instead of CPU sequential.

### Phase 4: Unified Buffer Pool Across Layers

**Goal**: Single buffer pool serving all GPU consumers (search reranker, glyph quantizer, graph traversal, embedding).

```
GPUBufferPool (singleton)
  ├── cosine_similarity dispatch (5 buffers)
  ├── l2_normalize dispatch (3 buffers)
  ├── matmul dispatch (5 buffers)
  ├── fp16_decode dispatch (2 buffers)        ← Phase 1
  ├── glyph_quantize dispatch (2 buffers)     ← Phase 2
  └── graph_bfs dispatch (4 buffers)          ← Phase 3
```

All consumers share the same size-class buckets. A 4096B buffer released by cosine similarity can be reused by glyph quantization if the usage flags match.

### Phase 5: Pool Metrics → Cache Monitoring Dashboard

Wire `poolStats` to the existing admin cache dashboard (`/admin/cache`):

```typescript
// GET /api/cache/stats already exists — add GPU pool stats
const gpuStats = getCachedGPUCompute()?.poolStats;
return json({
  redis: redisStats,
  template: templateStats,
  llm: llmStats,
  memory: memoryStats,
  gpuPool: gpuStats  // { acquired, hits, hitRate, pooledBuffers, pooledBytes }
});
```

---

## Performance Impact

| Metric | Before (create/destroy) | After (buffer pool) |
|--------|------------------------|---------------------|
| GPU API calls per cosine dispatch | 10 (5 create + 5 destroy) | 0 (after warmup) |
| Buffer allocation latency | 0.1-1ms per buffer | 0ms (pool hit) |
| GC pressure | High (5 objects per dispatch) | Near-zero |
| Memory overhead | Exact-size allocation | ~2x worst case (power-of-2 rounding) |
| Device loss recovery | N/A (no cleanup needed) | Automatic (pool.destroy + fallback) |

**Typical hot path** (768-dim cosine, 100 documents):
- First call: 5 buffer creates (~0.5ms) + compute (~2ms) = ~2.5ms
- Subsequent calls: 0 creates + compute (~2ms) = ~2ms (20% faster)

For repeated search queries, the pool eliminates allocation overhead entirely.

---

## File Map

| File | Lines | Role |
|------|-------|------|
| `src/lib/gpu/gpu-compute-pipeline.ts` | ~810 | GPUBufferPool + 3 WGSL shaders + DeedsGPUCompute class |
| `src/lib/gpu/gpu-search-reranker.ts` | 178 | Client-side search reranking via GPU cosine similarity |
| `src/lib/gpu/chrrom-cache.ts` | 31 | Simple pattern cache wrapper |
| `src/lib/systems/glyph-cache-system.ts` | 563 | NES-style glyph rendering + CHR-ROM bank mapping |
| `src/lib/server/cartridge/chr97-builder.ts` | 320 | CHR-ROM97 binary builder (FP16, manifold, CSR) |
| `src/lib/shared/chr97-reader.ts` | 144 | Browser-safe cartridge parser |
| `src/lib/cache/loki-cache.svelte.ts` | 356 | LokiJS session cache (L0) |
| `src/lib/ai/client-cache.ts` | 406 | IndexedDB persistent cache (L1) |
| `src/lib/cache/nes-cache-orchestrator.ts` | 39 | TTL-aware key-value wrapper |
| `src/lib/server/cache.ts` | — | Server memory + Redis dual-tier (L5) |
| `src/lib/server/graph/graph-centrality.ts` | 274 | Neo4j graph centrality for signal #4 |
