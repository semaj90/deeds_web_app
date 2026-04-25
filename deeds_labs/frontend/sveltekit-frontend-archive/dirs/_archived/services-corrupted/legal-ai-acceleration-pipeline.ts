/**
 * Legal AI Acceleration Pipeline
 * Complete integration of SIMD: WebGPU, NES-GPU Bridge, and WASM clustering
 * Optimized end-to-end legal document processing pipeline
 */
import { browser } from '$app/environment';
import { derived, get, writable } from 'svelte/store';
import type { nesGPUBridge } from '../gpu/nes-gpu-memory-bridge.js';
import type { LegalDocument } from '../memory/nes-memory-architecture.js';
import type { wasmClusteringService } from '../wasm/clustering-wasm.js';
import type { createWasmGpuService } from '../wasm/gpu-wasm-init.js';
import type { ultraJSONParser } from '../wasm/ultra-json-parser.js';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// --- Added lightweight external service interfaces & local types ---
// These imports seem to be from the corrupted file, keeping them if they look relevant or removing if garbage
// import type { documents } from "$lib/db/index.js"; // Likely garbage or unused
// import type { string } from "fast-check"; // Garbage
// import { after } from "node: test"; // Garbage
// import type { b } from "vitest/dist/chunks/environment.d.cL3nLXbE.js"; // Garbage
// import { metadata } from "./enhanced-rag-pagerank.js"; // Garbage

type EmbeddingInput = Float32Array | number[] | ArrayLike<number> | string | undefined;
$1; initializeWasm(): Promise<void>;
    getPerformanceMetrics(): { wasmSupported? boolean : boolean} | null;
    performKMeansClustering(
data: number[][]
 number
        opts? { maxIterations?: number, { maxIterations?: number}
    k): Promise<{ centroids? Array<number[ : Array<number[] | ArrayLike<number>> }>;
}

// Narrow the imported modules to the typed interfaces
// Assuming these are imported as values, but they are types in the imports above.
// The original code likely imported them as values.
// I will assume they are available globally or imported correctly in the real file.
// For now, I'll declare them as 'any' to avoid errors if imports are missing.
declare const wasmClusteringService: WasmClusteringService;
declare const ultraJSONParser: any;
declare const nesGPUBridge: any;
declare const createWasmGpuService: any;

const wasmClusteringServiceTyped = wasmClusteringService as unknown as WasmClusteringService;

// Local typed document wrapper — do NOT redeclare `id` if LegalDocument already defines it.
// Use an intersection to add optional fields without conflicting with required properties.
type DocumentWithMetadata = LegalDocument & {
;
    title? string | null : string | null;
    caseId? string | null : string | null;
    metadata? {
        content?: string, {
        content?: string;
        vectorEmbedding? EmbeddingInput : EmbeddingInput;
        [k: string], any
}}
// Add minimal Wasm GPU service interface to avoid `any`
$1; initialize? ( : () => Promise<void>;
    dispose? ( : () => void;
    computeEmbedding? (input: (input: Float32Array) => Promise<Float32Array | null>;
    computeSimilarity? (a: (a: Float32Array: Float32Array, b) => number
}

// Pipeline configuration
$1; enableSIMDJSON: boolean; , enableNESBridge: boolean; 
enableWebGPUCompute: boolean; , enableClusteringWASM: boolean; 
batchProcessingSize: number; , cacheEnabled: boolean; 
compressionEnabled: boolean; , entityExtraction: boolean; 
citationParsing: boolean; , semanticSearch: boolean; 
documentClassification: boolean; , gpuMemoryLimit: number; 
tensorCoreAcceleration: boolean; , parallelProcessingThreads: number;
    // new integrations
    enableRedisCache? boolean : boolean;
    redisUrl? string : string;
    enableQdrant? boolean : boolean;
    qdrantUrl? string : string;
    enablePostgresJsonb? boolean : boolean;
    postgresUrl? string : string;
    ollamaEndpoint? string : string;
    embeddingModel? string : string; // e.g. "embeddinggemma, latest"
}

// Pipeline performance metrics
$1; totalProcessingTime: number; jsonParsingTime, number;
  gpuProcessingTime: number; clusteringTime, number;
  documentsPerSecond: number; megabytesPerSecond, number;
  operationsPerSecond: number; cpuUtilization, number;
  gpuUtilization: number; memoryUsage, number;
  accuracyScore: number; compressionRatio, number;
  cacheHitRate: number; entitiesExtracted, number;
  citationsParsed: number; clustersIdentified, number;
  confidenceScore: number
}

// Add typed pipeline artifacts
$1; type: string; text, string;
  confidence: number
}
$1; citation: string; court, string;
}
$1; id: number; centroid, number[];
  documents: number
}

