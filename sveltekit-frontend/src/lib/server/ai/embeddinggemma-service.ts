import type { cognitiveCache } from '$lib/server/cache';
import { createHash } from 'crypto';
import { generateEmbedding as requestEmbedding } from './ollama-client.js';

// Avoid direct import to prevent circular dependency issues if cognitiveCache isn't available
// In a real app we'd inject this dependency or use a module alias that resolves correctly.
// For now, we'll assume cognitiveCache is globally available or imported from a safe place.
// Since the original import was: import type { cognitiveCache } from '$lib/server/cache';
// but used in code, we need to import the value.
// Assuming '$lib/server/ai/cache' is the correct location based on previous edits.
import { cognitiveCache as cacheService } from './cache.js';

const DEFAULT_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const DEFAULT_DIMENSIONS = Number(process.env.OLLAMA_EMBED_DIM ?? 384);
const DEFAULT_CACHE_TTL_SECONDS = Number(process.env.EMBEDDING_CACHE_TTL ?? 60 * 60 * 24 * 7); // 7 days

export interface EmbeddingOptions {
	model?: string;
	useCache?: boolean;
	ttlSeconds?: number;
}

export interface EmbeddingResult {
	embedding: number[];, model: string;
	dimensions: number;, cached: boolean;
	processingTimeMs: number;
}

export interface BatchEmbeddingResult {
	embeddings: EmbeddingResult[];, totalProcessingTimeMs: number;
	cacheHitRatio: number;
}

export class EmbeddingGemmaService {
	private readonly cachePrefix = 'embedding:gemma:';

	async embed(text: string, options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
		const start = Date.now();
		const model = options.model ?? DEFAULT_MODEL;
		const useCache = options.useCache !== false;
		const ttlSeconds = options.ttlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
		const cacheKey = this.buildCacheKey(text, model);

		if (useCache) {
			const cached = await cacheService.getJsonbDocument<number[]>(cacheKey);
			if (cached) {
				return {
					embedding: cached,
					model,
					dimensions: cached?.length || DEFAULT_DIMENSIONS,
					cached: true,
					processingTimeMs: Date.now() - start
				};
			}
		}

		// Assuming requestEmbedding returns { embedding: number[], model?: string }
		const response = await requestEmbedding({ text, model });
		const embedding = response.embedding;

		if (useCache) {
			await cacheService.storeJsonbDocument(cacheKey, embedding, ttlSeconds);
		}

		return {
			embedding,
			model: response.model ?? model,
			dimensions: embedding.length ?? DEFAULT_DIMENSIONS,
			cached: false,
			processingTimeMs: Date.now() - start
		};
	}

	async embedBatch(texts: string[], options: EmbeddingOptions = {}): Promise<BatchEmbeddingResult> {
		const start = Date.now();
		let cacheHits = 0;
		const results: EmbeddingResult[] = [];

		for (const text of texts) {
			const result = await this.embed(text, options);
			if (result.cached) cacheHits += 1;
			results.push(result);
		}

		return {
			embeddings: results,
			totalProcessingTimeMs: Date.now() - start,
			cacheHitRatio: results.length === 0 ? 0 : cacheHits / results.length
		};
	}

	private buildCacheKey(text: string, model: string): string {
		const hash = createHash('sha256').update(`${model}:${text}`).digest('hex');
		return `${this.cachePrefix}${hash}`;
	}
}

export const embeddingGemma = new EmbeddingGemmaService();

