/**
 * WebGPU Shader Cache Manager
 * Compiles, caches, and serves WGSL shaders with logging
 * Integrates with centralized cache system
 */

import { browser } from '$app/environment';

export interface ShaderConfig {
	type: 'compute' | 'vertex' | 'fragment';
	entryPoint: string;
	workgroupSize?: [number, number, number];
	bindingLayout?: GPUBindGroupLayoutDescriptor[];
}

export interface CompiledShader {
	id: string;
	wgsl: string;
	type: string;
	shaderModule?: GPUShaderModule;
	pipeline?: GPUComputePipeline | GPURenderPipeline;
	bindGroupLayout?: GPUBindGroupLayout;
	config: ShaderConfig;
	metadata: {
		compiledAt: number;
		lastUsed: number;
		compileTime: number;
		cacheHit: boolean;
		usageCount: number;
		averageExecutionTime: number;
		description?: string;
		tags: string[];
		operation: string;
	};
	embedding?: number[];
}

export interface ShaderSearchQuery {
	text?: string;
	operation?: string;
	shaderType?: 'webgpu' | 'webgl' | 'all';
	tags?: string[];
	sortBy?: 'relevance' | 'performance' | 'usage' | 'recent';
	limit?: number;
}

export interface ShaderSearchResult extends CompiledShader {
	relevanceScore?: number;
	embeddingSimilarity?: number;
}

export interface ShaderStats {
	totalShaders: number;
	memoryCount: number;
	topOperations: Array<{ operation: string; count: number }>;
	averagePerformance: number;
	totalUsage: number;
}

export class ShaderCacheManager {
	private device: GPUDevice | null = null;
	private shaders = new Map<string, CompiledShader>();
	private compileQueue = new Map<string, Promise<CompiledShader>>();
	private readonly SHADER_CACHE_PREFIX = 'webgpu_shader:';
	private readonly EMBEDDING_CACHE_PREFIX = 'shader_embed:';

	/**
	 * Initialize with GPU device
	 */
	async initialize(device: GPUDevice): Promise<void> {
		this.device = device;
		console.log('[ShaderCache] Initialized with GPU device');
	}

	/**
	 * Get or compile a shader
	 */
	async getShader(id: string, wgsl: string, config: ShaderConfig): Promise<CompiledShader> {
		// Check memory cache first
		const cached = this.shaders.get(id);
		if (cached) {
			cached.metadata.lastUsed = Date.now();
			cached.metadata.usageCount++;
			return cached;
		}

		// Check if compilation is in progress
		const pending = this.compileQueue.get(id);
		if (pending) {
			return await pending;
		}

		// Start new compilation
		const compilePromise = this.compileShader(id, wgsl, config);
		this.compileQueue.set(id, compilePromise);

		try {
			const compiled = await compilePromise;
			this.compileQueue.delete(id);
			return compiled;
		} catch (error) {
			this.compileQueue.delete(id);
			throw new Error(`Shader compilation failed: ${error}`);
		}
	}

	/**
	 * Compile a shader
	 */
	private async compileShader(
		id: string,
		wgsl: string,
		config: ShaderConfig
	): Promise<CompiledShader> {
		if (!this.device) {
			throw new Error('GPU device not initialized');
		}

		const startTime = performance.now();
		let cacheHit = false;

		try {
			// Create shader module
			const shaderModule = this.device.createShaderModule({
				code: wgsl,
				label: id
			});

			// Create pipeline based on shader type
			let pipeline: GPUComputePipeline | GPURenderPipeline | undefined;

			if (config.type === 'compute') {
				pipeline = this.device.createComputePipeline({
					layout: 'auto',
					compute: {
						module: shaderModule,
						entryPoint: config.entryPoint
					}
				});
			}

			const compileTime = performance.now() - startTime;

			const compiled: CompiledShader = {
				id,
				wgsl,
				type: config.type,
				shaderModule,
				pipeline,
				config,
				metadata: {
					compiledAt: Date.now(),
					lastUsed: Date.now(),
					compileTime,
					cacheHit,
					usageCount: 1,
					averageExecutionTime: 0,
					tags: [],
					operation: config.entryPoint
				}
			};

			// Store in memory cache
			this.shaders.set(id, compiled);

			return compiled;
		} catch (error) {
			console.error(`[ShaderCache] Compilation failed for ${id}:`, error);
			throw error;
		}
	}

	/**
	 * Get shader statistics
	 */
	async getShaderStats(): Promise<ShaderStats> {
		const operations: Record<string, number> = {};
		let totalUsage = 0;
		let totalPerformance = 0;
		let performanceCount = 0;

		for (const shader of this.shaders.values()) {
			operations[shader.metadata.operation] = (operations[shader.metadata.operation] || 0) + 1;
			totalUsage += shader.metadata.usageCount;

			if (shader.metadata.averageExecutionTime > 0) {
				totalPerformance += shader.metadata.averageExecutionTime;
				performanceCount++;
			}
		}

		const topOperations = Object.entries(operations)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 10)
			.map(([operation, count]) => ({ operation, count }));

		return {
			totalShaders: this.shaders.size,
			memoryCount: this.shaders.size,
			topOperations,
			averagePerformance: performanceCount > 0 ? totalPerformance / performanceCount : 0,
			totalUsage
		};
	}

	/**
	 * Clear shader cache
	 */
	clear(): void {
		this.shaders.clear();
		this.compileQueue.clear();
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		this.shaders.clear();
		this.compileQueue.clear();
		this.device = null;
	}
}

// Singleton instance
export const shaderCacheManager = new ShaderCacheManager();
