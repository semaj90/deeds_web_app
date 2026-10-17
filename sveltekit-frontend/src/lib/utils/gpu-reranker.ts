/**
 * gpu-reranker.ts
 *
 * Client-side WebGPU (WGSL) acceleration for re-ranking thousands of 
 * search results based on multi-dimensional feature vectors.
 * 
 * Logic implemented from the Phase D Technical Specification:
 * - trust_tier: 0.3
 * - karpathy_blend: 0.5
 * - risk_score: 0.2 (penalty)
 */

import schemaEncoderSource from '../webgpu/schema-encoder.wgsl?raw';

export const BROWSER_RERANK_MAX_ROWS = 4096;
export const BROWSER_RERANK_FEATURE_SCHEMA = 'atlas.browser-doc-features.v1';

export interface DocFeatures {
  trust_tier: number;
  som_cluster: number;
  karpathy_blend: number;
  pagerank: number;
  risk_score: number;
}

function packFeatures(docs: readonly DocFeatures[]): Float32Array<ArrayBuffer> {
  if (!Array.isArray(docs) || docs.length > BROWSER_RERANK_MAX_ROWS) throw new Error('BROWSER_RERANK_BATCH_INVALID');
  const packed = new Float32Array(docs.length * 5);
  docs.forEach((doc, row) => {
    const values = [doc?.trust_tier, doc?.som_cluster, doc?.karpathy_blend, doc?.pagerank, doc?.risk_score];
    values.forEach((value, column) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
        throw new Error('BROWSER_RERANK_FEATURE_INVALID');
      }
      packed[row * 5 + column] = value;
    });
  });
  return packed;
}

function scorePackedFeatures(packed: Float32Array): Float32Array<ArrayBuffer> {
  const scores = new Float32Array(packed.length / 5);
  for (let row = 0; row < scores.length; row++) {
    const trust = Math.fround(packed[row * 5] * Math.fround(0.3));
    const blend = Math.fround(packed[row * 5 + 2] * Math.fround(0.5));
    const risk = Math.fround(Math.fround(1 - packed[row * 5 + 4]) * Math.fround(0.2));
    scores[row] = Math.fround(Math.fround(trust + blend) + risk);
    if (!Number.isFinite(scores[row])) throw new Error('BROWSER_RERANK_SCORE_INVALID');
  }
  return scores;
}

export function scoreDocFeaturesCPU(docs: readonly DocFeatures[]): Float32Array {
  return scorePackedFeatures(packFeatures(docs));
}


export class GpuReranker {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private initializing: Promise<boolean> | null = null;
  private generation = 0;

  async init() {
    if (this.device && this.pipeline) return true;
    if (this.initializing) return this.initializing;
    this.initializing = this.initialize();
    try { return await this.initializing; }
    finally { this.initializing = null; }
  }

  private async initialize(): Promise<boolean> {
    if (globalThis.isSecureContext !== true || typeof navigator === 'undefined' || !navigator.gpu) return false;
    const generation = this.generation;
    let device: GPUDevice | null = null;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      device = await adapter.requestDevice();
      const pipeline = await device.createComputePipelineAsync({
        layout: 'auto', compute: { module: device.createShaderModule({ code: schemaEncoderSource }), entryPoint: 'main' },
      });
      if (generation !== this.generation) { device.destroy(); return false; }
      this.device = device;
      this.pipeline = pipeline;
      const activeDevice = device;
      void device.lost.then(() => {
        if (this.device === activeDevice) { this.device = null; this.pipeline = null; }
      });
      return true;
    } catch {
      device?.destroy();
      return false;
    }
  }

  dispose(): void {
    this.generation++;
    this.device?.destroy();
    this.device = null;
    this.pipeline = null;
  }

  async rerank(docs: readonly DocFeatures[]): Promise<Float32Array> {
    const flatData = packFeatures(docs);
    const reference = scorePackedFeatures(flatData);
    const device = this.device;
    const pipeline = this.pipeline;
    if (!device || !pipeline || docs.length === 0) return reference;
    const numDocs = docs.length;
    // Each struct has 5 floats = 20 bytes
    const inputSize = numDocs * 5 * 4; 
    const outputSize = numDocs * 4;

    if (inputSize > device.limits.maxStorageBufferBindingSize || inputSize > device.limits.maxBufferSize ||
        outputSize > device.limits.maxStorageBufferBindingSize || outputSize > device.limits.maxBufferSize) return reference;
    const buffers: GPUBuffer[] = [];
    const allocate = (descriptor: GPUBufferDescriptor) => {
      const buffer = device.createBuffer(descriptor);
      buffers.push(buffer);
      return buffer;
    };
    try {
    const inputBuffer = allocate({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const outputBuffer = allocate({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const stagingBuffer = allocate({
      size: outputSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(inputBuffer, 0, flatData);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0) as GPUBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } }
      ]
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(numDocs / 64));
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputSize);
    device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    if (result.length !== reference.length || result.some((score, row) =>
      !Number.isFinite(score) || Math.abs(score - reference[row]) > 1e-5 + Math.abs(reference[row]) * 1e-5)) {
      throw new Error('BROWSER_RERANK_NUMERICAL_MISMATCH');
    }
    return result;
    } catch {
      if (this.device === device) this.dispose();
      return reference;
    } finally {
      for (const buffer of buffers) buffer.destroy();
    }
  }
}
