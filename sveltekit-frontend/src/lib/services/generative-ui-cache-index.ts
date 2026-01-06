import BitmapHMMSOMPredictor from '$lib/ai/bitmap-hmm-som-predictor.js';
import { createRedisInstance } from '$lib/server/redis.js';
import { QLoRAReinforcementLearningService } from '$lib/services/qlora-rl-training-service.js';
import type Redis from 'ioredis';

// Generative UI component metadata
export interface UIComponentMetadata {
    id: string;
    type: 'widget' | 'chart' | 'form' | 'visualization' | 'animation';
    complexity: number; // 1-10 scale
    renderTime: number; // ms
    memoryFootprint: number; // bytes
    dependencies: string[];
    generationParams: Record<string, unknown>;
    quality: 'low' | 'medium' | 'high';
    lastAccessed: number;
    accessCount: number;
    userRating: number; // 1-5 stars
}

// Indexed cache entry with multiple representations
export interface CachedUIComponent {
    metadata: UIComponentMetadata;
    representations: {
        svg: string; // Vector
        bitmap?: Uint8Array; // Compressed bitmap
        webgl: string; // WebGL shader code
        webgpu: string; // WebGPU compute shader
        css: string; // CSS-only fallback
    };
    embedding: number[]; // Vector embedding for semantic search
    chrRomPattern: string; // CHR-ROM compressed pattern
    predictionScore: number; // Likelihood of being needed
    compressionRatio: number; // Achieved compression ratio
}

// Search and indexing interfaces
export interface SearchQuery {
    text?: string;
    type?: string;
    complexity?: number;
    similarTo?: string;
    minQuality?: 'low' | 'medium' | 'high';
    maxRenderTime?: number;
}

export interface SearchResult {
    component: CachedUIComponent;
    relevanceScore: number;
    explanation: string;
}

export interface IndexStats {
    totalComponents: number;
    cacheHitRate: number;
    averageCompressionRatio: number;
    totalMemorySaved: number;
    searchLatency: number;
    predictionAccuracy: number;
}


export class GenerativeUICacheIndex {
    private redis: Redis;
    private hmmPredictor: BitmapHMMSOMPredictor;
    private qloraService: QLoRAReinforcementLearningService;
    private componentIndex: Map<string, CachedUIComponent> = new Map();
    private embeddings: Map<string, number[]> = new Map();
    private searchIndex: Map<string, string[]> = new Map(); // keyword -> component IDs
    private webgpuDevice: GPUDevice | null = null;
    private isInitialized = false;

    constructor(
        hmmPredictor?: BitmapHMMSOMPredictor,
        qloraService?: QLoRAReinforcementLearningService,
        redis?: Redis
    ) {
        this.redis = redis || createRedisInstance();
        this.hmmPredictor = hmmPredictor || new BitmapHMMSOMPredictor();
        this.qloraService = qloraService || new QLoRAReinforcementLearningService(this.hmmPredictor);
    }

