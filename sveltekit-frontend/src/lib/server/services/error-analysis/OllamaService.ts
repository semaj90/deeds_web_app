/**
 * Ollama Service for LLM Self-Improvement System
 * Phase 72 - Task 2: Ollama Integration Enhancement
 */

import type { ErrorReport } from './types.js';

export interface OllamaConfig {
	url: string;
	embeddingModel: string;
	generationModel: string;
	timeout: number;
	maxRetries: number;
	retryDelay: number;
}

export interface EmbeddingResult {
	embedding: number[];
	model: string;
	promptTokens?: number;
}

export interface GenerationResult {
	response: string;
	model: string;
	totalDuration?: number;
	promptTokens?: number;
	responseTokens?: number;
}

export class OllamaService {
	private config: OllamaConfig;
	private available: boolean = false;
	private initPromise: Promise<void>;
	private stats = {
		embeddingRequests: 0,
		embeddingSuccesses: 0,
		embeddingFailures: 0,
		generationRequests: 0,
		generationSuccesses: 0,
		generationFailures: 0,
		totalRetries: 0
	};

	constructor(config?: Partial<OllamaConfig>) {
		this.config = {
			url: config?.url ?? process.env?.OLLAMA_URL ?? 'http://localhost:11434',
			embeddingModel: config?.embeddingModel ?? process.env?.OLLAMA_EMBEDDING_MODEL ?? 'embeddinggemma:latest',
			generationModel: config?.generationModel ?? process.env?.OLLAMA_MODEL ?? 'gemma4-legal:latest',
			timeout: config?.timeout ?? 30000,
			maxRetries: config?.maxRetries ?? 3,
			retryDelay: config?.retryDelay ?? 1000
		};
		this.initPromise = this.initialize();
	}

	static getOllamaEndpoint(): OllamaConfig {
		return {
			url: process.env?.OLLAMA_URL ?? 'http://localhost:11434',
			embeddingModel: process.env?.OLLAMA_EMBEDDING_MODEL ?? 'embeddinggemma:latest',
			generationModel: process.env?.OLLAMA_MODEL ?? 'gemma4-legal:latest',
			timeout: 30000,
			maxRetries: 3,
			retryDelay: 1000
		};
	}

	private async initialize(): Promise<void> {
		try {
			const healthy = await this.healthCheck();
			this.available = healthy;
			if (healthy) {
				console.log('OllamaService: Connected to ' + this.config.url);
			} else {
				console.warn('OllamaService: Ollama not available at ' + this.config.url);
			}
		} catch (error) {
			console.warn('OllamaService: Failed to connect - ' + (error instanceof Error ? error.message : String(error)));
			this.available = false;
		}
	}

	async waitForInit(): Promise<void> {
		await this.initPromise;
	}

