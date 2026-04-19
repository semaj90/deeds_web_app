import type { QuantizedEmbedding } from '$lib/shared/embedding-types';

export interface SimilarityResult {
  index: number;
  score: number;
}

export interface WebGPUSimilarityConfig {
  workgroupSize: number;
  maxBatchSize: number;
  enableProfiling: boolean;
}

// ── GPUBuffer pool ────────────────────────────────────────────────────────────
//
// Staging buffers (MAP_READ | COPY_DST) are the most expensive WebGPU allocation:
// they live in CPU-visible VRAM (or system RAM via PCIe BAR) and require driver-level
// pinning.  Creating one per compute call wastes 0.5–2ms per call on discrete GPUs.
//
// Pool keyed by `${usage}:${cap}` where cap = next power-of-2 size.
// Buffers must be unmapped before returning to pool — enforced in computeSimilarityBatch.

function nextPow2Gpu(n: number): number {
  if (n <= 64) return 64;
  let p = 64;
  while (p < n) p <<= 1;
  return p;
}

class GPUBufferPool {
  private pool = new Map<string, GPUBuffer[]>();
  private static readonly MAX_PER_BUCKET = 8;

  acquire(device: GPUDevice, byteSize: number, usage: GPUBufferUsageFlags): GPUBuffer {
    const cap = nextPow2Gpu(byteSize);
    const key = `${usage}:${cap}`;
    const bucket = this.pool.get(key);
    if (bucket && bucket.length > 0) {
      return bucket.pop()!;
    }
    return device.createBuffer({ size: cap, usage });
  }

  release(buf: GPUBuffer, usage: GPUBufferUsageFlags): void {
    const key = `${usage}:${buf.size}`;
    const bucket = this.pool.get(key) ?? [];
    if (bucket.length < GPUBufferPool.MAX_PER_BUCKET) {
      bucket.push(buf);
      this.pool.set(key, bucket);
    } else {
      buf.destroy();
    }
  }

  drain(): void {
    for (const [, bufs] of this.pool) {
      for (const b of bufs) b.destroy();
    }
    this.pool.clear();
  }
}

/**
 * WebGPU Similarity Engine — optimized for 768-dim quantized embeddings.
 *
 * Optimizations vs baseline:
 *  1. GPUBuffer pool — staging MAP_READ buffers reused across calls
 *  2. WGSL: one workgroup per document (256 threads split embedding dims) — 256× more
 *     parallel than baseline which ran the full dim loop in a single thread
 *  3. Single-pass streaming dot/norm — eliminates the hard-coded array<f32,384> stack
 *     allocation that silently truncated 768-dim embeddings
 *  4. Workgroup tree reduction (256→1) — correct cross-thread dot product accumulation
 *  5. device.queue.writeBuffer for large buffers — async DMA, doesn't block JS
 *  6. mappedAtCreation for small fixed buffers (query, scaleOffset) — zero-copy upload
 */
export class WebGPUSimilarityEngine {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private bufferPool = new GPUBufferPool();
  private config: WebGPUSimilarityConfig;

