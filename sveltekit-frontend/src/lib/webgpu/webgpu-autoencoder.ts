import type { MultiDimArray } from '$lib/workers/gpu-tensor-worker';

export interface AutoencoderConfig {
  inputDim: number;
  hiddenDim: number;
  workgroupSize: number;
}

/**
 * WebGPU Autoencoder — client-side latent projection.
 * Implements: tanh(input @ W^T + b)
 * 
 * Optimized for 768 -> [2, 3, 4] dimension reduction for 
 * real-time topological mapping in the browser.
 */
export class WebGPUAutoencoder {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private config: AutoencoderConfig;

  constructor(config: Partial<AutoencoderConfig> = {}) {
    this.config = {
      inputDim: 768,
      hiddenDim: 4,
      workgroupSize: 64,
      ...config
    };
  }

  async initialize(): Promise<boolean> {
    if (!navigator.gpu) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      this.device = await adapter.requestDevice();

      this.bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // input
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // W
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // b
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // output
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // params
        ]
      });

      const shaderModule = this.device.createShaderModule({ code: this.getShader() });
      this.pipeline = this.device.createComputePipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
        compute: { module: shaderModule, entryPoint: 'encode' }
      });

      return true;
    } catch (err) {
      console.error('[WebGPUAutoencoder] Init failed:', err);
      return false;
    }
  }

  async encode(
    inputData: Float32Array,
    weights: Float32Array,
    bias: Float32Array,
    n: number
  ): Promise<Float32Array> {
    if (!this.device || !this.pipeline || !this.bindGroupLayout) throw new Error('Not initialized');

    const { inputDim, hiddenDim } = this.config;
    
    // 1. Create buffers
    const inputBuffer = this.device.createBuffer({
      size: inputData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(inputBuffer.getMappedRange()).set(inputData);
    inputBuffer.unmap();

    const weightBuffer = this.device.createBuffer({
      size: weights.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(weightBuffer.getMappedRange()).set(weights);
    weightBuffer.unmap();

    const biasBuffer = this.device.createBuffer({
      size: bias.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(biasBuffer.getMappedRange()).set(bias);
    biasBuffer.unmap();

    const outputBytes = n * hiddenDim * 4;
    const outputBuffer = this.device.createBuffer({
      size: outputBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const paramsBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Uint32Array(paramsBuffer.getMappedRange()).set([n, inputDim, hiddenDim]);
    paramsBuffer.unmap();

    const stagingBuffer = this.device.createBuffer({
      size: outputBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    // 2. Bind and dispatch
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: weightBuffer } },
        { binding: 2, resource: { buffer: biasBuffer } },
        { binding: 3, resource: { buffer: outputBuffer } },
        { binding: 4, resource: { buffer: paramsBuffer } },
      ]
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(n / this.config.workgroupSize));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputBytes);
    this.device.queue.submit([encoder.finish()]);

    // 3. Read back
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    // 4. Cleanup
    inputBuffer.destroy();
    weightBuffer.destroy();
    biasBuffer.destroy();
    outputBuffer.destroy();
    paramsBuffer.destroy();
    stagingBuffer.destroy();

    return result;
  }

  private getShader(): string {
    return `
      struct Params {
        n: u32,
        dim: u32,
        hidden: u32,
      }

      @group(0) @binding(0) var<storage, read> input_data: array<f32>;
      @group(0) @binding(1) var<storage, read> W: array<f32>;
      @group(0) @binding(2) var<storage, read> b: array<f32>;
      @group(0) @binding(3) var<storage, read_write> output_data: array<f32>;
      @group(0) @binding(4) var<uniform> params: Params;

      @compute @workgroup_size(${this.config.workgroupSize})
      fn encode(@builtin(global_invocation_id) gid: vec3u) {
        let row = gid.x;
        if (row >= params.n) { return; }
        
        for (var col: u32 = 0u; col < params.hidden; col = col + 1u) {
          var sum: f32 = 0.0;
          for (var k: u32 = 0u; k < params.dim; k = k + 1u) {
            sum = sum + input_data[row * params.dim + k] * W[col * params.dim + k];
          }
          output_data[row * params.hidden + col] = tanh(sum + b[col]);
        }
      }
    `;
  }
}
