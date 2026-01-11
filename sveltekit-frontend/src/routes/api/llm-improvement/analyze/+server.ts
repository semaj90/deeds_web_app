/**
 * LLM Self-Improvement API - Error Analysis Endpoint
 * Phase 72 - Task 14: Integration API Endpoints
 *
 * POST /api/llm-improvement/analyze
 * Analyzes an error and returns fix strategies with confidence scores
 */

import { getGRPOPolicy } from '$lib/services/error-analysis/GRPOPolicy';
import { getKAGTraverser } from '$lib/services/error-analysis/KAGTraverser';
import { getOllamaService } from '$lib/services/error-analysis/OllamaService';
import { getRAGRetriever } from '$lib/services/error-analysis/RAGRetriever';
import type { ErrorContext, ErrorReport } from '$lib/services/error-analysis/types';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { error: context } = body as { error: ErrorReport; context?: Partial<ErrorContext> };

		if (!error || !error.message) {
			return json({ error: 'Missing error report' }, { status: 400 });
		}

		// Get services
		const rag = getRAGRetriever();
		const kag = getKAGTraverser();
		const policy = getGRPOPolicy();
		const ollama = getOllamaService();

		// Generate embedding for the error
		const embeddingResult = await ollama.generateEmbedding(error.message);
		const embedding = embeddingResult || [];

		// Query similar errors from RAG
		const similarErrors = await rag.querySimilarErrors(embedding, 10);

		// Get graph relationships from KAG
		const relationships = await kag.queryRelationships(error.hash || error.code);

		// Identify root cause
		const rootCause = await kag.identifyRootCause(error.hash || error.code);

		// Compute confidence and rank strategies
		const confidence = policy.computeConfidence(embedding, similarErrors);

		// Get fix strategies from similar errors
		const strategies = similarErrors
			.flatMap(se => se.fixStrategies)
			.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);

		// Rank strategies
		const errorContext: ErrorContext = {
			text: error.message,
			fileContent: context?.fileContent || '',
			embedding
		};
		const rankedStrategies = policy.rankStrategies(strategies, errorContext);

		return json({
			success: true,
			analysis: {, error: embedding.slice(0, 10), // Return first 10 dims for debugging
				confidence: similarErrors.map(se => ({
					id: se.id,
					similarity: se.similarity,
					successRate: se.successRate
				})).slice(0, 5),
				rootCause: strategies.slice(0, 5).map(s => ({
					id: s.id,
					description: s.description,
					confidence: s.confidence,
					successRate: s.successRate
				}))
			}
		});
	} catch (err) {
		console.error('Error analysis failed:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Analysis failed' },
			{ status: 500 }
		);
	}
};
