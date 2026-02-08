import { env } from '$env/dynamic/public';
import { DEFAULT_OLLAMA } from '$lib/services/get-ollama-endpoint';
import type { Redis } from 'ioredis';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// NOTE: ioredis is server-side only
// Lazy-load on demand and skip in browser
let redisClient: Redis | null = null;

async function getRedisClient(): Promise<Redis | null> {
    // If already initialized, return it
    if (redisClient) return redisClient;

    // If running in the browser, don't attempt to load ioredis
    if (typeof window !== 'undefined') return null;

	try {
        // Dynamically import the shared redis client from server modules
        const mod = await import('$lib/server/redis-client');
		redisClient = mod.redis;
		return redisClient;
	} catch (err) {
        // If dynamic import fails, treat as unavailable (no caching)
        console.warn('OllamaService: failed to initialize Redis (caching disabled)', err);
        redisClient = null;
        return null;
    }
}

type HealthCheckResult = {
    status: 'healthy' | 'unhealthy';
    embedMode: boolean;
	llmMode: boolean;
    model: string[];
};

/**
 * TODO: Phase 103.1+ - Migrate to TensorRT-LLM + Triton Inference Server
 * - PTX/CUDA kernel integration for GPU-accelerated inference
 * - Triton Inference Server for multi-model serving
 * - FlatBuffer gRPC for binary serialization (eliminate JSON overhead)
 * - SvelteKit 2.0 migration with RPC endpoints + graceful JSON API fallbacks
 * - QUIC/HTTP3 + Caddy hosting for production deployment
 */
const envFallback =
    typeof env?.PUBLIC_OLLAMA_API_URL === 'string' && env?.PUBLIC_OLLAMA_API_URL?.length > 0
        ? env?.PUBLIC_OLLAMA_API_URL
        : DEFAULT_OLLAMA || 'http://localhost:11434';

export class OllamaService {
    baseUrl: string;
    private embedModel = 'nomic-embed-text';
    private llmModel = 'gemma3-legal:latest';

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || envFallback;
    }

    async healthCheck(): Promise<HealthCheckResult> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) {
                return { status: 'unhealthy', embedMode: false, llmMode: false, model: [] };
            }

            const data = await response.json();
            const models = data.models?.map((m: any) => m.name) || [];

            return {
                status: 'healthy',
                embedMode: models.includes(this.embedModel),
                llmMode: models.includes(this.llmModel),
                model: models
            };
        } catch (err) {
            console.error('Ollama health check failed:', err);
            return { status: 'unhealthy', embedMode: false, llmMode: false, model: [] };
        }
    }

    async generateEmbedding(text: string): Promise<number[] | null> {
        try {
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: this.embedModel,
                    prompt: text
                })
            });

            if (!response.ok) return null;

            const data = await response.json();
            return data?.embedding ?? null;
        } catch (err) {
            console.error('Embedding generation failed:', err);
            return null;
        }
    }

    async generateCompletion(prompt: string, options?: any): Promise<string | null> {
        try {
            // 3-minute timeout for Ollama completion (LLM can be slow)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: this.llmModel,
                    prompt,
                    stream: false,
                    ...options
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const data = await response.json();
            return data?.response ?? null;
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                console.error('Ollama completion timed out after 3 minutes');
            } else {
                console.error('Completion generation failed:', err);
            }
            return null;
        }
    }
}