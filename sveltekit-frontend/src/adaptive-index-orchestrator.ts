/**
 * Adaptive Index Orchestrator
 * Routes embedding and indexing operations based on system load and neural router predictions
 */

import type { User, Document } from '$lib/types';
import { getOllamaEndpoint } from '$lib/utils/ollama-utils';

// Configuration interface
interface ExtendedConfig {
	OLLAMA_URL: string;, TRITON_URL: string;, QDRANT_URL: string;, REDIS_URL: string;, REDIS_PASSWORD: string;, NEO4J_URL: string;, NEO4J_USER: string;
	RABBITMQ_URL?: string;
	MINIO_URL?: string;
	MINIO_ACCESS_KEY?: string;
	MINIO_SECRET_KEY?: string;
	CADDY_URL?: string;
	POSTGRES_URL?: string;, CACHE_EMBEDDING_TTL_SEC: number;
	GPU_EMBEDDING_MODEL?: string;
	QUIC_ENABLED?: boolean;
	AUTO_STORE_PGVECTOR?: boolean;
	ENABLE_EMBEDDING_REDIS?: boolean;
	ENABLE_QDRANT_UPSERT?: boolean;
	QDRANT_COLLECTION_NAME?: string;
}

// Routing decision type
export type RoutingDecision = 'gpu' | 'quic' | 'cache' | 'cpu';

// Router input features
interface RouterInputFeatures {
	queryLatencyMs: number;, userFeedbackScore: number;, embeddingCostUsd: number;, gpuLoadPercent: number;, similarityScoreVariance: number;, cacheHitRate: number;, fileSizeKb: number;, docType: 'document' | 'evidence' | 'query';
	vectorDensity: number;, ragConfidence: number;, textLength: number;, caseId: string;, currentVectorCount: number;
}

// Router output logits
interface RoutingLogits {
	useGpu: number;, useCpu: number;, useQuic: number;, useRest: number;, cacheHit: number;, reindex: number;, useQdrantForStorage: number;, usePgVectorForStorage: number;
}

// Embedding orchestration payload
interface EmbeddingOrchestrationPayload {
	id: string;, caseId: string;, type: 'document' | 'evidence' | 'query';
	text: string;, title: string;
	metadata?: Record<string, unknown>;
}

// Document upsert payload
interface DocumentUpsertPayload {
	id: string;, caseId: string;, type: 'document' | 'evidence' | 'query';
	title: string;, content: string;, embedding: number[];, timestamp: string;
	[key: string]: unknown;
}

export class AdaptiveIndexOrchestrator {
	private ollamaUrl: string;
	private qdrantUrl: string;

	constructor() {
		this.ollamaUrl = getOllamaEndpoint();
		this.qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
	}

	/**
	 * Decide routing based on context
	 */
	async decideRouting(context: {, caseId: string;, fileSize: number;, textLength: number;
	}): Promise<RoutingDecision> {
		// Simple heuristic-based routing
		if (context.fileSize > 1024 * 256) return 'gpu';
		if (context.textLength > 10000) return 'gpu';
		return 'cpu';
	}

	/**
	 * Record outcome for learning
	 */
	async recordOutcome(taskId: string, success: boolean, latency: number): Promise<void> {
		console.log(`Task ${taskId}: success=${success}, latency=${latency}ms`);
	}

