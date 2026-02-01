/**
 * Gemma Embedding Service
 * Provides embedding generation using Ollama with Gemma and nomic fallback
 */

import { getOllamaEndpoint } from '$lib/utils/ollama-endpoint';

// Types
type Metadata = Record<string, unknown>;

interface GemmaEmbeddingResult {
	success: boolean;
	embedding?: number[];
	metadata?: Metadata;
	error?: string;
	model?: string;
	processingTime?: number;
}

interface GemmaBatchResult {
	success: boolean;
	results?: GemmaEmbeddingResult[];
	summary?: {, total: number;
		successful: number;, failed: number;
		totalProcessingTime: number;
	};
	error?: string;
}

interface GemmaHealthResult {
	success: boolean;, available: boolean;
	model?: string;
	version?: string;
	error?: string;
}

interface ModelHierarchy {
	bestModel: string;, modelsStatus: Array<{
		model: string;, priority: number;
		available: boolean;, type: string;
		speed: string;
	}>;
	availableCount: number;, totalCount: number;
	hasGemmaModels: boolean;, hasFallback: boolean;
	recommendation: string;
}

export class GemmaEmbeddingService {
	private ollamaHost: string;
	private primaryModel: string;
	private fallbackModel: string;
	private availableModels: string[] = [];
	private timeout: number;
	private modelHierarchy: string[] = [
		'embeddinggemma:latest',
		'gemma3-legal:latest',
		'nomic-embed-text:latest'
	];

	constructor(
		ollamaHost?: string,
		primaryModel: string = 'embeddinggemma:latest',
		fallbackModel: string = 'nomic-embed-text:latest',
		timeout: number = 10000
	) {
		this.ollamaHost = ollamaHost || getOllamaEndpoint();
		this.primaryModel = primaryModel;
		this.fallbackModel = fallbackModel;
		this.timeout = timeout;

		this.refreshAvailableModels().catch((e) =>
			console.error('Failed to refresh models on init:', e)
		);
	}

