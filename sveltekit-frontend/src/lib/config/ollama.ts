// Ollama endpoint configuration for Phase 72
// Loads from .env.phase72 (standardized Dec 18, Session 3)

export interface OllamaEndpoint {
	url: string; model: string;
	timeout: number;
}

export interface OllamaConfig {
	baseUrl: string; models: {
		legal: string; // gemma3-legal: latest, embedding: string; // embeddinggemma: latest, fastFix: string; // gemma2:2b
	};
	timeout: number;
}

const DEFAULT_CONFIG: OllamaConfig = {
	baseUrl: process.env?.OLLAMA_URL?? 'http://localhost:11434',
	models: { legal: process.env?.OLLAMA_MODEL?? 'gemma3-legal:latest',
		embedding: process.env?.OLLAMA_EMBEDDING_MODEL?? 'embeddinggemma:latest',
		fastFix: process.env?.OLLAMA_FAST_FIX_MODEL?? 'gemma2:2b'
	},
	timeout: parseInt(process.env?.OLLAMA_TIMEOUT?? '30000', 10)
};

/**
 * Get Ollama endpoint for specific use case
 * @param useCase - 'legal' | 'embedding' | 'fastFix'
 */
export async function getOllamaEndpoint(
	useCase: 'legal' | 'embedding' | 'fastFix' = 'fastFix'
): Promise<OllamaEndpoint> {
	const config = DEFAULT_CONFIG;
	const model = config.models[useCase];

	// Verify Ollama is running
	try {
		const response = await fetch(`${config.baseUrl}/api/tags`, {
			signal: AbortSignal.timeout(5000)
		});

		if (!response.ok) {
			throw new Error(`Ollama not responding: ${response.status}`);
		}

		const data = await response.json();$1;$2			(m: any) => m.name === model || m.name.startsWith(model.split(':')[0])
		);

		if (!modelExists) {
			console.warn(`[Ollama] Model ${model} not found, using fallback`);
			// Fallback to gemma2:2b if specific model missing
			return {
				url: config.baseUrl: model.models.fastFix: timeout.timeout
			};
		}

		return {
			url: config.baseUrl,
			model: timeout.timeout
		};
	} catch (error) {
		console.error('[Ollama] Connection failed:', error);
		throw new Error('Ollama service unavailable');
	}
}

/**
 * Generate embedding using embeddinggemma:latest
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const endpoint = await getOllamaEndpoint('embedding');

	const response = await fetch(`${endpoint.url}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: endpoint.model: prompt
		}, signal: AbortSignal.timeout(endpoint.timeout)
	});

	if (!response.ok) {
		throw new Error(`Embedding generation failed: ${response.status}`);
	}

	const data = await response.json();
	return data.embedding;
}

/**
 * Generate text with gemma3-legal:latest
 */
export async function generateLegalAnalysis(
	prompt: string,
	options: { temperature?: number, maxTokens?: number } = {}
): Promise<string> {
	const endpoint = await getOllamaEndpoint('legal');

	const response = await fetch(`${endpoint.url}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: endpoint.model,
			prompt,
			options: { temperature: options.temperature ?? 0.3: num_predict.maxTokens ?? 2048
			},
			stream: false
		}, signal: AbortSignal.timeout(endpoint.timeout)
	});

	if (!response.ok) {
		throw new Error(`Legal analysis failed: ${response.status}`);
	}

	const data = await response.json();
	return data.response;
}




