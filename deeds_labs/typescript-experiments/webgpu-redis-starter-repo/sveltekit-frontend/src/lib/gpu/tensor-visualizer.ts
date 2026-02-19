// WebGPU Tensor Visualizer with LoD and memory management
export class TensorVisualizer {
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private pipeline: GPURenderPipeline | null = null;
    private bufferCache = new Map<string, GPUBuffer>();
    private lruOrder: string[] = [];
    private maxCacheSize = 50; // Max GPU buffers to keep

    async init(canvas: HTMLCanvasElement) {
        // Check WebGPU support
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('No GPU adapter found');
        }

        this.device = await adapter.requestDevice();
        this.context = canvas.getContext('webgpu');

        if (!this.context) {
            throw new Error('Failed to get WebGPU context');
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format,
            alphaMode: 'premultiplied',
        });

        // Create render pipeline for tensor visualization
        this.pipeline = await this.createRenderPipeline(format);
    }

    private async createRenderPipeline(format: GPUTextureFormat): Promise<GPURenderPipeline> {
        const shaderModule = this.device!.createShaderModule({
            code: `
                struct VertexOutput {
                    @builtin(position) position: vec4f,
                    @location(0) color: vec4f,
                    @location(1) uv: vec2f,
                }

                @group(0) @binding(0) var<storage, read> tensorData: array<f32>;
                @group(0) @binding(1) var<uniform> uniforms: Uniforms;

                struct Uniforms {
                    dimensions: vec3u,
                    time: f32,
                    lod: f32,
                    scale: f32,
                }

                @vertex
                fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                    var output: VertexOutput;

                    // Generate grid positions based on tensor dimensions
                    let x = f32(vertexIndex % uniforms.dimensions.x) / f32(uniforms.dimensions.x);
                    let y = f32(vertexIndex / uniforms.dimensions.x) / f32(uniforms.dimensions.y);

                    // Sample tensor value for height
                    let tensorValue = tensorData[vertexIndex];
                    let height = tensorValue * uniforms.scale;

                    output.position = vec4f(
                        x * 2.0 - 1.0,
                        y * 2.0 - 1.0 + height,
                        0.0,
                        1.0
                    );

                    // Color based on tensor value
                    output.color = vec4f(
                        tensorValue,
                        0.5 - tensorValue * 0.5,
                        1.0 - tensorValue,
                        1.0
                    );

                    output.uv = vec2f(x, y);
                    return output;
                }

                @fragment
                fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
                    // Visualize tensor as color gradient
                    return input.color;
                }
            `
        });

        return this.device!.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vertexMain',
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{
                    format,
                }],
            },
            primitive: {
                topology: 'triangle-strip',
            },
        });
    }

    async uploadTensor(tensorId: string, data: ArrayBuffer, shape: number[]): Promise<GPUBuffer> {
        if (!this.device) throw new Error('Device not initialized');

        // Check cache
        let buffer = this.bufferCache.get(tensorId);
        if (buffer) {
            // Move to front of LRU
            this.updateLRU(tensorId);
            return buffer;
        }

        // Create new buffer
        buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        // Copy data
        new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data));
        buffer.unmap();

        // Add to cache with LRU eviction
        this.addToCache(tensorId, buffer);

        return buffer;
    }

    private addToCache(tensorId: string, buffer: GPUBuffer) {
        // Evict if at capacity
        if (this.bufferCache.size >= this.maxCacheSize) {
            const evictId = this.lruOrder.shift();
            if (evictId) {
                const oldBuffer = this.bufferCache.get(evictId);
                oldBuffer?.destroy();
                this.bufferCache.delete(evictId);
            }
        }

        this.bufferCache.set(tensorId, buffer);
        this.lruOrder.push(tensorId);
    }

    private updateLRU(tensorId: string) {
        const index = this.lruOrder.indexOf(tensorId);
        if (index > -1) {
            this.lruOrder.splice(index, 1);
            this.lruOrder.push(tensorId);
        }
    }

    async renderTensor(tensorId: string, lod: number = 1.0) {
        if (!this.device || !this.context || !this.pipeline) {
            throw new Error('Visualizer not initialized');
        }

        const buffer = this.bufferCache.get(tensorId);
        if (!buffer) {
            throw new Error(`Tensor ${tensorId} not in GPU cache`);
        }

        // Create uniform buffer for render params
        const uniformData = new Float32Array([
            256, 256, 1, // dimensions
            Date.now() / 1000, // time
            lod, // level of detail
            0.5, // scale
        ]);

        const uniformBuffer = this.device.createBuffer({
            size: uniformData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        new Float32Array(uniformBuffer.getMappedRange()).set(uniformData);
        uniformBuffer.unmap();

        // Create bind group
        const bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer } },
                { binding: 1, resource: { buffer: uniformBuffer } },
            ],
        });

        // Render
        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });

        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(256 * 256); // Draw based on tensor dimensions
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);

        // Clean up uniform buffer
        uniformBuffer.destroy();
    }

    evictFromGPU(tensorId: string) {
        const buffer = this.bufferCache.get(tensorId);
        if (buffer) {
            buffer.destroy();
            this.bufferCache.delete(tensorId);
            const index = this.lruOrder.indexOf(tensorId);
            if (index > -1) {
                this.lruOrder.splice(index, 1);
            }
        }
    }

    getMemoryUsage(): { used: number; cached: number } {
        let totalBytes = 0;
        for (const [_, buffer] of this.bufferCache) {
            totalBytes += buffer.size;
        }
        return {
            used: totalBytes,
            cached: this.bufferCache.size,
        };
    }

    destroy() {
        // Clean up all GPU resources
        for (const [_, buffer] of this.bufferCache) {
            buffer.destroy();
        }
        this.bufferCache.clear();
        this.lruOrder = [];
        this.device = null;
        this.context = null;
        this.pipeline = null;
    }
}