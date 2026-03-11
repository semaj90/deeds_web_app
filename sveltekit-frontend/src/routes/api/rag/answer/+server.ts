import { json } from '@sveltejs/kit';
import { getOllamaUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';
import type {
	AnswerRequest,
	AnswerWithCitations,
	Citation,
	ActionItem
} from '$lib/types/rag-source-validation';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';

const OLLAMA_URL = getOllamaUrl();

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
export const POST: RequestHandler = async ({ request }) => {
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
			// Fall through — answer without context (degraded)
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

		// Call Ollama for generation
		const genResp = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
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
			return json({ error: 'Answer generation service unavailable' }, { status: 502 });
		}

		const genData = await genResp.json();
		const answerText = genData.response?.trim() ?? '';
		const genTime = performance.now() - startTime;

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
			model: 'gemma3-legal:latest',
			tokens_used: genData.eval_count ?? Math.ceil(answerText.length / 4),
			generation_time_ms: Math.round(genTime),
			answer_confidence: answerConfidence,
			grounding_score: groundingScore,
			timestamp: new Date().toISOString()
		};

		return json(response);
	} catch (err) {
		console.error('[rag/answer] Error:', err);
		return json({ error: 'Answer generation failed' }, { status: 500 });
	}
};