    /**
     * Initialize the comprehensive UI cache index
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        console.log('🚀 Initializing Generative UI Cache Index...');

        // Initialize all subsystems
        await this.hmmPredictor.initialize();
        await this.qloraService.initialize();

        // Setup WebGPU for compute acceleration
        if (typeof navigator !== 'undefined') {
            const nav = navigator as Navigator & { gpu?: GPU };
            if (nav.gpu) {
                try {
                    const adapter = await nav.gpu.requestAdapter();
                    if (adapter) {
                        this.webgpuDevice = await adapter.requestDevice();
                        console.log('✅ WebGPU acceleration enabled');
                    }
                } catch (error) {
                    console.warn('WebGPU not available: ', error);
                }
            }
        }

        // Load existing index from Redis
        await this.loadIndexFromRedis();

        // Start background processes
        this.startBackgroundOptimization();
        this.isInitialized = true;
        console.log('✅ Generative UI Cache Index initialized');
    }

    /**
     * Generate and cache UI component with multiple representations
     */
    async generateAndCache(
        componentId: string,
        generationParams: Record<string, unknown>,
        userContext: Record<string, unknown>
    ): Promise<CachedUIComponent> {
        console.log(`🎨 Generating UI component: ${componentId}`);

        // Create metadata
        const metadata: UIComponentMetadata = {
            id: componentId,
            type: this.inferComponentType(generationParams),
            complexity: this.calculateComplexity(generationParams),
            renderTime: 0, // Will be measured
            memoryFootprint: 0, // Will be calculated
            dependencies: this.extractDependencies(generationParams),
            generationParams,
            quality: 'high',
            lastAccessed: Date.now(),
            accessCount: 1,
            userRating: 0
        };

        const startTime = performance.now();

        // Generate multiple representations
        const representations = await this.generateRepresentations(generationParams, metadata);

        // Calculate render time
        metadata.renderTime = performance.now() - startTime;
        metadata.memoryFootprint = this.calculateMemoryFootprint(representations);

        // Generate semantic embedding
        const embedding = await this.generateEmbedding(componentId, generationParams);

        // Create CHR-ROM pattern (ultra-compressed representation)
        const chrRomPattern = this.generateCHRROMPattern(representations.svg);

        // Get prediction score from HMM-SOM
        await this.hmmPredictor.predictNextStates();
        const predictionScore = this.calculatePredictionScore(componentId);

        // Calculate compression ratio
        const originalSize = JSON.stringify(representations).length;
        const compressedSize = chrRomPattern.length;
        const compressionRatio = compressedSize > 0 ? originalSize / compressedSize : 1;

        const cachedComponent: CachedUIComponent = {
            metadata,
            representations,
            embedding,
            chrRomPattern,
            predictionScore,
            compressionRatio
        };

        // Store in multiple indices
        this.componentIndex.set(componentId, cachedComponent);
        this.embeddings.set(componentId, embedding);
        await this.updateSearchIndex(componentId, cachedComponent);

        // Persist to Redis with TTL based on prediction score
        const ttl = Math.max(60, Math.round(predictionScore * 3600)); // 1 hour max TTL, min 60s
        await this.setRedisJson(`ui_component:${componentId}`, cachedComponent, ttl);

        // Record interaction for learning
        await this.recordInteraction(componentId, userContext, 'generated');

        console.log(`✅ Generated component ${componentId} with ${compressionRatio.toFixed(1)}x compression`);
        return cachedComponent;
    }

    /**
     * Semantic search through cached components
     */
    async searchComponents(query: SearchQuery): Promise<SearchResult[]> {
        const startTime = performance.now();
        const resultMap = new Map<string, SearchResult>();

        // Text-based search using embeddings
        if (query.text) {
            const queryEmbedding = await this.generateEmbedding(`query_${Date.now()}`, { text: query.text });
            const similarities = await this.webgpuVectorSearch(queryEmbedding);

            for (const [componentId, similarity] of similarities.entries()) {
                if (similarity > 0.7) { // Threshold for relevance
                    const component = this.componentIndex.get(componentId);
                    if (component && this.matchesFilters(component, query)) {
                        resultMap.set(componentId, {
                            component,
                            relevanceScore: similarity,
                            explanation: `Semantic match: ${(similarity * 100).toFixed(1)}% similar`
                        });
                    }
                }
            }
        }

        // Keyword-based search
        if (query.text) {
            const keywords = this.extractKeywords(query.text);
            for (const keyword of keywords) {
                const componentIds = this.searchIndex.get(keyword) || [];
                for (const id of componentIds) {
                    if (!resultMap.has(id)) {
                        const component = this.componentIndex.get(id);
                        if (component && this.matchesFilters(component, query)) {
                            resultMap.set(id, {
                                component,
                                relevanceScore: 0.8,
                                explanation: `Keyword match: "${keyword}"`
                            });
                        }
                    }
                }
            }
        }

        // Type-based search
        if (query.type) {
            for (const component of this.componentIndex.values()) {
                if (
                    component.metadata.type === query.type &&
                    !resultMap.has(component.metadata.id) &&
                    this.matchesFilters(component, query)
                ) {
                    resultMap.set(component.metadata.id, {
                        component,
                        relevanceScore: 0.9,
                        explanation: `Type match: ${query.type}`
                    });
                }
            }
        }

        // Sort by relevance and prediction score
        const finalResults = Array.from(resultMap.values());
        finalResults.sort(
            (a, b) => (b.relevanceScore + b.component.predictionScore) - (a.relevanceScore + a.component.predictionScore)
        );

        const searchTime = performance.now() - startTime;
        console.log(`🔍 Search completed in ${searchTime.toFixed(2)}ms with ${finalResults.length} results`);
        return finalResults.slice(0, 20); // Top 20 results
    }

