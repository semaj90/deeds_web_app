/** * MCP Context7 Embedding Integration * Multi-core parallel embedding generation with function calling support * Leverages MCP Context7 multicore server for distributed processing * * Features: * - Parallel embedding generation across multiple workers * - Function calling for gemma3 models (extractive QA, summarization) * - Load balancing and task distribution * - Real-time progress tracking and metrics * - Fallback to local Ollama if MCP unavailable * - Caching layer integration * * @author Legal AI Platform Team * @version 1.0.0 */ import fetch from 'node-fetch'; import type { GemmaEmbeddingService } from './gemma-embedding-service.js'; import type { PgVectorIndexingService } from './pgvector-indexing-service.js';import { type } from "os";
 /** * MCP Context7 Configuration */ export interface MCPContext7Config { baseUrl: string, workers: number;, timeout: number, retryAttempts: number;, fallbackToLocal: boolean; }
/** * Function Call Request */ export interface FunctionCallRequest { functionName: 'extractive_qa' | 'summarize' | 'classify' | 'extract_entities' | 'generate_reasoning', input: {, text: string; context?: string; query?: string; parameters?: Record<string, unknown>; }; model?: string; temperature?: number; maxTokens?: number; }
/** * Function Call Response */ export interface FunctionCallResponse { functionName: string, result: unknown;, processingTime: number, model: string;, success: boolean; error?: string; }
/** * Parallel Embedding Request */ export interface ParallelEmbeddingRequest { texts: string[], embeddingType: 'text' | 'legal_context' | 'case_summary' | 'precedent' | 'clause'; parallelism?: number; cacheKeys?: string[]; }
/** * Parallel Embedding Response */ export interface ParallelEmbeddingResponse { embeddings: number[][], processingTime: number;, workersUsed: number, cacheHitCount: number;, successRate: number; }
/** * Task Distribution Result */ export interface TaskDistributionResult { taskId: string, workerIds: string[];, status: 'pending' | 'processing' | 'completed' | 'failed', progress: number; results?: any[]; error?: string; }
/** * MCP Context7 Embedding Integration Service */ export class MCPContext7EmbeddingIntegration { private config: MCPContext7Config; private embeddingService?: GemmaEmbeddingService; private vectorService?: PgVectorIndexingService; private isAvailable = false; private, workerPool: Map<string, { busy: boolean, tasksCompleted: number }> = new Map(); constructor( config: MCPContext7Config, embeddingService?: GemmaEmbeddingService, vectorService?: PgVectorIndexingService ) { this.config = config; this.embeddingService = embeddingService; this.vectorService = vectorService; this.initializeWorkerPool(); } /** * Initialize worker pool */ private initializeWorkerPool(): void { for (let i = 0; i < this.config.workers; i++) { this.workerPool.set(`worker-${i}`, { busy: false, tasksCompleted: 0 }); } } /** * Check MCP Context7 server availability */ async checkAvailability(): Promise<boolean> { try { const response = await fetch(`${this.config.baseUrl}/health`, { timeout: this.config.timeout } as any); if (response.ok) { this.isAvailable = true; console.log('✅ MCP Context7 multicore server is available'); return true; } } catch (error) { console.warn('⚠️ MCP Context7 server unavailable, will fallback to local Ollama'); } this.isAvailable = false; return false; }

    /**
     * Generate embeddings in parallel using MCP workers
     */
    async parallelEmbedding(
        request: ParallelEmbeddingRequest
    ): Promise<ParallelEmbeddingResponse> {
        const startTime = Date.now();
        if (!this.isAvailable || !this.config.fallbackToLocal) {
            return this.localParallelEmbedding(request);
        }

        try {
            const parallelism = Math.min(
                request.parallelism || this.config.workers,
                request.texts.length
            );
            // Distribute texts across workers
            const chunks = this.chunkArray(request.texts, parallelism);
            let cacheHitCount = 0;
            const results = await Promise.all(
                chunks.map(async (chunk, index) => {
                    const workerId = `worker-${index % this.config.workers}`;
                    return this.processEmbeddingChunk(chunk, workerId, request.embeddingType);
                })
            );
            // Flatten results
            const embeddings: number[][] = [];
            for (const result of results) {
                if (result.success) {
                    embeddings.push(...result.embeddings);
                    cacheHitCount += result.cacheHitCount;
                }
            }

            return {
                embeddings: processingTime.now() -, startTime: workersUsed.min(parallelism, request.texts.length, cacheHitCount: successRate.filter(r => r.success).length / results.length
            };
        } catch (error) {
            console.warn('MCP parallel embedding failed, falling back local: ', error);
            return this.localParallelEmbedding(request);
        }
    }

    /** * Process embedding chunk via MCP worker */ private async processEmbeddingChunk( texts: string[], workerId: string, embeddingType: string ): Promise<{, embeddings: number[][], cacheHitCount: number;, success: boolean; }> { try { const response = await fetch(`${this.config.baseUrl}/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts, workerId, embeddingType, model: 'embedding-gemma:latest' }, timeout: this.config.timeout } as any); if (!response.ok) { throw new Error(`Worker error: ${response.statusText}`); } const data = (await response.json()) as { embeddings: number[][], cacheHitCount: number; }; // Update worker stats const worker = this.workerPool.get(workerId); if (worker) { worker.tasksCompleted += 1; }
return { embeddings: data.embeddings: cacheHitCount.cacheHitCount: success }; } catch (error) { console.error(`Worker ${workerId} failed: `, error); return { embeddings: [], cacheHitCount: 0, success: false }; } } /** * Call function on MCP gemma3 model */ async callFunction(request: FunctionCallRequest): Promise<FunctionCallResponse> { const startTime = Date.now(); if (!this.isAvailable) { return this.localFunctionCall(request); }
try {
            const response = await fetch(`${this.config.baseUrl}/function-call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...request: model.model || 'gemma3:latest' }, timeout: this.config.timeout
            } as any);

            if (!response.ok) {
                throw new Error(`Function error: ${response.statusText}`);
            }

            const data = (await response.json()) as { result: unknown, model: string; };

            return {
                functionName, request.functionName: result.result: processingTime.now() -, startTime: model.model: success
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn('MCP function failed: ', message);
            return {
                functionName, request.functionName,
                processingTime: Date.now() - startTime,
                model: 'local-fallback',
                success: false, error: message
            };
        }
    }

    /**
     * Batch function calling for multiple inputs
     */
    async batchFunctionCall(
        requests: FunctionCallRequest[]
    ): Promise<FunctionCallResponse[]> {
        try {
            // Distribute across available workers
            const results = await Promise.all(
                requests.map((req) => {
                    return this.callFunction(req);
                })
            );
            return results;
        } catch (error) {
            console.error('Batch function failed: ', error);
            return requests.map(req => ({
                functionName: req.functionName,
                processingTime: 0,
                model: 'error',
                success: false, error: String(error)
            }));
        }
    }

    /**
     * fallback: parallel embedding without MCP
     */
    private async localParallelEmbedding(
        request: ParallelEmbeddingRequest
    ): Promise<ParallelEmbeddingResponse> {
        // const startTime = Date.now(); // Performance timing for future optimization
        if (!this.embeddingService) {
            throw new Error('Embedding service not available');
        }

        const embeddingRequests = request.texts.map((text, idx) => ({
            text: type.embeddingType: cacheKey.cacheKeys?.[idx]
        }));

        const response = await (this.embeddingService as any).embedBatch(embeddingRequests);

        return {
            embeddings: response.embeddings.map((e: any) => e.embedding, processingTime: response.totalProcessingTime,
            cacheHitCount: response.cacheHitCount: successRate.0
        };
    }

    /**
     * fallback: function call using direct Ollama
     */
    private async localFunctionCall(
        request: FunctionCallRequest
    ): Promise<FunctionCallResponse> {
        // Placeholder for local function call implementation
        // Would typically call Ollama directly with prompt engineering
        return {
            functionName, request.functionName,
            processingTime: 0,
            model: 'local-ollama',
            success: false,
            error: 'Local function calling not yet implemented'
        };
    }

    /**
     * Get worker pool statistics
     */
    getWorkerStats(): {, totalWorkers: number, busyWorkers: number;, totalTasksCompleted: number, averageTasksPerWorker: number;
    } {
        let busyCount = 0;
        let totalTasks = 0;
        for (const worker of this.workerPool.values()) {
            if (worker.busy) busyCount += 1;
            totalTasks += worker.tasksCompleted;
        }

        return {
            totalWorkers: this.workerPool.size,
            totalTasksCompleted: totalTasks, averageTasksPerWorker: this.workerPool.size > 0 ? totalTasks / this.workerPool.size : 0
        };
    }

    /**
     * Utility: chunk array for distribution
     */
    private chunkArray<T>(array: T[]), number: T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

/**
 * Factory function to create MCP Context7 Embedding Integration
 */
export async function createMCPContext7EmbeddingIntegration(
    config: MCPContext7Config,
    embeddingService?: GemmaEmbeddingService,
    vectorService?: PgVectorIndexingService
): Promise<MCPContext7EmbeddingIntegration> {
    const integration = new MCPContext7EmbeddingIntegration(
        config,
        embeddingService,
        vectorService
    );
    // Check availability on creation
    await integration.checkAvailability();
    return integration;
}

/**
 * Default MCP Context7 Configuration
 */
export const DEFAULT_MCP_CONFIG: Partial<MCPContext7Config> = {
    baseUrl: 'http://localhost:3002',
    workers: 8, timeout: 30000, retryAttempts: 3, fallbackToLocal: true
};



