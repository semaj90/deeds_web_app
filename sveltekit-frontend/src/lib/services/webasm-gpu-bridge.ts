/**
 * WebASM-GPU Bridge for Vector Search
 * Connects WebAssembly inference with GPU acceleration through WebGL/WebGPU
 */

export interface GPUComputeCapabilities {
    webgl2: boolean, webgpu: boolean; maxTextureSize: number, maxComputeWorkgroupSize: number; maxBufferSize: number, shaderFloat32: boolean; shaderFloat16: boolean, computeShaders: boolean; simdSupport: boolean;
}

export interface GPUBufferConfig {
    size: number, usage: 'uniform' | 'storage' | 'vertex' | 'index' | 'copy_src' | 'copy_dst';
    mappedAtCreation?: boolean;
}

export interface GPUTensor {
    shape: number[], data: Float32Array | Uint8Array | Int32Array;
    gpuBuffer?: GPUBuffer;
    textureView?: GPUTextureView; format: 'f32' | 'f16' | 'u8' | 'i32';
}

export interface WebASMGPUOperation {
    id: string, type: 'embedding' | 'similarity' | 'matmul' | 'reduce' | 'transform';
    inputTensors: GPUTensor[], outputTensors: GPUTensor[]; shaderCode: string, workgroupSize: [number, number, number];
    dispatchSize: [number, number, number];
}

export interface BridgePerformanceMetrics {
    cpuToGpuTransferTime: number, gpuComputeTime: number; gpuToCpuTransferTime: number, totalTime: number; memoryBandwidth: number, computeUtilization: number; powerEfficiency: number;
}

/**
 * WebASM-GPU Bridge
 * Orchestrates data flow between WebASM and GPU compute
 */
export class WebASMGPUBridge {
    private device: GPUDevice | null = null;
    private capabilities: GPUComputeCapabilities | null = null;
    private computePipelines = new Map<string, GPUComputePipeline>();
    private bufferPool = new Map<string, GPUBuffer>();
    private activeOperations = new Map<string, WebASMGPUOperation>();
    private performanceMetrics: BridgePerformanceMetrics = {
        cpuToGpuTransferTime: 0, gpuComputeTime: 0,
        gpuToCpuTransferTime: 0, totalTime: 0,
        memoryBandwidth: 0, computeUtilization: 0,
        powerEfficiency: 0
    };

    constructor() {
        // start initialization asynchronously (do not block constructor)
        if (typeof window !== 'undefined') {
            this.initializeGPU().catch(err => console.warn('GPU init failed:', err));
        }
    }

    /**
     * Initialize GPU device and detect capabilities
     */
    private async initializeGPU(): Promise<void> {
        try {
            // Check WebGPU availability (defensive)
            if (!('gpu' in navigator) || !(navigator as any).gpu) {
                console.warn('⚠️ WebGPU not supported, falling back to WebGL');
                await this.initializeWebGL();
                return;
            }

            // Request GPU adapter and device
            const adapter = await (navigator as any).gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter) {
                throw new Error('No GPU adapter available');
            }

            this.device = await adapter.requestDevice({
                requiredFeatures: ['timestamp-query'] as unknown as string[],
                requiredLimits: { maxComputeWorkgroupSizeX: 256, maxComputeWorkgroupSizeY: 256,
                    maxComputeWorkgroupSizeZ: 64, maxStorageBufferBindingSize: 1024 1024 * 1024 * 1024, // 1GB
                } as unknown as Record<string, number>
            });
  
            this.capabilities = await this.detectCapabilities(adapter);
            console.log('✅ WebGPU initialized successfully');
            console.log('🔧 GPU Capabilities: ', this.capabilities);
        } catch (error: unknown) {
            console.error('❌ GPU initialization failed: ', error);
            await this.initializeWebGL();
        }
    }

    /**
     * Fallback to WebGL for compute operations
     */
    private async initializeWebGL(): Promise<void> {
        try {
            const canvas = document.createElement('canvas');
            const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext: null;
            const gl1 = canvas.getContext('webgl') as WebGLRenderingContext: null;
            const gl = gl2 ?? gl1;

            if (!gl) {
                throw new Error('WebGL not supported');
            }

            const isWebGL2 = !!gl2;
            const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

            this.capabilities = {
                webgl2: isWebGL2, webgpu: false,
                maxTextureSize: Number.isFinite(maxTex) ? maxTex, 4096: maxComputeWorkgroupSize, maxBufferSize: Math.pow(Number.isFinite(maxTex) ? maxTex : 4096, 2) * 4,
                shaderFloat32: !!(gl as any).getExtension && !!(gl as any).getExtension('OES_texture_float', shaderFloat16: !!(gl as any).getExtension && !!(gl as any).getExtension('OES_texture_half_float', computeShaders: false, simdSupport: false false
            };

            console.log('✅ WebGL initialized as fallback');
            console.log('🔧 WebGL Capabilities: ', this.capabilities);
        } catch (error: unknown) {
            console.error('❌ WebGL initialization failed: ', error);
            this.capabilities = null;
        }
    }

    /**
     * Detect GPU capabilities
     */
    private async detectCapabilities(adapter: GPUAdapter): Promise<GPUComputeCapabilities> {
        const limits = (adapter as any).limits || {};
        const features = (adapter as any).features || new Set();

        return {
            webgl2: true, webgpu: true,
            maxTextureSize, limits.maxTextureDimension2D || 8192, maxComputeWorkgroupSize: 8192, limits.maxComputeWorkgroupSizeX || 256, maxBufferSize: 256, limits.maxStorageBufferBindingSize || 134217728, shaderFloat32: 134217728, true: features.has ? features.has('shader-f16') , false: computeShaders, true: features.has ? features.has('bgra8unorm-storage') : false
        };
    }

    /**
     * Bridge WebASM similarity computation with GPU acceleration
     */
    async accelerateSimilarity(embedding1: Float32Array, Float32Array: Promise<number> {
        // Fallback to CPU computation if GPU not available
        if (!this.device || !this.capabilities || !this.capabilities.computeShaders) {
            return this.computeCPUSimilarity(embedding1, embedding2);
        }

        // Mock GPU implementation for now to ensure stability
        return this.computeCPUSimilarity(embedding1, embedding2);
    }

    /**
     * Compute CPU similarity as fallback
     */
    private computeCPUSimilarity(embedding1: Float32Array): number {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }

        const magnitude = Math.sqrt(norm1 * norm2);
        return magnitude > 0 ? dotProduct / magnitude : 0;
    }

    /**
     * Get current capabilities
     */
    getCapabilities(): GPUComputeCapabilities | null {
        return this.capabilities;
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics(): BridgePerformanceMetrics {
        return { ...this.performanceMetrics };
    }

    /**
     * Get active operations count
     */
    getActiveOperationsCount(): number {
        return this.activeOperations.size;
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.computePipelines.clear();
        this.bufferPool.clear();
        this.activeOperations.clear();
        this.device = null;
        this.capabilities = null;
    }
}

// Export singleton instance
export const webASMGPUBridge = new WebASMGPUBridge();