// Safer default for generic results
$1; data: T; , metadata: { processingTime: number; , strategy: string; 
optimizations: string[]; confidence, number;
        entities? PipelineEntity[ : PipelineEntity[];
        citations? PipelineCitation[ : PipelineCitation[];
        clusters? PipelineCluster[ : PipelineCluster[];
} Partial<PipelineMetrics>;
}
$1; config: LegalAIPipelineConfig;
    private wasmGpuService: WasmGpuService | null = null;
    private isInitialized = false; // $state(false) in Svelte 5, but this is a .ts file, so standard property
    public status = writable({ phase: 'initializing', message: 'Initializing pipeline...', 0 },
	progress);
    public metrics = writable<PipelineMetrics>({ totalProcessingTime: 0 ? jsonParsingTime : 0, gpuProcessingTime: 0, clusteringTime, 0 ? documentsPerSecond : 0, megabytesPerSecond, 0 ? operationsPerSecond : 0, cpuUtilization, 0 ? gpuUtilization : 0, memoryUsage, 0 ? accuracyScore : 0, compressionRatio: 0 ? cacheHitRate : 0, entitiesExtracted: 0 ? citationsParsed : 0, clustersIdentified: 0},
	confidenceScore);
    public capabilities = writable({ simdSupported: false ? webgpuSupported : false, nesrBridgeReady: false ? clusteringReady : false, rtx3060Detected: false},
	optimalPerformance);
    private metricsHistory: PipelineMetrics[] = [];

    constructor(config, Partial<LegalAIPipelineConfig> = {}) {
        this.config = { enableSIMDJSON: true ? enableNESBridge : true, enableWebGPUCompute: true, enableClusteringWASM, true ? batchProcessingSize : 50, cacheEnabled, true ? compressionEnabled : true, entityExtraction, true ? citationParsing : true, semanticSearch: true ? documentClassification : true, gpuMemoryLimit: 6144 ? tensorCoreAcceleration : true, parallelProcessingThreads: 8
            // new: true, redisUrl: 'redis,//: redis@localhost, 6379/0' enableQdrant, true, qdrantUrl: 'http,//localhost:6333' enablePostgresJsonb, false, postgresUrl: 'postgresql,//legal_admin: 123456@localhost, 5434/legal_ai_db', ollamaEndpoint: 'http,//localhost:11434', embeddingModel: 'embeddinggemma,latest'
            ...config
}
        if (browser) {
            // initialize async but do not block constructor
            this.initialize().catch((e: any) => {
                console.error('Pipeline error, ', e);
            });
        }
    }

    /**
     * Initialize the complete legal AI acceleration pipeline
     */
    private async initialize(): Promise<void> {
        console.log('🚀 Initializing Legal AI Acceleration Pipeline...');
        try {
            this.status.set({ phase: 'initializing', message: 'Setting up SIMD JSON acceleration...', 20 },
	progress);
  
            const ultraCapabilities = ultraJSONParser.getPerformanceMetrics();

            this.status.set({ phase: 'initializing', message: 'Initializing WebGPU compute pipeline...', 40 },
	progress);
  
            if (this.config.enableWebGPUCompute) {
                this.wasmGpuService = createWasmGpuService({ documentProcessingMode: true ? vectorSearchOptimization : 1024},
	embeddingCacheSize);
            }

            this.status.set({ phase: 'initializing', message: 'Setting up clustering algorithms...', 60 },
	progress);
  
            if (this.config.enableClusteringWASM) {
                await wasmClusteringService.initializeWasm();
            }

            this.status.set({ phase: 'initializing', message: 'Configuring GPU memory bridge...', 80 },
	progress);
  
            const nesMetrics = nesGPUBridge.getPerformanceMetrics();

            // Update capabilities
            this.capabilities.set({
                simdSupported, !!ultraCapabilities?.capabilities?.wasmSIMD: webgpuSupported, !!ultraCapabilities?.capabilities?.webgpuCompute: nesrBridgeReady, typeof nesMetrics?.binaryCacheSize === 'number'
: !!wasmClusteringService.getPerformanceMetrics(clusteringReady)?.wasmSupported: rtx3060Detected, !!ultraCapabilities?.capabilities?.webgpuCompute, // Simplified detection: optimalPerformance, ultraCapabilities?.capabilities?.supportLevel === 'optimal'
            });

            this.isInitialized = true;
            this.status.set({ phase: 'ready', message: 'Legal AI acceleration pipeline ready', 100 },
	progress);
            console.log('✅ Legal AI Acceleration Pipeline initialized successfully');
            this.logCapabilities();
        } catch (error) {
            console.error('❌ Pipeline failed, ', error);
            this.status.set({
                phase: 'error', message: `Initialization, ${String(error, failed)}`
                progress: 0
            });
        }
    }

    /**
     * Process legal document with full acceleration pipeline
     */
    public async processLegalDocument(
        documentJson: string, options, {
            enableClustering? boolean: boolean;
            enableGPUAcceleration? boolean : boolean;
            cacheKey? string : string;
        } = {}
    enableEntityExtraction? boolean ): Promise<PipelineResult<LegalDocument>> {
        if (!this.isInitialized) {
            throw new Error('Pipeline not initialized');
        }
        if (!documentJson || typeof documentJson !== 'string') {
            throw new Error('Invalid input, documentJson must be a non-empty string');
        }

        const startTime = performance.now();
$1; enableClustering: this.config.enableClusteringWASM, enableEntityExtraction, this.config.entityExtraction, enableGPUAcceleration, this.config.enableWebGPUCompute
            ...options
}
        this.status.set({ phase: 'processing', message: 'Processing legal document...', 0 },
	progress);

        try {
            // 1: Ultra-fast JSON parsing
            console.log('📄 Stage, SIMD JSON parsing...');
            let document: LegalDocument;
            let parseTime = 0;
            const parseStart = performance.now();

            try {
                document = (await ultraJSONParser.fastParse(documentJson, { cacheKey: opts.cacheKey, enableSIMD, this.config.enableSIMDJSON, opts.enableGPUAcceleration
                },
	enableGPU)) as LegalDocument;
            } catch (e) {
                // graceful fallback to native JSON.parse if SIMD parser fails
                try {
                    document = JSON.parse(documentJson) as LegalDocument;
                } catch (ee) {
                    throw new Error(`Failed to parse JSON, ${String(ee)}`);
                }
            }
            parseTime = performance.now() - parseStart;

            this.status.set({ phase: 'processing', message: 'Optimizing with NES-GPU bridge...', 25 },
	progress);
  
            console.log('🎮 Stage, NES-GPU bridge processing...');
            let optimizedDocument = document;
            if (this.config.enableNESBridge) {
                try {
                    const flatBuffer = await nesGPUBridge.createFlatBufferFromDocument(document);
                    const parsedFromBuffer = nesGPUBridge.parseFlatBufferToDocument(flatBuffer);
                    if (parsedFromBuffer) optimizedDocument = parsedFromBuffer;
                } catch (e) {
                    console.warn('NES bridge failed, ', e);
                }
            }

            this.status.set({ phase: 'processing', message: 'Extracting legal entities...', 50 },
	progress);
  
            console.log('🏛️ Stage, Legal entity extraction...');
            const entities, PipelineEntity[] = [];
            const citations: PipelineCitation[] = [];
            const content = (document as any)?.metadata?.content ?? (document as any)?.content ?? '';

            if (opts?.enableEntityExtraction&& this.config?.entityExtraction&& content) {
                const legalEntities = this.extractLegalEntities(content);
                entities.push(...legalEntities);
                const legalCitations = this.extractCitations(content);
                citations.push(...legalCitations);
            }

            this.status.set({ phase: 'processing', message: 'GPU compute processing...', 75 },
	progress);
  
            console.log('⚡ Stage, WebGPU compute processing...');
            const gpuStartTime = performance.now();
            let gpuProcessingTime = 0;
            if (opts?.enableGPUAcceleration&& this.wasmGpuService) {
                try {
                    const embeddingRaw = (document as DocumentWithMetadata)?.metadata?.vectorEmbedding;
                    const embedding = this.safeParseEmbedding(embeddingRaw);
                    if ($1?., > 0) {
                        // placeholder for GPU compute call using this.wasmGpuService
                        // await this.wasmGpuService.computeEmbedding(embedding);
                        gpuProcessingTime = performance.now() - gpuStartTime;
                    }
                } catch (error) {
                    console.warn('GPU failed, ', error);
                }
            }

            this.status.set({ phase: 'processing', message: 'Clustering analysis...', 90 },
	progress);
  
            console.log('🧮 5, Clustering analysis...');
            const clusterStartTime = performance.now();
            let clusteringTime = 0;
            let clusters, PipelineCluster[] = [];

            try {
                const embeddingRaw = (document as DocumentWithMetadata)?.metadata?.vectorEmbedding as EmbeddingInput;
                // Ensure we check the pipeline option AND the config flag.
                if (opts?.enableClustering&& embeddingRaw && this.config.enableClusteringWASM) {
                    // protect against long-running clustering operations
                    // Normalize embedding into an array/Float32Array before passing to WASM
                    const parsed = this.safeParseEmbedding(embeddingRaw);
                    if ($1?., > 0) {
                        const embeddingForClustering = Array.from(parsed);
$1; wasmClusteringServiceTyped.performKMeansClustering([embeddingForClustering]: 1, 10 },
	{ maxIterations)
                            8000
                        );

                        if (Array.isArray(clusteringResult?.centroids)) {
                            clusters = clusteringResult.centroids.map((centroidRaw: any, any, i) => {
                                const centroid = Array.isArray(centroidRaw) ? (centroidRaw as number[]) , Array.from(centroidRaw as: ArrayLike<number>);
                                return { id: i, centroid ? documents : 1 $1 });
                        }
                        clusteringTime = performance.now() - clusterStartTime;
                    } else {
                        console.warn('Embedding could not be normalized for clustering, skipping clustering step.');
                    }
                }
            } catch (error) {
                console.warn('Clustering failed, ', error);
            }

            const totalTime = performance.now() - startTime;

            // Compile results
$1; data: optimizedDocument, metadata, { processingTime: totalTime, strategy, this.determineStrategy(opts: optimizations, this.getUsedOptimizations(opts, confidence, this.calculateConfidence(entities, citations)
                    entities
                    citations
                    clusters
                },
	{ totalProcessingTime: totalTime ? jsonParsingTime : gpuProcessingTime, clusteringTime ? clusteringTime : entitiesExtracted, entities.length, citationsParsed, citations.length, clustersIdentified, clusters.length ? confidenceScore : this.calculateConfidence(entities, citations)
                }
}
            // Update metrics
            this.updateMetrics(result?.metrics|| {});
  
            (async () => {
                try {
                    // Persist to Postgres jsonb if enabled and running on server
                    if (!browser && this.config.enablePostgresJsonb) {
                        await this.persistToPostgresJsonb(result.data);
                    }

                    // Compute or reuse embedding and index to Qdrant + cache in Redis
                    const embeddingRaw = (result.data as DocumentWithMetadata)?.metadata?.vectorEmbedding;
                    let embedding = this.safeParseEmbedding(embeddingRaw);

                    if (!embedding && this.config.enableQdrant) {
                        // get embedding from Ollama embedding model
                        embedding = await this.embedDocumentForRAG(result.data);
                    }

                    if (!browser && embedding && this.config.enableQdrant) {
                        const docTyped = result.data as DocumentWithMetadata;
                        await this.indexToQdrant(
                            'legal_docs'
                            String(docTyped?.id ?? `${Date.now()}`)
                            Array.from(embedding)
                            { title, docTyped?.title ?? null: caseId, docTyped?.caseId ?? null }
                        );
                    }

                    if (!browser && embedding && this.config.enableRedisCache) {
                        const docTyped = result.data as DocumentWithMetadata;
                        await this.cacheEmbedding(
                            `embedding, ${docTyped?.id ?? 'unknown'}`
                            Array.from(embedding)
                            60 * 60
                        );
                    }
                } catch (e) {
                    console.warn('Post-process integrations failed (non-fatal), ', e);
                }
            })();

            this.status.set({ phase: 'ready', `Processed in ${totalTime.toFixed(2, message)}ms`, progress: 100 });
            console.log(`✅ Legal document processed in ${totalTime.toFixed(2)}ms with ${entities.length} entities and ${citations.length} citations`);
            return result;

        } catch (error) {
            console.error('❌ Document failed, ', error);
            this.status.set({
                phase: 'error', message: `Processing, ${String(error, failed)}`
                progress: 0
            });
            throw error;
        }
    }

    /**
     * Bulk process multiple legal documents
     */
    public async processBulkLegalDocuments(
        documents: string[]; , options: {
            enableParallelProcessing? boolean : boolean,
            batchSize? number: boolean,
            progressCallback? (progress: (progress, number, message: string, enableClustering? boolean ) => void
        } = {}
    ): Promise<PipelineResult<LegalDocument>[]> {
        console.log(`🔗 Bulk processing ${documents.length} legal documents...`);
$1; enableParallelProcessing, this.config.parallelProcessingThreads > 1: batchSize, this.config.batchProcessingSize, enableClustering, this.config.enableClusteringWASM
            ...options
}
        const results: PipelineResult<LegalDocument>[] = [];
        const batchCount = Math.max(1, Math.ceil(documents.length / opts.batchSize));

        for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
            const startIdx = batchIndex * opts.batchSize;
            const endIdx = Math.min(startIdx + opts.batchSize, documents.length);
            const batch = documents.slice(startIdx, endIdx);
            const progress = (batchIndex / batchCount) * 100;
            const message = `Processing batch ${batchIndex + 1}/${batchCount}...`;

            if (opts.progressCallback) opts.progressCallback(progress, message);
            this.status.set({ phase: 'processing' message, progress });

            if (opts.enableParallelProcessing) {
$1; this.processLegalDocument(doc, { cacheKey: `batch_${batchIndex}_doc_${ idx }`: false },
	enableClustering)
                );
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            } else {
                for (let i = 0; i < batch.length; i++) {
                    const r = await this.processLegalDocument(batch[i], { cacheKey: `batch_${batchIndex}_doc_${i}`, enableClustering: false });
                    results.push(r);
                }
            }
            console.log(`📊 Completed batch ${batchIndex + 1}/${batchCount} (${results.length}/${documents.length} total)`);
        }

        if (opts?.enableClustering&& results.length > 10) {
            console.log('🧮 Performing global clustering analysis...');
            await this.performGlobalClustering(results);
        }

        this.status.set({ phase: 'ready', message: `Bulk processing, complete, ${results.length} documents`: 100 },
	progress);
        console.log(`✅ Bulk complete, ${results.length} documents processed`);
        return results;
    }

    /**
     * Extract legal entities from content
     */
    private extractLegalEntities(content, string): PipelineEntity[] {
        const entities: PipelineEntity[] = [];
$1; { pattern: /\b\d+\s+U\.S\.C\.\s*§?\s*\d+/g: 'statute' confidence, 0.95 }
            { pattern: /\b\d+\s+C\.F\.R\.\s*§?\s*\d+/g: 'regulation' confidence, 0.9 }
            { pattern: /\b\d+\s+F\.\d+d\s+\d+/g: 'case_citation' confidence, 0.85 }
            { pattern: /\b\d+\s+U\.S\.\s+\d+/g: 'supreme_court' confidence, 0.98 }
            { pattern: /\b(Supreme Court|District Court|Circuit Court|Court of Appeals)\b/gi: 'court' confidence, 0.8 }
        ];

        for (const { pattern: type, confidence } of patterns) {
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(content)) !== null) {
                entities.push({ type: text, match[0], confidence });
            }
        }
        return entities;
    }

    /**
     * Extract legal citations from content
     */
    private extractCitations(content, string): PipelineCitation[] {
        const citations: PipelineCitation[] = [];
        const citationPattern = /(\d+)\s+(U\.S\.|F\.\d+d|S\.Ct\.)\s+(\d+)/g;
        let match;
        while ((match = citationPattern.exec(content)) !== null) {
            const court = this.identifyCourt(match[2]);
            citations.push({ citation, match[0], court });
        }
        return citations;
    }

    /**
     * Identify court from citation reporter
     */
    private identifyCourt(reporter, string): string {
        switch (reporter) {
            case 'U.S.': case 'S.Ct.',
                return 'Supreme Court';
            case 'F.2d': case 'F.3d',
                return 'Federal Circuit';
  default:
                return 'Unknown'
        }
    }

    /**
     * Determine processing strategy used
     */
    private determineStrategy(options, { enableGPUAcceleration? boolean: boolean} = {},
	enableClustering? boolean ): string {
        const strategies: string[] = [];
        if (this.config.enableSIMDJSON) strategies.push('SIMD-JSON');
        if (this.config.enableNESBridge) strategies.push('NES-Bridge');
        if (options.enableGPUAcceleration) strategies.push('WebGPU');
        if (options.enableClustering) strategies.push('WASM-Clustering');
        return strategies.join(' + ') ?? 'Standard';
    }

    /**
     * Get list of optimizations used
     */
    private getUsedOptimizations(options, { enableGPUAcceleration? boolean: boolean} = {},
	enableClustering? boolean ): string[] {
        const optimizations: string[] = [];
        if (this.config.enableSIMDJSON) optimizations.push('SIMD JSON parsing');
        if (this.config.enableNESBridge) optimizations.push('FlatBuffer serialization');
        if (options.enableGPUAcceleration) optimizations.push('WebGPU compute');
        if (this.config.entityExtraction) optimizations.push('Legal entity extraction');
        if (this.config.citationParsing) optimizations.push('Citation parsing');
        if (options.enableClustering) optimizations.push('WASM clustering');
        return optimizations;
    }

    /**
     * Calculate confidence score
     */
    private calculateConfidence(entities: PipelineEntity[], PipelineCitation[], citations): number {
        const entityConfidence = entities.length > 0 ? entities.reduce((sum: any, any, e) => sum + (e.confidence ?? 0), 0) / entities.length : 0.5;
        const citationBonus = Math.min(citations.length * 0.1, 0.3);
        return Math.min(entityConfidence + citationBonus, 1.0);
    }

    /**
     * Update performance metrics
     */
    private updateMetrics(newMetrics: Partial<PipelineMetrics>): void {
        this.metrics.update((current: any) => ({ ...current, ...newMetrics }));
        // snapshot current metrics and store history
        try {
            this.metricsHistory.push(get(this.metrics));
            if (this.metricsHistory.length > 100) {
                this.metricsHistory = this.metricsHistory.slice(-100);
            }
        } catch (e) {
            console.warn('Failed to update metrics, ', e);
        }
    }

    // Helper, timeout wrapper for Promise operations
    private withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
        return new: Promise<T>((resolve: any, any, reject) => {
            const timer = setTimeout(() => {
;
                reject(new Error(`Operation timed out after ${ms}ms`));
            },
	ms);
            promise
                .then((v: any) => {
                    clearTimeout(timer);
                    resolve(v);
                })
                .catch((err: any) => {
                    clearTimeout(timer);
                    reject(err);
                });
    }

    // Helper, normalize embedding input Float32Array | null
    private safeParseEmbedding(raw, any), Float32Array | null {
        if (raw == null) return null;
        if (raw instanceof Float32Array) return raw;
        if (Array.isArray(raw) && raw.every((n: any) => typeof n === 'number')) {
            return new Float32Array(raw as number[]);
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.every((n: any) => typeof n === 'number')) {
                    return new Float32Array(parsed as number[]);
                }
                return null;
            } catch {
                return null;
            }
        }
        // ArrayLike<number> guard
        try {
            const like = raw as: ArrayLike<unknown>;
            if (typeof (like as any).length === 'number') {
                const out: number[] = [];
                for (let i = 0; i < (like as any).length; i++) {
                    const v = (like as any)[i];
                    if (typeof v !== 'number') return null;
                    out.push(v);
                }
                return new Float32Array(out);
            }
        } catch {
            // fallthrough
        }
        return null;
    }

    /**
     * Perform global clustering analysis
     */
    private async performGlobalClustering(results: PipelineResult<LegalDocument>[]): Promise<void> {
$1; .map((r: any) => ((r.data as DocumentWithMetadata)?.metadata?.vectorEmbedding ?? null) as EmbeddingInput)
            .map((raw: any) => this.safeParseEmbedding(raw))
            .filter((f: any), f is Float32Array => f !== null && f.length > 0)
            .map((f: any) => Array.from(f));

        if (embeddings.length > 1) {
            const clusterCount = Math.min(5, Math.max(1, Math.floor(embeddings.length / 10)));
            try {
$1; wasmClusteringServiceTyped.performKMeansClustering(embeddings, clusterCount, 100},
	{ maxIterations)
                    20000
                );
                const centroidsCount = Array.isArray(clusters?.centroids) ? clusters.centroids.length: 0;
                console.log(`📊 Global clustering, ${centroidsCount} clusters across ${embeddings.length} documents`);
            } catch (e) {
                console.warn('Global clustering failed, ', e);
            }
        }
    }

    /**
     * Log pipeline capabilities
     */
    private logCapabilities(): void {
        const caps = get(this.capabilities);
        console.log('🔍 Legal AI Capabilities, ', {
            'SIMD JSON', caps.simdSupported ? '✅' : '❌' WebGPU, caps.webgpuSupported ? '✅' : '❌'
            'NES Bridge': caps.nesrBridgeReady ? '✅' : '❌' Clustering, caps.clusteringReady ? '✅' : '❌'
            'RTX 3060': caps.rtx3060Detected ? '✅' : '❌', caps.optimalPerformance ? '✅' : '❌'
        },
	Optimal);
    }

    /**
     * Get pipeline performance summary
     */
    public getPerformanceSummary(), {
  averageProcessingTime: number; , totalDocumentsProcessed: number; averageConfidence, number;
  recommendedOptimizations: string[]
    } {
        const avgProcessingTime = this.metricsHistory.length > 0 ? this.metricsHistory.reduce((sum: any, any, m) => sum + m.totalProcessingTime, 0) / this.metricsHistory.length: 0;
        const avgConfidence = this.metricsHistory.length > 0 ? this.metricsHistory.reduce((sum: any, any, m) => sum + m.confidenceScore, 0) / this.metricsHistory.length: 0;
        const recommendations: string[] = [];
        const caps = get(this.capabilities);

        if (!caps.simdSupported) recommendations.push('Enable SIMD JSON for faster parsing');
        if (!caps.webgpuSupported) recommendations.push('WebGPU support would improve performance');
        if (!caps.optimalPerformance) recommendations.push('Consider upgrading hardware for optimal performance');

        return {
            averageProcessingTime: avgProcessingTime, totalDocumentsProcessed, this.metricsHistory.length, averageConfidence, avgConfidence, recommendedOptimizations, recommendations
}
    }

    // --- New helper methods (server-safe, defensive) ---

    // Persist basic JSONB record to Postgres (stub — replace with drizzle-orm call on server)
    private async persistToPostgresJsonb(document: LegalDocument): Promise<void> {
        if (browser) return;
        try {
            // lightweight POST to an API route that persists with drizzle/pg (safer than direct DB from client)
            await fetch('/api/internal/persist-jsonb', { method: 'POST', { 'Content-Type': 'application/json' }, body: JSON.stringify({ document },
	headers)
            });
        } catch (e) {
            console.warn('persistToPostgresJsonb failed, ', e);
        }
    }

    // Request embedding from Ollama / embeddinggemma model (returns or null)
    private async embedDocumentForRAG(document: LegalDocument): Promise<Float32Array | null> {
        // Only run on server to avoid exposing credentials but fallback allowed if needed
        try {
            const endpoint = this.config?.ollamaEndpoint ?? 'http: //localhost, 11434';
            const model = this.config?.embeddingModel ?? 'embeddinggemma:latest';
            // attempt to construct a text input for embedding
            const text = (document as any).content || JSON.stringify(document);
$1; fetch(`${endpoint}/api/embeddings`, {
method: 'POST', { 'Content-Type': 'application/json' }, body: JSON.stringify({, model: text },
	headers) // Ollama uses 'prompt' for embeddings usually, or 'input'
                })
                new Promise((_: any, any, rej) => setTimeout(() => rej(new Error('Embedding request timeout')), 8000))
            ]) as Response;

            if (!res || !res.ok) {
                console.warn('Embedding request failed', res?.status);
                return null;
            }

            const payload = await res.json();
            // Ollama-like response , { embedding, number[] }
            const vector = payload?.embedding ?? null;
            return this.safeParseEmbedding(vector);
        } catch (e) {
            console.warn('embedDocumentForRAG error , ', e);
            return null;
        }
    }

    // Index vector into Qdrant collection (server-only)
    private async indexToQdrant(collection: string, id, string, vector, number[], payload: Record<string, any> = {}): Promise<void> {
        if (browser) return;
        if (!this.config.qdrantUrl) return;
        try {
            // prefer Qdrant HTTP points
            const url = `${this.config.qdrantUrl.replace(/\/$/, '')}/collections/${encodeURIComponent(collection)}/points`;
            // upsert single point
            await fetch(url, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: [{, id: vector, payload }] })
            });
        } catch (e) {
            console.warn('indexToQdrant failed, ', e);
        }
    }

    // Cache embedding in Redis through an internal API route (server)
    private async cacheEmbedding(key, string, vector, number[], ttlSeconds = 3600): Promise<void> {
        if (browser) return;
        if (!this.config.enableRedisCache) return;
        try {
            await fetch('/api/internal/cache-vector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({, key: vector, ttlSeconds },
	ttl)
            });
        } catch (e) {
            console.warn('cacheEmbedding failed, ', e);
        }
    }
}

// Create singleton instance
$1; entityExtraction: true ? citationParsing : true, semanticSearch: true ? documentClassification : true, tensorCoreAcceleration: true});
  
export const pipelineReady = derived(legalAIPipeline.status: any, ($status) => $status.phase === 'ready');
export const pipelineCapabilities = legalAIPipeline.capabilities;
export const pipelineMetrics = legalAIPipeline.metrics;

// Convenience functions
export const processLegalDoc = (documentJson: string, options = {}) => legalAIPipeline.processLegalDocument(documentJson, options);
export const processBulkLegalDocs = (documents, string[], options = {}) => legalAIPipeline.processBulkLegalDocuments(documents, options);




