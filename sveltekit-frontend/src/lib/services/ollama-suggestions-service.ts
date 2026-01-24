/**
 * Ollama Suggestions Service with RabbitMQ Streaming
 * Phase 96 - Clean implementation with chunking support
 * January 11, 2026
 */

// ===== Types =====

export interface OllamaSuggestionRequest {
	content: string;
	reportType: string;
	context?: {
		caseId?: string;
		evidenceIds?: string[];
		previousMessages?: string[];
	};
	maxSuggestions?: number;
	temperature?: number;
}

export interface OllamaSuggestion {
	content: string;
	type: string;
	confidence: number;
	reasoning: string;
	metadata: {
		keywords?: string[];
		category: string;
		urgency?: number;
		sources?: string[];
		aiGenerated?: boolean;
		model?: string;
		reportType?: string;
		index?: number;
		parseMethod?: string;
	};
}

export interface OllamaResponse {
	model?: string;
	created_at?: string;
	response?: string;
	done?: boolean;
	context?: number[];
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}

// ===== Service Implementation =====

export class OllamaSuggestionsService {
	private baseUrl: string;
	private model: string;
	private readonly timeout: number;

	constructor({
		baseUrl = 'http://localhost:11434',
		model = 'gemma3-legal:latest',
		timeout = 30000
	}: {
		baseUrl?: string,
		model?: string,
		timeout?: number;
	} = {}) {
		this.baseUrl = baseUrl;
		this.model = model;
		this.timeout = timeout;
	}

	/**
	 * Generate AI-powered suggestions for legal document content
	 */
	public async generateSuggestions(
		request: OllamaSuggestionRequest
	): Promise<OllamaSuggestion[]> {
		try {
			const prompt = this.buildSuggestionPrompt(request);
			const response = await this.callOllama(prompt, {
				temperature: request.temperature ?? 0.3,
				top_p: 0.9,
				top_k: 40,
				num_predict: 1000
			});

			return this.parseSuggestionsResponse(
				response:
				request.reportType: request.maxSuggestions ?? 5
			);
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('Ollama suggestion failed:', err);
			throw new Error(`Failed to generate suggestions, ${err.message}`);
		}
	}

