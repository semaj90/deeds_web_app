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

export interface DocFeatures {
  trust_tier: number;
  som_cluster: number;
  karpathy_blend: number;
  pagerank: number;
  risk_score: number;
}

const RERANK_SHADER = `
struct DocFeatures {
  trust_tier: f32,
  som_cluster: f32,
  karpathy_blend: f32,
  pagerank: f32,
  risk_score: f32,
};

@group(0) @binding(0) var<storage, read> docs : array<DocFeatures>;
@group(0) @binding(1) var<storage, read_write> scores : array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let i = global_id.x;
    if (i >= arrayLength(&docs)) {
        return;
    }
    
    let d = docs[i];
    // Scoring logic: weighted sum of normalized indicators
    let score = (d.trust_tier * 0.3) + 
                (d.karpathy_blend * 0.5) + 
                ((1.0 - d.risk_score) * 0.2);
                
    scores[i] = score;
}
`;

export class GpuReranker {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;

  async init() {
    if (!navigator.gpu) {
      console.warn('[WebGPU] Not supported on this browser.');
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;

    this.device = await adapter.requestDevice();
    const shaderModule = this.device.createShaderModule({ code: RERANK_SHADER });

    this.pipeline = await this.device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' }
    });

    return true;
  }

  async rerank(docs: DocFeatures[]): Promise<Float32Array> {
    if (!this.device || !this.pipeline) {
      // Fallback to CPU re-ranking
      return new Float32Array(docs.map(d => 
        (d.trust_tier * 0.3) + (d.karpathy_blend * 0.5) + ((1.0 - d.risk_score) * 0.2)
      ));
    }

    const numDocs = docs.length;
    // Each struct has 5 floats = 20 bytes
    const inputSize = numDocs * 5 * 4; 
    const outputSize = numDocs * 4;

    const inputBuffer = this.device.createBuffer({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const outputBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const stagingBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    // Pack data into flat array
    const flatData = new Float32Array(numDocs * 5);
    for (let i = 0; i < numDocs; i++) {
      flatData[i * 5 + 0] = docs[i].trust_tier;
      flatData[i * 5 + 1] = docs[i].som_cluster;
      flatData[i * 5 + 2] = docs[i].karpathy_blend;
      flatData[i * 5 + 3] = docs[i].pagerank;
      flatData[i * 5 + 4] = docs[i].risk_score;
    }

    this.device.queue.writeBuffer(inputBuffer, 0, flatData);

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } }
      ]
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(numDocs / 64));
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputSize);
    this.device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    // Cleanup buffers
    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    return result;
  }
}
