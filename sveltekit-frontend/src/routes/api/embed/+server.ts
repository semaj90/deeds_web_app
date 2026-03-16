import { json } from '@sveltejs/kit';
import { getOllamaUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types.js';
import { apiResponses } from '$lib/server/api/response-helper.js';
import { embedRateLimiter } from '$lib/server/middleware/rate-limiter.js';
import { acquireGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { embedText } from '$lib/server/embedding/embed.js';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = getOllamaUrl();

const embedRequestSchema = z.object({
	text: z.string().min(1, 'Text is required').max(50000),
	model: z.enum(['embeddinggemma', 'nomic', 'mock']).optional().default('embeddinggemma'),
	dimensions: z.number().int().min(1).max(4096).optional()
});

type EmbedRequest = z.infer<typeof embedRequestSchema>;

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
	return traceEmbedding(text, model, async () => {
		const response = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
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
	});
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
		const raw = await request.json();
		const parsed = embedRequestSchema.safeParse(raw);
		if (!parsed.success) {
			return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const { text, model, dimensions } = parsed.data;

		// Acquire GPU lease for Ollama embeddings (non-blocking)
		if (model !== 'mock') {
			await acquireGpuLease('ollama', 30).catch(() => null);
		}

		let result: EmbedResponse;

		switch (model) {
			case 'embeddinggemma': {
				const embedding = await embedText(text);
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
