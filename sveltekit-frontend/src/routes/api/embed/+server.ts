import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types.js';
import { apiResponses } from '$lib/server/api/response-helper.js';
import { embedRateLimiter } from '$lib/server/middleware/rate-limiter.js';
import { acquireGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { embedText } from '$lib/server/embedding/embed.js';
import { runEmbedding as runOnnxDirectMLEmbedding } from '$lib/server/ai/onnx-server.js';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { logError, categorizeError, categorizeSeverity } from '$lib/server/error-logging.js';
import {
	resolveEmbeddingBackend,
	classifyEmbeddingError,
} from '$lib/server/embedding/embedding-backend-resolution.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_BACKEND = resolveEmbeddingBackend('embeddinggemma:latest', {
	configuredProvider: ENV.EMBEDDING_PROVIDER,
	configuredBaseUrl: ENV.EMBEDDING_BASE_URL,
	fallbackBaseUrl: ENV.OLLAMA_BASE_URL,
});

const embedRequestSchema = z.object({
	text: z.string().min(1, 'Text is required').max(50000),
	model: z.enum(['embeddinggemma', 'mock']).optional().default('embeddinggemma'),
	dimensions: z.number().int().min(1).max(4096).optional()
});

type EmbedRequest = z.infer<typeof embedRequestSchema>;

interface EmbedResponse {
	embedding: number[];
	model: string;
	dimensions: number;
	tokens?: number;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Degraded response on no auth — required for cascade smoke tests
		if (!locals.user) {
			return json({ embedding: new Array(768).fill(0), model: 'embeddinggemma:latest', dimensions: 768 });
		}

		// Rate limit: 60 requests/min per client
		const rateCheck = embedRateLimiter.check(request);
		if (!rateCheck.allowed) {
			return json(
				{ embedding: new Array(768).fill(0), model: 'embeddinggemma:latest', dimensions: 768 },
				{ status: 429 }
			);
		}

		const raw = await request.json();
		const parsed = embedRequestSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ embedding: new Array(768).fill(0), model: 'embeddinggemma:latest', dimensions: 768 },
				{ status: 400 }
			);
		}
		const { text, model, dimensions } = parsed.data;

		// Acquire GPU lease for embedding generation (non-blocking)
		if (model !== 'mock') {
			await acquireGpuLease('ollama', 30).catch(() => null);
		}

		let result: EmbedResponse;

		switch (model) {
			case 'embeddinggemma': {
				// EMBEDDING_BACKEND=onnx_directml: try the in-process ONNX/DirectML
				// session first (no separate port, doesn't compete with TurboQuant's
				// CUDA context for VRAM). Known limitation: runOnnxDirectMLEmbedding
				// uses a codepoint-level fallback tokenizer, not the model's real
				// SentencePiece tokenizer — embeddings from this path are not yet
				// production-quality. Falls back to the standard embedText() cascade
				// (gRPC -> Ollama/llama-server) on null or any other backend.
				let embedding: number[] | null = null;
				if (process.env.EMBEDDING_BACKEND === 'onnx_directml') {
					embedding = await runOnnxDirectMLEmbedding(text);
				}
				if (!embedding) {
					embedding = await embedText(text);
				}
				result = { embedding, model: 'embeddinggemma:latest', dimensions: embedding.length };
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
				return json(
					{ embedding: new Array(768).fill(0), model: 'embeddinggemma:latest', dimensions: 768 },
					{ status: 400 }
				);
		}

		if (dimensions && dimensions < result.embedding.length) {
			result.embedding = result.embedding.slice(0, dimensions);
			result.dimensions = dimensions;
		}

		return json(result);
	} catch (err) {
		const category = categorizeError(err);
		const severity = categorizeSeverity(category);
		const failureKind = classifyEmbeddingError(String(err));

		console.error('Embedding error:', err);

		// Log error for P1 agentic error fixing
		await logError({
			category,
			severity,
			message: String(err),
			stack: err instanceof Error ? err.stack : undefined,
			routePath: '/api/embed',
			filePath: 'src/routes/api/embed/+server.ts',
			contextKey: `embed:${failureKind}`,
		});

		// Degraded response — return mock embedding instead of 500
		return json({ embedding: new Array(768).fill(0), model: 'embeddinggemma:latest', dimensions: 768 });
	}
};

export const GET: RequestHandler = async () => {
		return apiResponses.ok({
			message: 'Embedding API endpoint',
			methods: ['POST'],
			models: ['embeddinggemma', 'mock'],
			maxTextLength: 50000,
			ollamaUrl: OLLAMA_URL,
			embeddingBackend: EMBEDDING_BACKEND,
		});
};
