import { json } from '@sveltejs/kit';
import { getOllamaUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types.js';
import { apiResponses } from '$lib/server/api/response-helper.js';
import { embedRateLimiter } from '$lib/server/middleware/rate-limiter.js';
import { acquireGpuLease } from '$lib/server/inference/gpu-arbiter.js';

const OLLAMA_URL = getOllamaUrl();

interface EmbedRequest {
	text: string;
	model?: 'embeddinggemma' | 'nomic' | 'mock';
	dimensions?: number;
}

interface EmbedResponse {
	embedding: number[];
	model: string;
	dimensions: number;
	tokens?: number;
}

/**
 * Generate embedding via Ollama (embeddinggemma:latest primary, nomic-embed-text fallback)
 */
async function getOllamaEmbedding(
	text: string,
	model: string = 'embeddinggemma:latest'
): Promise<{ embedding: number[] }> {
	const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model, prompt: text }),
		signal: AbortSignal.timeout(10_000),
	});

	if (!response.ok) {
		throw new Error(`Ollama embedding error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	return { embedding: Array.isArray(data.embedding) ? data.embedding : [] };
}

export const POST: RequestHandler = async ({ request }) => {
	// Rate limit: 60 requests/min per client
	const rateCheck = embedRateLimiter.check(request);
	if (!rateCheck.allowed) {
		return apiResponses.serviceUnavailable(
			`Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetTime - Date.now()) / 1000)}s`
		);
	}

	try {
		const { text, model = 'embeddinggemma', dimensions }: EmbedRequest = await request.json();

		if (!text || typeof text !== 'string') {
			return apiResponses.badRequest('Text is required and must be a string');
		}

		if (text.length > 50000) {
			return apiResponses.badRequest('Text too long. Maximum 50,000 characters.');
		}

		// Acquire GPU lease for Ollama embeddings (non-blocking)
		if (model !== 'mock') {
			await acquireGpuLease('ollama', 30).catch(() => null);
		}

		let result: EmbedResponse;

		switch (model) {
			case 'embeddinggemma': {
				const { embedding } = await getOllamaEmbedding(text, 'embeddinggemma:latest');
				result = { embedding, model: 'embeddinggemma:latest', dimensions: embedding.length };
				break;
			}
			case 'nomic': {
				const { embedding } = await getOllamaEmbedding(text, 'nomic-embed-text:latest');
				result = { embedding, model: 'nomic-embed-text:latest', dimensions: embedding.length };
				break;
			}
			case 'mock': {
				const targetDim = dimensions || 768;
				const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
				const embedding = Array.from(
					{ length: targetDim },
					(_, i) => Math.sin((hash + i) / 100) * 0.5
				);
				result = { embedding, model: 'mock-embeddings', dimensions: targetDim, tokens: text.split(' ').length };
				break;
			}
			default:
				return apiResponses.badRequest(`Unsupported model: ${model}. Use 'embeddinggemma', 'nomic', or 'mock'`);
		}

		if (dimensions && dimensions < result.embedding.length) {
			result.embedding = result.embedding.slice(0, dimensions);
			result.dimensions = dimensions;
		}

		return json(result);
	} catch (err) {
		console.error('Embedding error:', err);
		return apiResponses.serverError('Failed to generate embedding');
	}
};

export const GET: RequestHandler = async () => {
	return apiResponses.ok({
		message: 'Embedding API endpoint',
		methods: ['POST'],
		models: ['embeddinggemma', 'nomic', 'mock'],
		maxTextLength: 50000,
		ollamaUrl: OLLAMA_URL,
	});
};