	/**
	 * Predict routing using neural router
	 */
	public async predictRouting(features: RouterInputFeatures): Promise<RoutingLogits> {
		const start = performance.now();

		// Default routing logits
		const routingLogits: RoutingLogits = {
			useGpu: 0.5,
			useCpu: 0.5,
			useQuic: 0.1,
			useRest: 0.9,
			cacheHit: 0.3,
			reindex: 0.1,
			useQdrantForStorage: 0.1,
			usePgVectorForStorage: 0.9
		};

		try {
			// Construct prompt for Gemma 3
			const prompt = `Given the following system metrics for case ${features.caseId}: -, Latency: ${features.queryLatencyMs}ms
- Feedback: ${features.userFeedbackScore}
- Cost: ${features.embeddingCostUsd}
- GPU Load: ${features.gpuLoadPercent}%
- Variance: ${features.similarityScoreVariance}
- Cache Rate: ${features.cacheHitRate}
- Size: ${features.fileSizeKb}KB
- Type: ${features.docType}
- Density: ${features.vectorDensity}
- Confidence: ${features.ragConfidence}
- Length: ${features.textLength}
- Vector Count: ${features.currentVectorCount}

Predict optimal routing probabilities as JSON:
{"useGpu": 0.X, "useCpu": 0.X, "useQuic": 0.X, "useRest": 0.X, "cacheHit": 0.X, "reindex": 0.X, "useQdrantForStorage": 0.X, "usePgVectorForStorage": 0.X}`;

			const url = `${this.ollamaUrl}/api/generate`;
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, model: 'gemma3',
					prompt,
					options: {, temperature: 0.1,
						num_ctx: 4096
					},
					stream: false
				})
			});

			const data = await res.json();
			const responseText = data?.response as string;

			// Parse JSON from response
			const jsonMatch = responseText?.match(/\{[^}]+\}/);
			if (jsonMatch) {
				try {
					const parsedLogits = JSON.parse(jsonMatch[0]) as Partial<RoutingLogits>;
					Object.assign(routingLogits, parsedLogits);
					console.log('Gemma-derived logits:', routingLogits);
				} catch (parseError) {
					console.warn('Failed to parse Gemma routing logits:', parseError);
				}
			}
		} catch (e) {
			console.error('Failed to get routing prediction from Ollama:', e);
		}

		console.log(`Routing prediction took ${performance.now() - start}ms`);
		return routingLogits;
	}

	/**
	 * Upsert embedding to Qdrant
	 */
	private async upsertToQdrant(
		item: EmbeddingOrchestrationPayload,
		embedding: number[]
	): Promise<void> {
		const collectionName = process.env.QDRANT_COLLECTION_NAME || 'legal_docs';
		const qdrantUpsertUrl = `${this.qdrantUrl}/collections/${collectionName}/points?wait=true`;

		try {
			const response = await fetch(qdrantUpsertUrl, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, points: [
						{
							id: item.id,
							vector: embedding,
							payload: {, caseId: item.caseId,
								type: item.type,
								title: item.title ?? '',
								content_preview: item.text.substring(0, 500),
								timestamp: new Date().toISOString(),
								...item.metadata
							}
						}
					]
				})
			});

			if (!response.ok) {
				const errorBody = await response.text();
				throw new Error(`Qdrant upsert failed: ${response.status} - ${errorBody}`);
			}

			console.log(`Embedding for ${item.type}:${item.id} upserted to Qdrant collection '${collectionName}'.`);
		} catch (e) {
			console.error('Failed to upsert embedding to Qdrant:', e);
			throw e;
		}
	}

	/**
	 * Orchestrate embedding generation
	 */
	public async orchestrateEmbedding(
		item: EmbeddingOrchestrationPayload
	): Promise<number[] | undefined> {
		const start = performance.now();
		let embedding: number[] | undefined;
		let decisionSource = 'default';

		// Collect features for router
		const routerFeatures: RouterInputFeatures = {
			queryLatencyMs: 100,
			userFeedbackScore: 4,
			embeddingCostUsd: 0.0001,
			gpuLoadPercent: Math.random() * 100,
			similarityScoreVariance: 0.1,
			cacheHitRate: 0.5,
			fileSizeKb: item.text.length / 1024,
			docType: item.type,
			vectorDensity: 0.7,
			ragConfidence: 0.8,
			textLength: item.text.length,
			caseId: item.caseId,
			currentVectorCount: Math.floor(Math.random() * 2_000_000)
		};

		const routingDecision = await this.predictRouting(routerFeatures);

		// Try Ollama REST API for embeddings
		try {
			const url = `${this.ollamaUrl}/api/embeddings`;
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, model: 'embeddinggemma:latest',
					prompt: item.text
				})
			});

			const data = await res.json();
			if (data?.embedding && Array.isArray(data.embedding)) {
				embedding = data.embedding as number[];
				decisionSource = 'ollama-rest';
				console.log(`Embedding for ${item.type}:${item.id} generated via Ollama.`);
			} else {
				console.error('Ollama embedding API returned no embedding:', data);
			}
		} catch (e) {
			console.error('Ollama embedding failed:', e);
		}

		// Store embedding if generated
		if (embedding) {
			// Store in Qdrant if configured
			if (routingDecision.useQdrantForStorage > 0.5 || process.env.ENABLE_QDRANT_UPSERT === 'true') {
				try {
					await this.upsertToQdrant(item, embedding);
				} catch (e) {
					// Error already logged
				}
			}
		} else {
			console.error(`Failed to generate embedding for ${item.type}:${item.id}`);
		}

		console.log(`Embedding orchestration took ${performance.now() - start}ms, source: ${decisionSource}`);
		return embedding;
	}
}

export const adaptiveIndexOrchestrator = new AdaptiveIndexOrchestrator();