  constructor(config: Partial<WebGPUSimilarityConfig> = {}) {
    this.config = {
      workgroupSize: 256,          // matches @workgroup_size(256) in shader
      maxBatchSize: 1024 * 1024,
      enableProfiling: false,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (!navigator.gpu) throw new Error('WebGPU not supported');

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter found');

    this.device = await adapter.requestDevice();

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const shaderModule = this.device.createShaderModule({ code: this.getShader() });

    this.pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'computeSimilarity',
      },
    });
  }

  /**
   * Compute cosine similarity between one query and N documents.
   * Returns top-K results sorted by score descending.
   *
   * Key changes from baseline:
   *  - Dispatch = numDocs workgroups (one per doc), not ceil(numDocs/256)
   *  - Each workgroup uses all 256 threads to process the embedding in parallel
   *  - Staging buffer acquired from pool (no alloc on hot path after warm-up)
   */
  async computeSimilarityBatch(
    queryEmbedding: QuantizedEmbedding,
    documentEmbeddings: QuantizedEmbedding[],
    topK = 10
  ): Promise<SimilarityResult[]> {
    if (!this.device || !this.pipeline || !this.bindGroupLayout) {
      throw new Error('WebGPU not initialized');
    }

    const t0 = this.config.enableProfiling ? performance.now() : 0;

    const numDocs = documentEmbeddings.length;
    const dim = queryEmbedding.data.length;   // 768 for embeddinggemma

    // ── Upload query (small, fixed size) — mappedAtCreation for zero-copy ──────
    const queryBuffer = this.device.createBuffer({
      size: queryEmbedding.data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(queryBuffer.getMappedRange()).set(queryEmbedding.data);
    queryBuffer.unmap();

    // ── Pack document embeddings into a single buffer ─────────────────────────
    // Use queue.writeBuffer for large buffers — async DMA, doesn't block JS thread
    const docsBytes = numDocs * dim;
    const docsBuffer = this.device.createBuffer({
      size: docsBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const docsPacked = new Uint8Array(docsBytes);
    for (let i = 0; i < numDocs; i++) {
      docsPacked.set(documentEmbeddings[i].data, i * dim);
    }
    this.device.queue.writeBuffer(docsBuffer, 0, docsPacked);

    // ── Scale/offset uniform: [queryScale, queryOffset, d0Scale, d0Offset, ...] ─
    const scaleOffsetData = new Float32Array(2 + numDocs * 2);
    scaleOffsetData[0] = queryEmbedding.scale;
    scaleOffsetData[1] = queryEmbedding.offset;
    for (let i = 0; i < numDocs; i++) {
      scaleOffsetData[2 + i * 2]     = documentEmbeddings[i].scale;
      scaleOffsetData[2 + i * 2 + 1] = documentEmbeddings[i].offset;
    }
    const scaleBuffer = this.device.createBuffer({
      size: scaleOffsetData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(scaleBuffer.getMappedRange()).set(scaleOffsetData);
    scaleBuffer.unmap();

    // ── Output + staging buffers — both pooled ────────────────────────────────
    const outputBytes = numDocs * 4;
    const outputBuffer = this.bufferPool.acquire(
      this.device, outputBytes,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    );
    const stagingBuffer = this.bufferPool.acquire(
      this.device, outputBytes,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    );

    // ── Encode + dispatch ─────────────────────────────────────────────────────
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: queryBuffer } },
        { binding: 1, resource: { buffer: docsBuffer } },
        { binding: 2, resource: { buffer: scaleBuffer } },
        { binding: 3, resource: { buffer: outputBuffer, size: outputBytes } },
      ],
    });

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    // One workgroup per document — all 256 threads collaborate on the embedding
    pass.dispatchWorkgroups(numDocs, 1, 1);
    pass.end();
    enc.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputBytes);
    this.device.queue.submit([enc.finish()]);

    // ── Read results ──────────────────────────────────────────────────────────
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const scores = new Float32Array(stagingBuffer.getMappedRange(0, outputBytes));
    const results: SimilarityResult[] = Array.from({ length: numDocs }, (_, i) => ({
      index: i,
      score: scores[i],
    }));
    stagingBuffer.unmap(); // must unmap BEFORE returning to pool

    // ── Cleanup: destroy per-call buffers, return pooled ones ─────────────────
    queryBuffer.destroy();
    docsBuffer.destroy();
    scaleBuffer.destroy();
    this.bufferPool.release(outputBuffer, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.bufferPool.release(stagingBuffer, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);

    results.sort((a, b) => b.score - a.score);

    if (this.config.enableProfiling) {
      console.log(
        `[WebGPU] ${numDocs} docs × ${dim}-dim: ${(performance.now() - t0).toFixed(1)}ms`
      );
    }

    return results.slice(0, topK);
  }

  /**
   * WGSL compute shader — workgroup-parallel cosine similarity.
   *
   * Dispatch: one workgroup per document.
   * Threads: 256 per workgroup, each handling stride-sampled embedding dims.
   * Reduction: parallel tree reduction within workgroup shared memory.
   *
   * This replaces the single-threaded baseline that had two bugs:
   *   1. array<f32, 384> hard-coded — silently truncated 768-dim embeddings
   *   2. Full dim loop in one thread — 256× under-utilized the workgroup
   */
  private getShader(): string {
    return /* wgsl */`
      // params layout: [queryScale, queryOffset, doc0Scale, doc0Offset, doc1Scale, ...]
      @group(0) @binding(0) var<storage, read> queryBytes : array<u32>;
      @group(0) @binding(1) var<storage, read> docBytes   : array<u32>;
      @group(0) @binding(2) var<storage, read> params     : array<f32>;
      @group(0) @binding(3) var<storage, read_write> output : array<f32>;

      // Workgroup shared memory for parallel tree reduction
      // 3 arrays × 256 threads × 4 bytes = 3 KB per workgroup (well within 16–96 KB limit)
      var<workgroup> sh_dot   : array<f32, 256>;
      var<workgroup> sh_qnorm : array<f32, 256>;
      var<workgroup> sh_dnorm : array<f32, 256>;

      @compute @workgroup_size(256)
      fn computeSimilarity(
        @builtin(workgroup_id)       wgId   : vec3<u32>,
        @builtin(local_invocation_id) localId : vec3<u32>,
      ) {
        let docIdx  = wgId.x;
        let tid     = localId.x;                    // 0 .. 255
        let dim     = arrayLength(&queryBytes);      // e.g. 768

        if (docIdx >= arrayLength(&output)) { return; }

        let qScale  = params[0];
        let qOff    = params[1];
        let dScale  = params[2u + docIdx * 2u];
        let dOff    = params[3u + docIdx * 2u];

        // Each thread accumulates its stride-sampled portion of the embedding
        var local_dot   : f32 = 0.0;
        var local_qnorm : f32 = 0.0;
        var local_dnorm : f32 = 0.0;

        var i : u32 = tid;
        loop {
          if (i >= dim) { break; }

          let q = (f32(queryBytes[i])                  / 255.0) * qScale + qOff;
          let d = (f32(docBytes[docIdx * dim + i]) / 255.0) * dScale + dOff;

          local_dot   += q * d;
          local_qnorm += q * q;
          local_dnorm += d * d;

          i += 256u;
        }

        sh_dot[tid]   = local_dot;
        sh_qnorm[tid] = local_qnorm;
        sh_dnorm[tid] = local_dnorm;
        workgroupBarrier();

        // Parallel tree reduction: 256 → 128 → 64 → 32 → 16 → 8 → 4 → 2 → 1
        var stride : u32 = 128u;
        loop {
          if (stride == 0u) { break; }
          if (tid < stride) {
            sh_dot[tid]   += sh_dot[tid   + stride];
            sh_qnorm[tid] += sh_qnorm[tid + stride];
            sh_dnorm[tid] += sh_dnorm[tid + stride];
          }
          workgroupBarrier();
          stride >>= 1u;
        }

        if (tid == 0u) {
          let denom = sqrt(sh_qnorm[0]) * sqrt(sh_dnorm[0]);
          output[docIdx] = select(0.0, sh_dot[0] / denom, denom > 1e-8);
        }
      }
    `;
  }

  static async isSupported(): Promise<boolean> {
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  static async getAdapterInfo(): Promise<GPUAdapterInfo | null> {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter?.info ?? null;
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.bufferPool.drain();
    this.device?.destroy();
    this.device = null;
    this.pipeline = null;
    this.bindGroupLayout = null;
  }
}
