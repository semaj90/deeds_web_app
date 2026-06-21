import { json } from '@sveltejs/kit';
import { ollamaFetch } from '$lib/server/ollama.js';
import type { RequestHandler } from './$types';
import type {
	AnswerRequest,
	AnswerWithCitations,
	Citation,
	ActionItem
} from '$lib/types/rag-source-validation';
import { getRedis } from '$lib/server/redis.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import { getOllamaEndpoint } from '$lib/server/utils/ollama-endpoint.js';
import { z } from 'zod';
import { trackTokenUsage } from '$lib/server/ai/token-tracker.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

const OLLAMA_URL = getOllamaEndpoint();

const ragAnswerSchema = z.object({
	context_id: z.string().min(1, 'context_id is required').max(200),
	query: z.string().min(1, 'query is required').max(5000),
	case_id: z.string().uuid('Invalid case_id'),
	max_tokens: z.number().int().min(64).max(8192).optional().default(2048),
	temperature: z.number().min(0).max(2).optional().default(0.3),
	include_citations: z.boolean().optional().default(true),
	include_todos: z.boolean().optional().default(false),
	jurisdiction: z.string().max(200).optional(),
	legal_area: z.string().max(200).optional()
});

/**
 * POST /api/rag/answer
 * Step 3: Generate answer with citations from approved context via Ollama
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const startTime = performance.now();

	try {
		const raw = await request.json();
		const parsed = ragAnswerSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}
		const {
			context_id,
			query,
			case_id,
			max_tokens,
			temperature,
			include_citations,
			include_todos,
			jurisdiction,
			legal_area
		} = parsed.data;
		recordSearchQuery({ query, pipeline: 'rag', cacheHit: false, userId: locals.user.id });

		// Fetch approved context from Redis (stored by /api/rag/validate)
		let combinedContext = '';
		let contextChunks: { source_title?: string }[] = [];
		try {
			const redis = getRedis();
			const cached = await redis.get(`rag:context:${context_id}`);
			if (cached) {
				const parsed = JSON.parse(cached);
				combinedContext = parsed.combined_context ?? '';
				contextChunks = parsed.chunks ?? [];
			}
		} catch {
			// Redis unavailable — try PostgreSQL fallback below
		}

		// PostgreSQL fallback: if Redis miss, try DB lookup (durable persistence)
		if (!combinedContext) {
			try {
				const { db: pgDb } = await import('$lib/server/db/client');
				const { ragSessions } = await import('$lib/server/db/schema-postgres.js');
				const { eq: eqOp } = await import('drizzle-orm');
				const rows = await pgDb.select().from(ragSessions)
					.where(eqOp(ragSessions.id, context_id)).limit(1);
				if (rows[0]?.title) {
					combinedContext = rows[0].title;
				}
			} catch {
				// Both Redis and PG unavailable — answer without context (degraded)
			}
		}

		// Build the prompt with retrieved context
		let systemPrompt =
			'You are a legal research assistant. Provide accurate, well-sourced answers based ONLY on the provided context. ' +
			'If the context does not contain enough information, say so clearly. ' +
			'Cite sources using [Source N] notation.';

		if (jurisdiction) {
			systemPrompt += ` Focus on ${jurisdiction} jurisdiction.`;
		}
		if (legal_area) {
			systemPrompt += ` This pertains to ${legal_area} law.`;
		}

		const contextBlock = combinedContext
			? `\n\nApproved Context:\n${combinedContext}\n\n`
			: '\n\n';

		const prompt = `${systemPrompt}${contextBlock}Question: ${query}\n\nProvide a comprehensive legal analysis. Include [Source N] citations where applicable.${include_todos ? ' Also list any recommended action items.' : ''}`;

		// Call Ollama (or Bifrost) for generation
		const { answerText, genTime, evalCount } = await traceLLM('rag-answer', { model: 'gemma4-rotorquant:latest', prompt: query.slice(0, 500), case_id }, async (gen) => {
			// Route through Bifrost gateway when enabled (gets semantic caching)
			if (ENV.BIFROST_ENABLED) {
				const text = await bifrostChat(
					[{ role: 'user', content: prompt }],
					'gemma4-rotorquant:latest',
					{ maxTokens: max_tokens, temperature, timeoutMs: 30_000 }
				);
				gen.end({ output: text.slice(0, 1000) });
				return { answerText: text.trim(), genTime: performance.now() - startTime, evalCount: Math.ceil(text.length / 4) as number | undefined };
			}

			const genResp = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma4-rotorquant:latest',
					prompt,
					stream: false,
					options: {
						num_predict: max_tokens,
						temperature
					}
				}),
				signal: AbortSignal.timeout(30000)
			});

			if (!genResp.ok) {
				console.error('[rag/answer] Ollama error:', genResp.status);
				gen.end({ output: `error:${genResp.status}`, level: 'WARNING' });
				throw new Error(`Ollama ${genResp.status}`);
			}

			const genData = await genResp.json();
			const text = genData.response?.trim() ?? '';
			gen.end({ output: text.slice(0, 1000), usage: { promptTokens: genData.prompt_eval_count, completionTokens: genData.eval_count } });
			return { answerText: text, genTime: performance.now() - startTime, evalCount: genData.eval_count as number | undefined };
		});

		// Extract citations from [Source N] references in the answer
		const citations: Citation[] = [];
		if (include_citations) {
			const sourceRefs = answerText.match(/\[Source\s+(\d+)[^\]]*\]/g) ?? [];
			const seenSources = new Set<string>();

			for (const ref of sourceRefs) {
				const match = ref.match(/\[Source\s+(\d+)/);
				if (match && !seenSources.has(match[1])) {
					seenSources.add(match[1]);
					const srcIdx = parseInt(match[1], 10) - 1;
					const chunk = contextChunks[srcIdx] as Record<string, unknown> | undefined;
					citations.push({
						citation_id: crypto.randomUUID(),
						chunk_id: chunk?.chunk_id ? String(chunk.chunk_id) : `source-${match[1]}`,
						source_title: chunk?.source_title ? String(chunk.source_title) : `Source ${match[1]}`,
						quote: ref
					});
				}
			}
		}

		// Extract action items if requested
		const actionItems: ActionItem[] = [];
		if (include_todos) {
			const todoMatches = answerText.match(/(?:action item|todo|recommend(?:ation)?|next step)[:\s]+([^\n.]+)/gi) ?? [];
			for (const match of todoMatches) {
				actionItems.push({
					action_id: crypto.randomUUID(),
					description: match.replace(/^(?:action item|todo|recommend(?:ation)?|next step)[:\s]+/i, '').trim(),
					priority: 'medium',
					related_chunks: []
				});
			}
		}

		// Compute confidence from answer quality signals
		const answerConfidence = Math.min(
			0.95,
			0.4 +
				(answerText.length > 100 ? 0.15 : 0) +
				(citations.length > 0 ? 0.2 : 0) +
				(answerText.length > 300 ? 0.1 : 0) +
				(citations.length >= 3 ? 0.1 : 0)
		);

		const groundingScore = citations.length > 0
			? Math.min(0.95, 0.5 + citations.length * 0.1)
			: 0.3;

		const response: AnswerWithCitations = {
			answer_id: crypto.randomUUID(),
			context_id,
			case_id,
			answer: answerText,
			summary: answerText.slice(0, 200) + (answerText.length > 200 ? '...' : ''),
			citations,
			action_items: actionItems,
			model: 'gemma4-rotorquant:latest',
			tokens_used: evalCount ?? Math.ceil(answerText.length / 4),
			generation_time_ms: Math.round(genTime),
			answer_confidence: answerConfidence,
			grounding_score: groundingScore,
			timestamp: new Date().toISOString()
		};

		// Track token usage (fire-and-forget)
		trackTokenUsage({
			endpoint: '/api/rag/answer',
			model: 'gemma4-rotorquant:latest',
			completionTokens: evalCount ?? Math.ceil(answerText.length / 4),
			durationMs: Math.round(genTime),
		});

		// Record into code-llm-index path cache (fire-and-forget). Keyed by case_id
		// so subsequent ACE preflights for the same case get sub-5ms PRIOR ANSWER
		// hits with the structured 1-3 sentence summary + citations + confidence.
		void (async () => {
			try {
				const { recordRagAnswer } = await import('$lib/server/cache/code-llm-index.js');
				await recordRagAnswer(`case:${case_id}:${context_id}`, answerText, {
					query,
					citations: citations.map((c) => ({
						chunkId:     c.chunk_id,
						sourceTitle: c.source_title,
						quote:       c.quote,
					})),
					confidence:     answerConfidence,
					groundingScore: groundingScore,
					tokensUsed:     evalCount ?? Math.ceil(answerText.length / 4),
					model:          'gemma4-rotorquant:latest',
				});
			} catch (err) {
				console.warn('[rag/answer] code-llm record skipped:', (err as Error)?.message ?? err);
			}
		})();

		return json(response);
	} catch (err) {
		console.error('[rag/answer] Error:', err);
		return json({ error: 'Answer generation failed' }, { status: 500 });
	}
};