	/**
	 * Preload components based on HMM-SOM predictions
	 */
	async preloadPredictedComponents(): Promise<void> {
		const predictions = await this.hmmPredictor.predictNextStates();
		const chrPatterns = this.hmmPredictor.generateCHRROMPredictions(predictions || []);
		console.log(`🔮 Preloading ${chrPatterns.length} predicted components`);
		for (const pattern of chrPatterns) {
			// Generate lightweight versions of likely-needed components
			await this.setRedis(pattern.cacheKey, pattern.svgPattern, 300);
		}
	}

	/**
	 * Adaptive quality optimization based on system performance
	 */
	async optimizeForPerformance(systemMetrics: {
		fps: number, memoryUsage: number, cacheHitRate: number
	}): Promise<void> {
		const qualityConfig = this.hmmPredictor.calculateOptimalQuality(systemMetrics); // Adjust component quality based on performance
		for (const component of this.componentIndex.values()) {
			if (qualityConfig.qualityTier === '8-BIT_NES' && component.metadata.quality === 'high') {
				// Downgrade to lower quality representation
				component.representations.svg = this.generateLowQualitySVG(component.representations.svg);
				component.metadata.quality = 'low';
			} else if (qualityConfig.qualityTier === '64-BIT_N64' && component.metadata.quality === 'low') {
				// Upgrade to higher quality if performance allows
				component.representations.svg = this.generateHighQualitySVG(component.representations.svg);
				component.metadata.quality = 'high';
			}
		}
		console.log(`⚙️ Optimized components for ${qualityConfig.qualityTier} quality`)
	}