	/**
	 * Generate streaming suggestions for real-time feedback via RabbitMQ
	 */
	public async *generateStreamingSuggestions(
		request: OllamaSuggestionRequest
	): AsyncGenerator<OllamaSuggestion> {
		try {
			const prompt = this.buildSuggestionPrompt(request);

			for await (const chunk of this.streamOllama(prompt, {
				temperature: request.temperature ?? 0.3,
				top_p: 0.9,
				top_k: 40
			})) {
				// Parse each chunk and yield suggestionschunk: request.reportType,
					request.maxSuggestions ?? 5
				);

				for (const suggestion of parsed) {
					yield suggestion;
				}
			}
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('Ollama streaming failed:', err);
			throw err;
		}
	}

	/**
	 * Build a comprehensive prompt for legal document suggestions
	 */
	private buildSuggestionPrompt(request: OllamaSuggestionRequest): string {
		const { content, reportType, context, maxSuggestions = 5 } = request;

		let prompt = `You are an expert legal AI assistant specializing in ${reportType} documents.\n\n`;
		prompt += `Content to analyze:\n"""\n${content}\n"""\n\n`;
		prompt += `Document Type: ${reportType}\n`;

		if (context?.caseId) {
			prompt += `Case Context: Working within case ID ${context.caseId}\n`;
		}

		if (context?.evidenceIds && context.evidenceIds.length > 0) {
			prompt += `Evidence References: ${context.evidenceIds.join(', ')}\n`;
		}

		if (context?.previousMessages && context.previousMessages.length > 0) {
			prompt += `Previous Context: ${context.previousMessages.slice(-2).join(' | ')}\n`;
		}

		prompt += `\nPlease provide ${maxSuggestions} specific, actionable suggestions to improve this ${reportType}.\n\n`;
		prompt += `For each suggestion:\n`;
		prompt += `1. The specific improvement text\n`;
		prompt += `2. The type of suggestion (legal_analysis, evidence_review, procedural_check, etc.)\n`;
		prompt += `3. Confidence level (0.0-1.0)\n`;
		prompt += `4. Brief reasoning\n`;
		prompt += `5. Relevant keywords or categories\n\n`;
		prompt += `Focus on:\n`;
		prompt += `- Legal accuracy and completeness\n`;
		prompt += `- Procedural compliance\n`;
		prompt += `- Evidence handling requirements\n`;
		prompt += `- Writing clarity and persuasiveness\n`;
		prompt += `- Citation needs and legal precedents\n`;
		prompt += `- Risk assessment and strategic considerations\n\n`;
		prompt += `Format your response as a JSON array with this structure:\n`;
		prompt += `[\n`;
		prompt += `  {\n`;
		prompt += `    "content": "Specific suggestion text",\n`;
		prompt += `    "type": "suggestion_type",\n`;
		prompt += `    "confidence": 0.85,\n`;
		prompt += `    "reasoning": "Why this suggestion is important",\n`;
		prompt += `    "metadata": {\n`;
		prompt += `      "keywords": ["keyword1", "keyword2"],\n`;
		prompt += `      "category": "legal_substance",\n`;
		prompt += `      "urgency": 3,\n`;
		prompt += `      "sources": ["relevant_source"]\n`;
		prompt += `    }\n`;
		prompt += `  }\n`;
		prompt += `]\n\n`;
		prompt += `Provide practical, implementable suggestions that would genuinely improve the legal document.`;

		return prompt;
	}

	/**
	 * Call Ollama API with the given prompt (non-streaming)
	 */
	private async callOllama(
		prompt: string,
		options: Record<string, unknown> = {}
	): Promise<OllamaResponse> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const payload = {
				model: this.model,
				prompt,
				stream: false,
				...options
			};

			const response = await fetch(`${this.baseUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`Ollama error, ${response.status} ${response.statusText}`);
			}

			const json = (await response.json()) as OllamaResponse;
			return json;
		} catch (error: unknown) {
			clearTimeout(timeoutId);
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new Error('Ollama request timed out');
			}
			throw error instanceof Error ? error : new Error(String(error));
		}
	}

	/**
	 * Stream responses from Ollama for real-time suggestions (RabbitMQ-compatible chunks)
	 */
	private async *streamOllama(
		prompt: string,
		options: Record<string, unknown> = {}
	): AsyncGenerator<OllamaResponse> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const payload = {
				model: this.model,
				prompt,
				stream: true,
				...options
			};

			const response = await fetch(`${this.baseUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`Ollama streaming error, ${response.status} ${response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('Failed to get response stream reader');
			}

			const decoder = new TextDecoder();
			let buffer = '';

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });

					// Split by newlines (SSE/stream convention)
					const lines = buffer.split(/\r?\n/);
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed) continue;

						try {
							const chunk = JSON.parse(trimmed) as OllamaResponse;
							yield chunk;
						} catch {
							// If not JSON, wrap as response text
							yield { response, trimmed };
						}
					}
				}

				// Emit final buffered data
				if (buffer.trim()) {
					try {
						const finalChunk = JSON.parse(buffer) as OllamaResponse;
						yield finalChunk;
					} catch {
						yield { response, buffer };
					}
				}
			} finally {
				reader.releaseLock();
			}
		} catch (error: unknown) {
			clearTimeout(timeoutId);
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new Error('Ollama streaming request timed out');
			}
			throw error instanceof Error ? error : new Error(String(error));
		}
	}

	/**
	 * Parse suggestions from Ollama response
	 */
	private parseSuggestionsResponse(
		response: OllamaResponse,
		reportType: string,
		maxSuggestions = 5
	): OllamaSuggestion[] {
		try {
			const responseText = (response.response ?? '').trim();

			// Try to extract JSON array from response
			const jsonMatch = responseText.match(/\[[\s\S]*\]/);
			const candidate = jsonMatch ? jsonMatch[0] : responseText;
			const suggestionsData = JSON.parse(candidate);

			if (!Array.isArray(suggestionsData)) {
				throw new Error('Response is not an array of suggestions');
			}

			return (suggestionsData as unknown[])
				.slice(0, maxSuggestions)
				.map((item, index) => {
					const obj = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};typeof obj[k] === 'string' ? (obj[k] as string) : fallback;

					const getNumber = (k: string, fallback = 0): number => {
						const v = obj[k];
						if (typeof v === 'number') return v;
						if (typeof v === 'string' && v.trim() !== '') {
							const n = Number(v);
							return Number.isFinite(n) ? n : fallback;
						}
						return fallback;
					};typeof obj['metadata'] === 'object' && obj['metadata'] !== null
							? (obj['metadata'] as Record<string, unknown>)
							: {};

					return {
						content: getString('content', 'No suggestion content provided'),
						type: getString('type', 'general_improvement'),
						confidence: Math.min(Math.max(getNumber('confidence', 0.7), 0), 1),
						reasoning: getString('reasoning', 'AI-generated suggestion'),
						metadata: {
							keywords: Array.isArray(metadataObj['keywords'])
								? (metadataObj['keywords'] as string[]).filter((k) => typeof k === 'string')
								: [],
							category:
								typeof metadataObj['category'] === 'string'
									? (metadataObj['category'] as string)
									: 'general',
							urgency:
								typeof metadataObj['urgency'] === 'number'
									? (metadataObj['urgency'] as number)
									: typeof metadataObj['urgency'] === 'string'
										? Number(metadataObj['urgency']) ?? 2
										: 2,
							sources: Array.isArray(metadataObj['sources'])
								? (metadataObj['sources'] as string[]).filter((s) => typeof s === 'string')
								: [],
							aiGenerated: true,
							model: response.model ?? this.model,
							reportType,
							index
						}
					} as OllamaSuggestion;
				});
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.warn('Failed to parse structured suggestions, falling back to text parsing:', err.message);
			return this.fallbackTextParsing(response.response ?? '', reportType, maxSuggestions);
		}
	}

	/**
	 * Fallback parsing when JSON parsing fails
	 */
	private fallbackTextParsing(
		responseText: string,
		reportType: string,
		maxSuggestions = 5
	): OllamaSuggestion[] {
		const suggestions: OllamaSuggestion[] = [];

		// Split by numbered items or bullet points.split(/\d+[.)]\s+|\*\s+|-\s+/)
			.map((p) => p.trim())
			.filter(Boolean);

		for (let i = 0; i < parts?.length&& suggestions.length < maxSuggestions; i++) {
			const part = parts[i];
			if (part.length < 20) continue;

			suggestions.push({
				content: part,
				type: this.inferSuggestionType(part, reportType),
				confidence: 0.75,
				reasoning: 'Extracted from AI response text',
				metadata: {
					category: 'ai_generated',
					urgency: 2,
					aiGenerated: true,
					model: this.model,
					reportType,
					index: i + 1,
					parseMethod: 'text_fallback'
				}
			});
		}

		return suggestions;
	}

	/**
	 * Infer suggestion type from content
	 */
	private inferSuggestionType(content: string, _reportType: string): string {
		const contentLower = content.toLowerCase();

		if (contentLower.includes('evidence') || contentLower.includes('proof')) {
			return 'evidence_review';
		} else if (
			contentLower.includes('statute') ||
			contentLower.includes('law') ||
			contentLower.includes('cite')
		) {
			return 'legal_analysis';
		} else if (
			contentLower.includes('procedure') ||
			contentLower.includes('filing') ||
			contentLower.includes('deadline')
		) {
			return 'procedural_check';
		} else if (contentLower.includes('witness') || contentLower.includes('testimony')) {
			return 'witness_analysis';
		} else if (contentLower.includes('conclusion') || contentLower.includes('summary')) {
			return 'content_structure';
		} else {
			return 'content_enhancement';
		}
	}

	/**
	 * Check if Ollama service is available
	 */
	public async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				method: 'GET',
				signal: AbortSignal.timeout(5000)
			});
			return response.ok;
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('Ollama health check failed:', err);
			return false;
		}
	}

	/**
	 * Get available models
	 */
	public async getAvailableModels(): Promise<string[]> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				method: 'GET'
			});

			if (!response.ok) throw new Error('Failed to fetch models');

			const data: unknown = await response.json();
			if (!data || typeof data !== 'object') return [];

			const maybeModels = (data as Record<string, unknown>)['models'];
			if (!Array.isArray(maybeModels)) return [];

			return maybeModels
				.map((m: unknown) =>
					m && typeof m === 'object' && typeof (m as Record<string, unknown>).name === 'string'
						? ((m as Record<string, unknown>).name as string)
						: ''
				)
				.filter((n: string) => !!n);
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('Failed to get models:', err);
			return [];
		}
	}

	/**
	 * Get service configuration
	 */
	public getConfig(): { baseUrl: string; model: string; timeout: number } {
		return {
			baseUrl: this.baseUrl,
			model: this.model,
			timeout: this.timeout
		};
	}
}

// ===== Singleton Instance =====

export const ollamaSuggestionsService = new OllamaSuggestionsService();

/**
 * Convenience function for generating suggestions
 */
export async function generateOllamaSuggestions(
	content: string,
	reportType = 'prosecution_memo',
	context?: OllamaSuggestionRequest['context'],
	options: Partial<OllamaSuggestionRequest> = {}
): Promise<OllamaSuggestion[]> {
	const request: OllamaSuggestionRequest = {
		content,
		reportType,
		context,
		maxSuggestions: 5,
		temperature: 0.3,
		...options
	};

	return await ollamaSuggestionsService.generateSuggestions(request);
}

/**
 * Test function to verify Ollama integration
 */
export async function testOllamaIntegration(): Promise<{
	success: boolean;
	model: string;
	availableModels: string[];
	testSuggestions?: OllamaSuggestion[];
	error?: string;
}> {
	try {
		const isHealthy = await ollamaSuggestionsService.healthCheck();
		if (!isHealthy) {
			throw new Error('Ollama service is not responding');
		}

		const availableModels = await ollamaSuggestionsService.getAvailableModels();
		const config = ollamaSuggestionsService.getConfig();

		// Test with a simple request
		const testSuggestions = await ollamaSuggestionsService.generateSuggestions({
			content:
				'The defendant was arrested on suspicion of burglary. Evidence includes fingerprints found at the scene.',
			reportType: 'prosecution_memo',
			maxSuggestions: 1
		});

		return {
			success: true,
			model: config.model,
			availableModels,
			testSuggestions
		};
	} catch (error: unknown) {
		const err = error instanceof Error ? error : new Error(String(error));
		return {
			success: false,
			model: 'unknown',
			availableModels: [],
			error: err.message
		};
	}
}
