/**
 * bitset-webgpu-engine.ts
 *
 * WebGPU Hardware Accelerator for AlignedBitsetBlobV1.
 * Dispatches parallel WGSL compute shaders for high-throughput batch Jaccard similarity
 * and vector popcount across multi-megabyte candidate flag bitsets.
 *
 * Provides transparent CPU fallback using constant-time popcount32 when WebGPU is unavailable.
 */

import type { AlignedBitsetBlobV1 } from '$lib/server/atlas/tensors/aligned-bitset-blob-v1.js';
import { jaccardSimilarity, popcount } from '$lib/server/atlas/tensors/aligned-bitset-blob-v1.js';
import { WebGPUInit } from './webgpu-init.js';

/**
 * Computes Jaccard similarity on CPU (used as reference and automatic fallback).
 */
export function computeBatchJaccardCpu(
  query: AlignedBitsetBlobV1,
  candidates: readonly AlignedBitsetBlobV1[]
): Float32Array {
  const scores = new Float32Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    scores[i] = jaccardSimilarity(query, candidates[i]);
  }
  return scores;
}

/**
 * Computes population counts on CPU (fallback).
 */
export function computeBatchPopcountCpu(
  bitsets: readonly AlignedBitsetBlobV1[]
): Uint32Array {
  const counts = new Uint32Array(bitsets.length);
  for (let i = 0; i < bitsets.length; i++) {
    counts[i] = popcount(bitsets[i]);
  }
  return counts;
}

export class BitsetWebGpuEngine {
  private static instance: BitsetWebGpuEngine | null = null;
  private device: GPUDevice | null = null;
  private isAvailable: boolean = false;

  private constructor() {}

  static getInstance(): BitsetWebGpuEngine {
    if (!BitsetWebGpuEngine.instance) {
      BitsetWebGpuEngine.instance = new BitsetWebGpuEngine();
    }
    return BitsetWebGpuEngine.instance;
  }

  /**
   * Initializes the WebGPU device connection.
   */
  async init(): Promise<boolean> {
    if (this.device) return true;

    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        this.isAvailable = false;
        return false;
      }

      const initSystem = WebGPUInit.getInstance();
      const capabilities = await initSystem.initialize();
      this.device = initSystem.getDevice();
      this.isAvailable = capabilities.hasWebGPU && this.device !== null;
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Evaluates pairwise Jaccard similarities between a query bitset and N candidate bitsets.
   * Dispatches to WebGPU when available; falls back to CPU cleanly.
   */
  async batchJaccardSimilarity(
    query: AlignedBitsetBlobV1,
    candidates: readonly AlignedBitsetBlobV1[]
  ): Promise<Float32Array> {
    if (candidates.length === 0) {
      return new Float32Array(0);
    }

    const hasGpu = await this.init();
    if (!hasGpu || !this.device) {
      return computeBatchJaccardCpu(query, candidates);
    }

    try {
      return await this.dispatchWebGpuJaccard(query, candidates);
    } catch (err) {
      console.warn('WebGPU bitset batchJaccard failed, falling back to CPU:', err);
      return computeBatchJaccardCpu(query, candidates);
    }
  }

  /**
   * Internal WebGPU dispatch for batch Jaccard similarity.
   */
  private async dispatchWebGpuJaccard(
    query: AlignedBitsetBlobV1,
    candidates: readonly AlignedBitsetBlobV1[]
  ): Promise<Float32Array> {
    const device = this.device!;
    const numCandidates = candidates.length;
    // Each uint64 word is two u32 words
    const wordsPerBitsetU32 = query.capacityWords * 2;
    const headerOffsetU32 = 16; // 64 bytes header = 16 x u32

    // 1. Pack Query Buffer (u32 array view over rawBuffer)
    const queryU32 = new Uint32Array(query.rawBuffer);
    const queryGpuBuffer = device.createBuffer({
      size: queryU32.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(queryGpuBuffer, 0, queryU32);

    // 2. Pack Candidates Buffer
    const totalBytesPerCandidate = query.totalByteLength;
    const candidateCombinedBytes = new Uint8Array(numCandidates * totalBytesPerCandidate);
    for (let i = 0; i < numCandidates; i++) {
      candidateCombinedBytes.set(
        new Uint8Array(candidates[i].rawBuffer),
        i * totalBytesPerCandidate
      );
    }
    const candidateGpuBuffer = device.createBuffer({
      size: candidateCombinedBytes.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(candidateGpuBuffer, 0, candidateCombinedBytes);

    // 3. Uniform Params Buffer
    const paramsArray = new Uint32Array([
      wordsPerBitsetU32,
      numCandidates,
      headerOffsetU32,
      query.bitCount,
    ]);
    const paramsBuffer = device.createBuffer({
      size: 16, // 4 x u32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramsBuffer, 0, paramsArray);

    // 4. Output Storage Buffer & Staging Buffer
    const outputByteLength = numCandidates * Float32Array.BYTES_PER_ELEMENT;
    const outputBuffer = device.createBuffer({
      size: Math.max(16, outputByteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const stagingBuffer = device.createBuffer({
      size: Math.max(16, outputByteLength),
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // 5. Load WGSL shader
    const shaderModule = device.createShaderModule({
      label: 'bitset_jaccard_module',
      code: `
        struct BitsetParams {
          words_per_bitset: u32,
          num_candidates: u32,
          header_offset_u32: u32,
          active_bits: u32,
        };

        @group(0) @binding(0) var<storage, read> query_buffer: array<u32>;
        @group(0) @binding(1) var<storage, read> candidate_buffer: array<u32>;
        @group(0) @binding(2) var<uniform> params: BitsetParams;
        @group(0) @binding(3) var<storage, read_write> output_similarities: array<f32>;

        @compute @workgroup_size(64, 1, 1)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
          let candidate_idx = global_id.x;
          if (candidate_idx >= params.num_candidates) {
            return;
          }

          let words_count = params.words_per_bitset;
          let q_offset = params.header_offset_u32;
          let c_offset = candidate_idx * (words_count + params.header_offset_u32) + params.header_offset_u32;

          var intersection_count: u32 = 0u;
          var union_count: u32 = 0u;

          for (var w: u32 = 0u; w < words_count; w = w + 1u) {
            let qw = query_buffer[q_offset + w];
            let cw = candidate_buffer[c_offset + w];

            intersection_count = intersection_count + countOneBits(qw & cw);
            union_count = union_count + countOneBits(qw | cw);
          }

          if (union_count == 0u) {
            output_similarities[candidate_idx] = 1.0;
          } else {
            output_similarities[candidate_idx] = f32(intersection_count) / f32(union_count);
          }
        }
      `,
    });

    const pipeline = device.createComputePipeline({
      label: 'bitset_jaccard_pipeline',
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: queryGpuBuffer } },
        { binding: 1, resource: { buffer: candidateGpuBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
        { binding: 3, resource: { buffer: outputBuffer } },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    const workgroups = Math.ceil(numCandidates / 64);
    pass.dispatchWorkgroups(workgroups, 1, 1);
    pass.end();

    commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputByteLength);
    device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(stagingBuffer.getMappedRange().slice(0, outputByteLength));
    stagingBuffer.unmap();

    // Cleanup resources
    queryGpuBuffer.destroy();
    candidateGpuBuffer.destroy();
    paramsBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    return resultData;
  }
}