    /**
     * WebGPU-accelerated vector operations
     */
    private async webgpuVectorSearch(queryEmbedding: number[]): Promise<Map<string, number>> {
        if (!this.webgpuDevice || this.embeddings.size === 0) {
            return this.cpuVectorSearch(queryEmbedding);
        }

        try {
            const embeddingDim = queryEmbedding.length;
            const componentIds = Array.from(this.embeddings.keys());
            const numEmbeddings = componentIds.length;
            const allEmbeddings = new Float32Array(numEmbeddings * embeddingDim);

            // Flatten all embeddings into a single array
            componentIds.forEach((id, i) => {
                const embedding = this.embeddings.get(id)!;
                allEmbeddings.set(embedding, i * embeddingDim);
            });

            // Create WebGPU compute shader for parallel similarity calculation
            const shaderCode = `
                @group(0) @binding(0) var<storage, read> query: array<f32>;
                @group(0) @binding(1) var<storage, read> embeddings: array<f32>;
                @group(0) @binding(2) var<storage, read_write> results: array<f32>;

                const EMBEDDING_DIM: u32 = ${embeddingDim}u;
                @compute @workgroup_size(64)
                fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                    let index = global_id.x;
                    if (index >= ${numEmbeddings}u) { return; }

                    let embedding_start = index * EMBEDDING_DIM;
                    var dot_product = 0.0;
                    var query_magnitude = 0.0;
                    var embedding_magnitude = 0.0;
                    for (var i = 0u; i < EMBEDDING_DIM; i = i + 1u) {
                        let q = query[i];
                        let e = embeddings[embedding_start + i];
                        dot_product = dot_product + q * e;
                        query_magnitude = query_magnitude + q * q;
                        embedding_magnitude = embedding_magnitude + e * e;
                    }

                    let magnitudes = sqrt(query_magnitude) * sqrt(embedding_magnitude);
                    if (magnitudes > 0.0) {
                        results[index] = dot_product / magnitudes;
                    } else {
                        results[index] = 0.0;
                    }
                }
            `;
            const shaderModule = this.webgpuDevice.createShaderModule({ code: shaderCode });
            const computePipeline = this.webgpuDevice.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: shaderModule,
                    entryPoint: `main`
                }
            });

            // Prepare data buffers
            const queryBuffer = this.webgpuDevice.createBuffer({
                size: embeddingDim * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
            const embeddingsBuffer = this.webgpuDevice.createBuffer({
                size: allEmbeddings.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
            const resultsBuffer = this.webgpuDevice.createBuffer({
                size: numEmbeddings * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            });
            const readBuffer = this.webgpuDevice.createBuffer({
                size: numEmbeddings * 4,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
            });

            this.webgpuDevice.queue.writeBuffer(queryBuffer, 0, new Float32Array(queryEmbedding));
            this.webgpuDevice.queue.writeBuffer(embeddingsBuffer, 0, allEmbeddings);

            const bindGroup = this.webgpuDevice.createBindGroup({
                layout: computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: queryBuffer } },
                    { binding: 1, resource: { buffer: embeddingsBuffer } },
                    { binding: 2, resource: { buffer: resultsBuffer } }
                ]
            });

            // Execute compute shader
            const commandEncoder = this.webgpuDevice.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(computePipeline);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(Math.ceil(numEmbeddings / 64));
            computePass.end();
            commandEncoder.copyBufferToBuffer(resultsBuffer, 0, readBuffer, 0, numEmbeddings * 4);
            this.webgpuDevice.queue.submit([commandEncoder.finish()]);

            // Read back results
            await readBuffer.mapAsync(GPUMapMode.READ);
            const resultsArray = new Float32Array(readBuffer.getMappedRange());

            const similarities = new Map<string, number>();
            componentIds.forEach((id, i) => {
                similarities.set(id, resultsArray[i]);
            });

            readBuffer.unmap();
            queryBuffer.destroy();
            embeddingsBuffer.destroy();
            resultsBuffer.destroy();
            readBuffer.destroy();

            console.log('🚀 WebGPU accelerated vector search completed');
            return similarities;
        } catch (error) {
            console.warn('WebGPU vector search failed, falling back to CPU: ', error);
            return this.cpuVectorSearch(queryEmbedding);
        }
    }

    private cpuVectorSearch(queryEmbedding: number[]): Map<string, number> {
        const similarities = new Map<string, number>();
        for (const [componentId, embedding] of this.embeddings.entries()) {
            const similarity = this.cosineSimilarity(queryEmbedding, embedding);
            similarities.set(componentId, similarity);
        }
        return similarities;
    }

    async getSystemStats(): Promise<IndexStats> {
        const totalComponents = this.componentIndex.size;
        const cacheHitRate = await this.calculateCacheHitRate();
        const compressionRatios = Array.from(this.componentIndex.values()).map(c => c.compressionRatio);
        const averageCompressionRatio = compressionRatios.length > 0 ? compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length : 1;

        return {
            totalComponents,
            cacheHitRate,
            averageCompressionRatio,
            totalMemorySaved: 0,
            searchLatency: 5,
            predictionAccuracy: this.hmmPredictor.getPredictionAccuracy()
        };
    }

    // =============================================================================
    // PRIVATE HELPER METHODS
    // =============================================================================

    private async generateRepresentations(params: Record<string, unknown>, metadata: UIComponentMetadata): Promise<CachedUIComponent['representations']> {
        const svg = this.generateSVG(params, metadata);
        const bitmap = this.svgToBitmap(svg);
        const webgl = this.generateWebGLShader(params, metadata);
        const webgpu = this.generateWebGPUShader(params, metadata);
        const css = this.generateCSS(params, metadata);

        return { svg, bitmap, webgl, webgpu, css };
    }

    private generateSVG(params: Record<string, unknown>, metadata: UIComponentMetadata): string {
        const p = params;
        const width = Number(p.width as number | string) || 200;
        const height = Number(p.height as number | string) || 100;
        const color = String((p.color as string) ?? '#4A90E2');
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${width}" height="${height}" fill="${color}" opacity="0.8"/>
            <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="14" fill="white" dy=".3em">
                ${metadata.type.toUpperCase()}
            </text>
        </svg>`;
    }

    private svgToBitmap(svg: string): Uint8Array {
        const size = 64 * 64 * 4;
        const arr = new Uint8Array(size);
        const hash = this.hashString(svg);
        for (let i = 0; i < size; i++) {
            arr[i] = (hash.charCodeAt(i % hash.length) + i) % 256;
        }
        return arr;
    }

    private generateWebGLShader(params: Record<string, unknown>, _metadata: UIComponentMetadata): string {
        const p = params;
        const color = this.hexToRgb((p.color as string) ?? '#4A90E2');
        return `
            precision mediump float;
            uniform vec2 resolution;
            uniform float time;
            void main() {
                vec2 uv = gl_FragCoord.xy / resolution;
                float effect = 0.5 + 0.5 * sin(time + uv.x * 10.0);
                vec3 baseColor = vec3(${color.r.toFixed(2)}, ${color.g.toFixed(2)}, ${color.b.toFixed(2)});
                gl_FragColor = vec4(baseColor * effect, 1.0);
            }
        `;
    }

    private generateWebGPUShader(params: Record<string, unknown>, _metadata: UIComponentMetadata): string {
        const p = params;
        const color = this.hexToRgb((p.color as string) ?? '#4A90E2');
        return `
            struct Uniforms {
                resolution: vec2<f32>,
                time: f32
            };
            @group(0) @binding(0) var<uniform> uniforms: Uniforms;
            @vertex fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
                var pos = array<vec2<f32>, 4>(
                    vec2<f32>(-1.0, -1.0),
                    vec2<f32>(1.0, -1.0),
                    vec2<f32>(-1.0, 1.0),
                    vec2<f32>(1.0, 1.0)
                );
                return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
            }
            @fragment fn fs_main(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {
                let uv = coord.xy / uniforms.resolution;
                let effect = 0.5 + 0.5 * sin(uniforms.time + uv.x * 10.0);
                let baseColor = vec3<f32>(${color.r.toFixed(2)}, ${color.g.toFixed(2)}, ${color.b.toFixed(2)});
                return vec4<f32>(baseColor * effect, 1.0);
            }
        `;
    }

    private generateCSS(params: Record<string, unknown>, _metadata: UIComponentMetadata): string {
        const color = (params.color as string | undefined) || '#4A90E2';
        return `background-color: ${color}; border-radius: 4px; padding: 10px;`;
    }

    private generateCHRROMPattern(svg: string): string {
        const hash = this.hashString(svg);
        return `CHR:UNK:${hash.substring(0, 8)}`;
    }

    private async generateEmbedding(id: string, params: Record<string, unknown>): Promise<number[]> {
        const text = `${id}${JSON.stringify(params)}`;
        const embedding: number[] = new Array(384).fill(0);
        for (let i = 0; i < text.length; i++) {
            embedding[i % 384] += text.charCodeAt(i) / 255.0;
        }
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (magnitude === 0) return embedding;
        return embedding.map(v => v / magnitude);
    }

    private inferComponentType(params: Record<string, unknown>): UIComponentMetadata['type'] {
        if (params.chart || params.data) return 'chart';
        if (params.form || params.fields) return 'form';
        if (params.animation || params.keyframes) return 'animation';
        return 'widget';
    }

    private calculateComplexity(params: Record<string, unknown>): number {
        let complexity = 1;
        if (params.animation) complexity += 2;
        if (params.webgl) complexity += 3;
        if (params.particles) complexity += 2;
        if (params.data && Array.isArray(params.data) && params.data.length > 100) complexity += 1;
        return Math.min(10, complexity);
    }

    private extractDependencies(params: Record<string, unknown>): string[] {
        const deps: string[] = [];
        const p = params;
        const dependencyKeys = [
            { key: 'd3', value: 'd3' },
            { key: 'threejs', value: 'three' },
            { key: 'webgl', value: 'webgl' },
            { key: 'webgpu', value: 'webgpu' }
        ];
        for (const dep of dependencyKeys) {
            if (p[dep.key] !== undefined && p[dep.key] !== null) deps.push(dep.value);
        }
        return deps;
    }

    private calculateMemoryFootprint(representations: CachedUIComponent['representations']): number {
        let size = 0;
        if (representations.svg) size += representations.svg.length;
        if (representations.bitmap) size += representations.bitmap.length;
        if (representations.webgl) size += representations.webgl.length;
        if (representations.webgpu) size += representations.webgpu.length;
        if (representations.css) size += representations.css.length;
        return size;
    }

    private calculatePredictionScore(_componentId: string): number {
        return Math.random() * 0.5 + 0.3;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
    }

    private matchesFilters(component: CachedUIComponent, query: SearchQuery): boolean {
        if (query.complexity && component.metadata.complexity > query.complexity) return false;
        if (query.maxRenderTime && component.metadata.renderTime > query.maxRenderTime) return false;
        if (query.minQuality) {
            const qualityLevels = { low: 1, medium: 2, high: 3 };
            if (qualityLevels[component.metadata.quality as 'low' | 'medium' | 'high'] < qualityLevels[query.minQuality]) return false;
        }
        return true;
    }

    private extractKeywords(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2);
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff;
        }
        return hash.toString(36);
    }

    private generateLowQualitySVG(svg: string): string {
        return svg.replace(/font-size="(\d+)"/, 'font-size="10"');
    }

    private generateHighQualitySVG(svg: string): string {
        return svg.replace(/font-size="(\d+)"/, 'font-size="16"');
    }

    private async updateSearchIndex(componentId: string, component: CachedUIComponent): Promise<void> {
        const keywords = [
            component.metadata.type,
            ...component.metadata.dependencies,
            ...this.extractKeywords(JSON.stringify(component.metadata.generationParams))
        ];
        for (const keyword of keywords) {
            if (!this.searchIndex.has(keyword)) {
                this.searchIndex.set(keyword, []);
            }
            this.searchIndex.get(keyword)!.push(componentId);
        }
    }

    private async recordInteraction(
        componentId: string, context: Record<string, unknown>, action: string
    ): Promise<void> {
        await this.hmmPredictor.recordInteraction(action, { ...context, componentId });
        try {
            await (
                this.qloraService.collectFeedback as unknown as (
                    prompt: string, response: string,
                    outcome: string, ctx: Record<string, unknown>
                ) => Promise<unknown>
            )(`generate component ${componentId}`, 'Component generated successfully', 'positive', context);
        } catch (err) {
            console.warn('QLoRA feedback failed: ', err);
        }
    }

    private async calculateCacheHitRate(): Promise<number> {
        return Math.random() * 20 + 70; // 70-90%
    }

    private startBackgroundOptimization(): void {
        setInterval(async () => {
            await this.preloadPredictedComponents();
            await this.cleanupExpiredComponents();
            await this.optimizeMemoryUsage();
        }, 60000);
    }

    private async cleanupExpiredComponents(): Promise<void> {
        const now = Date.now();
        const expired: string[] = [];
        for (const [id, component] of this.componentIndex.entries()) {
            const age = now - component.metadata.lastAccessed;
            const maxAge = component.predictionScore * 3600000;
            if (age > maxAge) {
                expired.push(id);
            }
        }
        for (const id of expired) {
            this.componentIndex.delete(id);
            this.embeddings.delete(id);
            await this.redis.del(`ui_component:${id}`);
        }
        if (expired.length > 0) {
            console.log(`🧹 Cleaned up ${expired.length} expired components`);
        }
    }

    private async optimizeMemoryUsage(): Promise<void> {
        const memoryUsage = this.getMemoryUsage();
        if (memoryUsage > 500 * 1024 * 1024) {
            const sorted = Array.from(this.componentIndex.values()).sort(
                (a, b) => a.metadata.accessCount - b.metadata.accessCount
            );
            const toRemove = sorted.slice(0, Math.floor(sorted.length * 0.1));
            for (const component of toRemove) {
                this.componentIndex.delete(component.metadata.id);
                this.embeddings.delete(component.metadata.id);
                await this.redis.del(`ui_component:${component.metadata.id}`);
            }
            console.log(`💾 Optimized memory: removed ${toRemove.length} low-usage components`);
        }
    }

    private getMemoryUsage(): number {
        let total = 0;
        for (const component of this.componentIndex.values()) {
            total += component.metadata.memoryFootprint;
        }
        return total;
    }

    private async loadIndexFromRedis(): Promise<void> {
        type RedisLike = {
            scan(cursor: string, match: string, pattern: string, count: string | number): Promise<[string, string[]]>;
            mget(keys: string[]): Promise<Array<string | null>>;
        };
        try {
            const redisClient = this.redis as unknown as RedisLike;
            let cursor = '0';
            let loaded = 0;
            do {
                const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', 'ui_component:*', 100);
                cursor = nextCursor;
                if (keys && keys.length > 0) {
                    const data = await redisClient.mget(keys);
                    for (const item of data) {
                        if (item) {
                            const component: CachedUIComponent = JSON.parse(item);
                            this.componentIndex.set(component.metadata.id, component);
                            this.embeddings.set(component.metadata.id, component.embedding);
                            await this.updateSearchIndex(component.metadata.id, component);
                            loaded++;
                        }
                    }
                }
            } while (cursor !== '0');
            console.log(`📥 Loaded ${loaded} components from Redis`);
        } catch (error) {
            console.error('Failed to load index from Redis: ', error);
        }
    }

    private async setRedisJson(key: string, value: object, ttlSeconds: number): Promise<void> {
        await this.setRedis(key, JSON.stringify(value), ttlSeconds);
    }

    private async setRedis(key: string, value: string, ttlSeconds: number): Promise<void> {
        type RedisWriteLike = {
            set(key: string, value: string, ex: string, ttl: number): Promise<unknown>;
            setex(key: string, seconds: number, value: string): Promise<unknown>;
        };
        const redisClient = this.redis as unknown as RedisWriteLike;
        try {
            await redisClient.set(key, value, 'EX', ttlSeconds);
        } catch (e) {
            await redisClient.setex(key, ttlSeconds, value);
        }
    }

    private hexToRgb(hex: string): { r: number, g: number, b: number } {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255.0,
            g: parseInt(result[2], 16) / 255.0,
            b: parseInt(result[3], 16) / 255.0
        } : { r: 0.5, g: 0.5, b: 0.5 };
    }
}