	/**
	 * Refresh available models from Ollama
	 */
	private async refreshAvailableModels(): Promise<void> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		try {
			const response = await fetch(`${this.ollamaHost}/api/tags`, {
				method: 'GET',
				signal: controller.signal
			});

			if (response.ok) {
				const data = await response.json();
				if (Array.isArray(data?.models)) {
					this.availableModels = data.models.map((m: any) =>
						typeof m === 'string' ? m : m.name || String(m)
					);
				}
			}
		} catch (error) {
			console.warn(
				'Could not refresh available models:',
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private getBestAvailableModel(): string {
		for (const model of this.modelHierarchy) {
			if (this.availableModels.includes(model)) {
				return model;
			}
		}

		if (this.availableModels.includes(this.primaryModel)) {
			return this.primaryModel;
		}
		if (this.availableModels.includes(this.fallbackModel)) {
			return this.fallbackModel;
		}

		return this.primaryModel;
	}

	/**
	 * Generate a single embedding for a given text
	 */
	async generateEmbedding(
		text: string,
		metadata: Metadata = {}
	): Promise<GemmaEmbeddingResult> {
		const startTime = Date.now();

		try {
			await this.refreshAvailableModels();
			const selectedModel = this.getBestAvailableModel();

			const modelsToTry = [selectedModel];
			if (
				selectedModel !== this.fallbackModel &&
				this.availableModels.includes(this.fallbackModel)
			) {
				modelsToTry.push(this.fallbackModel);
			}

			let lastError: unknown = null;

			for (const model of modelsToTry) {
				const controller = new AbortController();
				const t = setTimeout(() => controller.abort(), this.timeout);

				try {
					console.log(`🧠 Trying embedding model: ${model}`);

					const response = await fetch(`${this.ollamaHost}/api/embed`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							model,
							input: text.trim()
						}),
						signal: controller.signal
					});

					if (!response.ok) {
						throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
					}

					const data = await response.json();
					const processingTime = Date.now() - startTime;

					let embedding: number[] = [];
					if (Array.isArray(data?.embeddings) && data.embeddings.length > 0) {
						embedding = data.embeddings[0] as number[];
					} else if (Array.isArray(data?.embedding)) {
						embedding = data.embedding as number[];
					} else {
						throw new Error('Invalid embedding response format');
					}

					const isGemmaModel = model.includes('gemma');
					const modelType = isGemmaModel ? 'gemma' : 'nomic';

					console.log(`✅ Successfully generated embedding using ${model} (${embedding.length}D)`);

					return {
						success: true,
						embedding,
						metadata: {, model: modelType,
							textLength: text.length,
							dimensions: embedding.length,
							priority: this.modelHierarchy.indexOf(model) + 1,
							...metadata
						},
						model,
						processingTime
					};
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.warn(`❌ Model ${model} failed:`, msg);
					lastError = err;
				} finally {
					clearTimeout(t);
				}
			}

			return {
				success: false,
				error: `All embedding models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
				metadata: {, modelsAttempted: modelsToTry, ...metadata },
				model: selectedModel,
				processingTime: Date.now() - startTime
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: `Embedding generation failed: ${msg}`,
				model: this.getBestAvailableModel(),
				processingTime: Date.now() - startTime
			};
		}
	}

	/**
	 * Generate batch embeddings
	 */
	async generateBatchEmbeddings(
		documents: Array<{ id?: string;, text: string; metadata?: Metadata }>,
		options: { batchSize?: number; concurrency?: number } = {}
	): Promise<GemmaBatchResult> {
		const startTime = Date.now();
		const { batchSize = 10, concurrency = 3 } = options;

		try {
			if (!documents || !Array.isArray(documents) || documents.length === 0) {
				return {
					success: false,
					error: 'Documents array is required and cannot be empty'
				};
			}

			const results: GemmaEmbeddingResult[] = [];
			const batches: typeof documents[] = [];

			for (let i = 0; i < documents.length; i += batchSize) {
				batches.push(documents.slice(i, i + batchSize));
			}

			for (let i = 0; i < batches.length; i += concurrency) {
				const currentBatches = batches.slice(i, i + concurrency);

				const batchPromises = currentBatches.map(async (batch) => {
					const batchResults = await Promise.allSettled(
						batch.map((doc) =>
							this.generateEmbedding(doc.text, {
								...(doc.metadata ?? {}),
								documentId: doc.id
							})
						)
					);

					return batchResults.map((r) => {
						if (r.status === 'fulfilled') {
							return r.value;
						} else {
							return {
								success: false,
								error: r.reason instanceof Error ? r.reason.message : String(r.reason)
							} as GemmaEmbeddingResult;
						}
					});
				});

				const resolvedBatches = await Promise.all(batchPromises);
				resolvedBatches.forEach((batch) => results.push(...batch));
			}

			const successful = results.filter((r) => r.success).length;
			const failed = results.length - successful;

			return {
				success: true,
				results,
				summary: {, total: documents.length,
					successful,
					failed,
					totalProcessingTime: Date.now() - startTime
				}
			};
		} catch (error) {
			return {
				success: false,
				error: `Batch processing failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<GemmaHealthResult & { modelHierarchy?: ModelHierarchy }> {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			let versionResponse;
			try {
				versionResponse = await fetch(`${this.ollamaHost}/api/version`, {
					method: 'GET',
					signal: controller.signal
				});
			} finally {
				clearTimeout(timeoutId);
			}

			if (!versionResponse.ok) {
				return {
					success: false,
					available: false,
					error: `Ollama not responding: ${versionResponse.status}`
				};
			}

			const versionData = await versionResponse.json();
			await this.refreshAvailableModels();
			const bestModel = this.getBestAvailableModel();

			const modelStatus = this.modelHierarchy.map((model, index) => ({
				model,
				priority: index + 1,
				available: this.availableModels.includes(model),
				type: this.getModelPerformance(model).type,
				speed: this.getModelPerformance(model).speed
			}));

			const availableCount = modelStatus.filter((m) => m.available).length;
			const hasGemma = modelStatus.some((m) => m.type === 'gemma' && m.available);
			const hasNomic = modelStatus.some((m) => m.type === 'nomic' && m.available);

			const hierarchy: ModelHierarchy = {
				bestModel,
				modelsStatus: modelStatus,
				availableCount,
				totalCount: this.modelHierarchy.length,
				hasGemmaModels: hasGemma,
				hasFallback: hasNomic,
				recommendation: hasGemma
					? 'Using fast Gemma models with nomic fallback'
					: hasNomic
						? 'Using reliable nomic-embed-text (no Gemma models available)'
						: 'No embedding models available'
			};

			return {
				success: true,
				available: availableCount > 0,
				model: bestModel,
				version: versionData.version,
				modelHierarchy: hierarchy,
				error: availableCount === 0 ? `No embedding models available` : undefined
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				available: false,
				error: `Health check failed: ${msg}`
			};
		}
	}

	/**
	 * Get performance characteristics for different models
	 */
	getModelPerformance(modelName: string): {, speed: 'fast' | 'medium' | 'slow';
		quality: 'high' | 'medium' | 'good';
		dimensions: number;, type: 'gemma' | 'nomic' | 'other';
	} {
		if (modelName.includes('embeddinggemma')) {
			return { speed: 'fast', quality: 'high', dimensions: 384, type: 'gemma' };
		}
		if (modelName.includes('gemma3-legal')) {
			return { speed: 'fast', quality: 'high', dimensions: 384, type: 'gemma' };
		}
		if (modelName.includes('nomic-embed-text')) {
			return { speed: 'medium', quality: 'good', dimensions: 768, type: 'nomic' };
		}
		return { speed: 'medium', quality: 'medium', dimensions: 768, type: 'other' };
	}

	/**
	 * Test embedding generation
	 */
	async testEmbeddingGeneration(): Promise<GemmaEmbeddingResult> {
		const testText = 'This is a test legal document for embedding generation validation.';
		return await this.generateEmbedding(testText, { test: true, purpose: 'validation' });
	}
}

// Singleton
let _gemmaEmbeddingService: GemmaEmbeddingService | null = null;

export function getGemmaEmbeddingService(): GemmaEmbeddingService {
	if (!_gemmaEmbeddingService) {
		_gemmaEmbeddingService = new GemmaEmbeddingService();
	}
	return _gemmaEmbeddingService;
}