	async healthCheck(): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);
			const response = await fetch(this.config.url + '/api/tags', {
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			return response.ok;
		} catch {
			return false;
		}
	}

	async isModelAvailable(model: string): Promise<boolean> {
		try {
			const response = await fetch(this.config.url + '/api/tags');
			if (!response.ok) return false;
			const data = await response.json();
			const models = data?.models || [];
			return models.some((m: any) => m.name === model || m.name.startsWith(model.split(':')[0]));
		} catch {
			return false;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async generateEmbedding(text: string): Promise<number[] | null> {
		if (!this.available) {
			await this.waitForInit();
			if (!this.available) return null;
		}

		this.stats.embeddingRequests++;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

				const response = await fetch(this.config.url + '/api/embeddings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: this.config.embeddingModel,
						prompt: text
					}),
					signal: controller.signal
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error('HTTP ' + response.status + ': ' + (await response.text()));
				}

				const data = await response.json();

				if (data?.embedding && Array.isArray(data.embedding)) {
					this.stats.embeddingSuccesses++;
					return data.embedding;
				}

				throw new Error('Invalid embedding response');
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < this.config.maxRetries - 1) {
					this.stats.totalRetries++;
					const delay = this.config.retryDelay * Math.pow(2, attempt);
					await this.sleep(delay);
				}
			}
		}

		this.stats.embeddingFailures++;
		console.warn('Embedding failed after ' + this.config.maxRetries + ' attempts: ' + lastError?.message);
		return null;
	}

	async generateEmbeddingsBatch(texts: string[], batchConcurrency: number = 5): Promise<(number[] | null)[]> {
		const results: (number[] | null)[] = [];

		for (let i = 0; i < texts.length; i += batchConcurrency) {
			const batch = texts.slice(i, i + batchConcurrency);
			const batchResults = await Promise.all(
				batch.map((t: any) => this.generateEmbedding(t))
			);
			results.push(...batchResults);

			if (i + batchConcurrency < texts.length) {
				await this.sleep(50);
			}
		}

		return results;
	}

	async generate(prompt: string, system?: string): Promise<string | null> {
		if (!this.available) {
			await this.waitForInit();
			if (!this.available) return null;
		}

		this.stats.generationRequests++;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.config.timeout * 2);

				const body: any = {
					model: this.config.generationModel,
					prompt: prompt,
					stream: false
				};
				if (system) {
					body.system = system;
				}

				const response = await fetch(this.config.url + '/api/generate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
					signal: controller.signal
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error('HTTP ' + response.status + ': ' + (await response.text()));
				}

				const data = await response.json();

				if (data.response) {
					this.stats.generationSuccesses++;
					return data.response;
				}

				throw new Error('Invalid generation response');
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < this.config.maxRetries - 1) {
					this.stats.totalRetries++;
					const delay = this.config.retryDelay * Math.pow(2, attempt);
					await this.sleep(delay);
				}
			}
		}

		this.stats.generationFailures++;
		console.warn('Generation failed after ' + this.config.maxRetries + ' attempts: ' + lastError?.message);
		return null;
	}

	async generateFixSuggestion(
		error: ErrorReport,
		similarErrors: { message: string; fix?: string }[] = []
	): Promise<string | null> {
		const fewShotExamples = similarErrors
			.filter((e: any) => e.fix)
			.slice(0, 3)
			.map((e: any, i: number) => 'Example ' + (i + 1) + ':\nError: ' + e.message + '\nFix: ' + e.fix)
			.join('\n\n');

		const parts = [];
		if (fewShotExamples) {
			parts.push('Here are similar errors and their fixes:\n' + fewShotExamples + '\n');
		}
		parts.push('Current Error:');
		parts.push('File: ' + error.file);
		parts.push('Line: ' + error.line);
		parts.push('Code: ' + error.code);
		parts.push('Message: ' + error.message);
		parts.push('');
		parts.push('Provide a concise fix suggestion. Focus on the specific code change needed.');

		const prompt = parts.join('\n');
		const system = 'You are a code fixing assistant. Provide direct, actionable fixes without explanation. Output only the fix.';

		return this.generate(prompt, system);
	}

	getStats() {
		return {
			available: this.available,
			config: {
				url: this.config.url,
				embeddingModel: this.config.embeddingModel,
				generationModel: this.config.generationModel
			},
			...this.stats,
			embeddingSuccessRate: this.stats.embeddingRequests > 0
				? ((this.stats.embeddingSuccesses / this.stats.embeddingRequests) * 100).toFixed(1) + '%'
				: 'N/A',
			generationSuccessRate: this.stats.generationRequests > 0
				? ((this.stats.generationSuccesses / this.stats.generationRequests) * 100).toFixed(1) + '%'
				: 'N/A'
		};
	}

	isAvailable(): boolean {
		return this.available;
	}
}

/**
 * Singleton instance
 */
let ollamaServiceInstance: OllamaService | null = null;

/**
 * Get or create OllamaService singleton
 */
export function getOllamaService(config?: Partial<OllamaConfig>): OllamaService {
	if (!ollamaServiceInstance) {
		ollamaServiceInstance = new OllamaService(config);
	}
	return ollamaServiceInstance;
}

/**
 * Helper function to get Ollama endpoint configuration
 */
export function getOllamaEndpoint(): OllamaConfig {
	return OllamaService.getOllamaEndpoint();
}