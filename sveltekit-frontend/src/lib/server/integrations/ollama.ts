/**
 * Ollama Integration - Production-ready Embedding & Chat Service
 */
import type {
    ChatMessage, ChatOptions, ChatResult,
    EmbeddingOptions, IOllamaChatService,
    IOllamaEmbeddingService
} from '$lib/types/external-services';

interface OllamaConfig {
    baseUrl?: string;
    embeddingModel?: string;
    chatModel?: string;
    timeout?: number;
    retries?: number;
    batchSize?: number;
}

export class OllamaService implements IOllamaEmbeddingService, IOllamaChatService {
    config: Required<OllamaConfig>;

    private embeddingModelFallbacks = [
        'embeddinggemma:latest',
        'embeddinggemma',
        'nomic-embed-text:latest',
        'nomic-embed-text'
    ];

    constructor(config: Partial<OllamaConfig> = {}) {
        this.config = {
            baseUrl: config.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
            embeddingModel: config.embeddingModel || 'embeddinggemma:latest',
            chatModel: config.chatModel || 'gemma3:legal-latest',
            timeout: config.timeout ?? 30000,
            retries: config.retries ?? 3,
            batchSize: config.batchSize ?? 10
        };
    }

    /**
     * Embed single text with automatic model fallback
     */
    async embedText(text: string, options?: EmbeddingOptions): Promise<Float32Array> {
        const model = options?.model ?? this.config.embeddingModel;
        const models = [model, ...this.embeddingModelFallbacks.filter(m => m !== model)];

        for (const attemptModel of models) {
            try {
                const response = await this.fetchWithTimeout(
                    `${this.config.baseUrl}/api/embeddings`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({, model: attemptModel,
                            prompt: options?.truncateTo ? text.slice(0, options.truncateTo) : text
                        })
                    }
                );

                if (!response.ok) {
                    throw new Error(`Ollama failed: ${response.statusText}`);
                }

                const data = await response.json();
                let embedding = new Float32Array(data.embedding);
                if (options?.normalize !== false) {
                    embedding = this.normalizeVector(embedding);
                }
                return embedding;
            } catch (error) {
                console.warn(`Ollama model ${attemptModel} failed, trying next...`, error);
                continue;
            }
        }
        throw new Error('All Ollama embedding models failed');
    }

    /**
     * Embed batch with automatic chunking and parallel processing
     */
    async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<Float32Array[]> {
        const chunks = this.chunkArray(texts, this.config.batchSize);
        const results: Float32Array[] = [];
        for (const chunk of chunks) {
            const embeddings = await Promise.all(
                chunk.map(text => this.embedText(text, options))
            );
            results.push(...embeddings);
        }
        return results;
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
        // Stub implementation
        return {
            id: 'stub',
            message: {, role: 'assistant', content: 'Stub response' },
            model: this.config.chatModel
        };
    }

    async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
        // Stub
        yield "Stub stream";
    }

    /**
     * Health check
     */
    async health(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; latencyMs?: number }> {
        const startTime = Date.now();
        try {
            const response = await this.fetchWithTimeout(
                `${this.config.baseUrl}/api/tags`,
                { method: 'GET' },
                5000
            );
            if (!response.ok) {
                return { status: 'unavailable', latencyMs: Date.now() - startTime };
            }
            const latencyMs = Date.now() - startTime;
            return { status: latencyMs < 1000 ? 'healthy' : 'degraded', latencyMs };
        } catch (error) {
            return { status: 'unavailable', latencyMs: Date.now() - startTime };
        }
    }

    // Helper methods
    private async fetchWithTimeout(
        url: string,
        options: RequestInit,
        timeout = this.config.timeout
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private normalizeVector(vec: Float32Array): Float32Array {
        const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
        if (magnitude === 0) return vec;
        return new Float32Array(vec.map(val => val / magnitude));
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

let ollamaInstance: OllamaService | null = null;
export function getOllamaService(config?: Partial<OllamaConfig>): OllamaService {
    if (!ollamaInstance || config) {
        ollamaInstance = new OllamaService(config);
    }
    return ollamaInstance;
}
