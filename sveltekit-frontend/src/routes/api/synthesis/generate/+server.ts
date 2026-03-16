/**
 * POST /api/synthesis/generate
 *
 * Unified LLM synthesis endpoint with ACE self-evaluation.
 * Pipeline: Auth → Cache → ACE Context Assembly → LLM Generate → Self-Eval → Optional Retry → Cache + Return
 *
 * Supports JSON (default) and SSE streaming modes.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { litellmChat } from '$lib/server/ollama.js';
import { z } from 'zod';

const synthesisRequestSchema = z.object({
	query: z.string().min(3, 'Query must be at least 3 characters').max(5000),
	caseId: z.string().uuid().optional(),
	conversationId: z.string().max(200).optional(),
	persona: z.enum(['neutral', 'prosecutor', 'defense', 'plain-language', 'academic']).optional(),
	maxTokens: z.number().int().min(64).max(8192).optional(),
	temperature: z.number().min(0).max(2).optional(),
	enableACE: z.boolean().optional(),
	retryOnLowQuality: z.boolean().optional(),
	stream: z.boolean().optional(),
	includeCitations: z.boolean().optional(),
	jurisdiction: z.string().max(200).optional(),
	legalArea: z.string().max(200).optional(),
	sectionTypes: z.array(z.enum([
		'facts', 'issues', 'reasoning', 'holding', 'citations',
		'parties', 'motions', 'bibliography', 'procedural_history',
		'sentencing', 'judgment'
	])).max(11).optional()
});
import { getVectorCache, setVectorCache } from '$lib/server/vector-cache.js';
import { assembleACEContext, buildACEPrompt } from '$lib/server/ace/context-assembler.js';
import { evaluateResponse, generateCorrectionPrompt } from '$lib/server/ace/self-prompt.js';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed.js';
import { createHash } from 'crypto';
import { ollamaFetch } from '$lib/server/ollama.js';

// ── Types ─────────────────────────────────────────────────────────────

type SynthesisRequest = z.infer<typeof synthesisRequestSchema>;

interface SynthesisCitation {
	id: string;
	sourceTitle: string;
	quote: string;
}

interface SynthesisEvaluation {
	quality: number;
	completeness: number;
	accuracy: number;
	suggestions: string[];
	wasRetried: boolean;
}

interface SynthesisTiming {
	contextMs: number;
	generateMs: number;
	evalMs: number;
	totalMs: number;
}

interface SynthesisResponse {
	synthesisId: string;
	query: string;
	answer: string;
	citations: SynthesisCitation[];
	evaluation: SynthesisEvaluation | null;
	confidence: number;
	model: string;
	tokensUsed: number;
	timing: SynthesisTiming;
	cached: boolean;
	timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

const MODEL = 'gemma3-legal:latest';
const QUALITY_THRESHOLD = 0.6;

function buildCacheKey(userId: string, query: string, caseId?: string, persona?: string): string {
	const payload = `${userId}|${query}|${caseId ?? ''}|${persona ?? 'neutral'}`;
	return `synthesis:${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}

function extractCitations(
	answerText: string,
	ragChunks: Array<{ content: string; score: number; source: string }>
): SynthesisCitation[] {
	const citations: SynthesisCitation[] = [];
	const refs = answerText.match(/\[Source\s+(\d+)[^\]]*\]/g) ?? [];
	const seen = new Set<string>();

	for (const ref of refs) {
		const match = ref.match(/\[Source\s+(\d+)/);
		if (match && !seen.has(match[1])) {
			seen.add(match[1]);
			const idx = parseInt(match[1], 10) - 1;
			const chunk = ragChunks[idx];
			citations.push({
				id: crypto.randomUUID(),
				sourceTitle: chunk?.source ?? `Source ${match[1]}`,
				quote: ref
			});
		}
	}
	return citations;
}

function computeConfidence(answerText: string, citations: SynthesisCitation[], eval_?: SynthesisEvaluation | null): number {
	let score = 0.4;
	if (answerText.length > 100) score += 0.15;
	if (answerText.length > 300) score += 0.1;
	if (citations.length > 0) score += 0.15;
	if (citations.length >= 3) score += 0.1;
	if (eval_ && eval_.quality > 0.7) score += 0.05;
	return Math.min(0.95, score);
}

async function callOllama(
	systemPrompt: string,
	contextWindow: string,
	query: string,
	maxTokens: number,
	temperature: number,
	correctionPrompt?: string | null
): Promise<{ text: string; tokensUsed: number; durationMs: number }> {
	const userPrompt = correctionPrompt
		? `${contextWindow}\n\nQuestion: ${query}\n\n${correctionPrompt}`
		: `${contextWindow}\n\nQuestion: ${query}\n\nProvide a comprehensive legal analysis. Include [Source N] citations where applicable.`;

	const start = performance.now();
	return traceLLM('synthesis-generate', { model: MODEL, prompt: query.slice(0, 500) }, async (gen) => {
		// Route through LiteLLM proxy when enabled (gets semantic caching)
		if (ENV.LITELLM_ENABLED) {
			const text = await litellmChat(
				[
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				MODEL,
				{ maxTokens, temperature, timeoutMs: 60_000 }
			);
			gen.end({ output: text.slice(0, 1000) });
			return {
				text: text.trim(),
				tokensUsed: Math.ceil(text.length / 4),
				durationMs: performance.now() - start
			};
		}

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				options: { num_predict: maxTokens, temperature }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);

		const data = await res.json();
		const text = (data.message?.content ?? '').trim();
		gen.end({ output: text.slice(0, 1000), usage: { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count } });
		return {
			text,
			tokensUsed: data.eval_count ?? Math.ceil(text.length / 4),
			durationMs: performance.now() - start
		};
	});
}

// ── SSE Stream Handler ────────────────────────────────────────────────

async function handleStream(body: SynthesisRequest, userId: string): Promise<Response> {
	const { query, maxTokens = 2048, temperature = 0.3, enableACE = true, retryOnLowQuality = true } = body;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const sendEvent = (event: string, data: unknown) => {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			};

			try {
				// Set SSE reconnection interval (3s)
				controller.enqueue(encoder.encode('retry: 3000\n\n'));
				const totalStart = performance.now();

				// Stage 1: Context assembly
				const ctxStart = performance.now();
				const context = await assembleACEContext({
					query, userId, caseId: body.caseId, conversationId: body.conversationId, persona: body.persona, sectionTypes: body.sectionTypes
				});
				const acePrompt = buildACEPrompt(context, query);
				sendEvent('context_assembled', {
					ragChunks: context.ragChunks.length,
					kagNeighbors: context.kagNeighbors.length,
					persona: context.persona,
					contextMs: Math.round(performance.now() - ctxStart)
				});

				// Stage 2: Stream LLM
				sendEvent('synthesis_started', { model: MODEL, maxTokens });

				const userPrompt = `${acePrompt.contextWindow}\n\nQuestion: ${query}\n\nProvide a comprehensive legal analysis. Include [Source N] citations where applicable.`;
				const genRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: MODEL,
						messages: [
							{ role: 'system', content: acePrompt.systemPrompt },
							{ role: 'user', content: userPrompt }
						],
						stream: true,
						options: { num_predict: maxTokens, temperature }
					})
				});

				if (!genRes.ok || !genRes.body) throw new Error(`Ollama streaming failed: ${genRes.status}`);

				const reader = genRes.body.getReader();
				const decoder = new TextDecoder();
				let fullResponse = '';
				let tokensUsed = 0;

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = decoder.decode(value, { stream: true });
					for (const line of chunk.split('\n').filter(l => l.trim())) {
						try {
							const parsed = JSON.parse(line);
							if (parsed.message?.content) {
								fullResponse += parsed.message.content;
								sendEvent('synthesis_chunk', { text: parsed.message.content });
							}
							if (parsed.done) {
								tokensUsed = parsed.eval_count ?? Math.ceil(fullResponse.length / 4);
							}
						} catch { /* skip malformed lines */ }
					}
				}
				reader.releaseLock();

				const generateMs = performance.now() - ctxStart;
				sendEvent('synthesis_complete', { fullResponse, tokensUsed });

				// Stage 3: ACE eval (non-streaming)
				let evaluation: SynthesisEvaluation | null = null;
				let evalMs = 0;
				if (enableACE) {
					const evalStart = performance.now();
					const selfEval = await evaluateResponse({ query, response: fullResponse, context, backend: 'ollama' });
					evalMs = performance.now() - evalStart;
					evaluation = {
						quality: selfEval.quality,
						completeness: selfEval.completeness,
						accuracy: selfEval.accuracy,
						suggestions: selfEval.suggestions,
						wasRetried: false
					};

					if (retryOnLowQuality && selfEval.quality < QUALITY_THRESHOLD && selfEval.shouldRetry) {
						const correction = generateCorrectionPrompt(selfEval, query, fullResponse);
						if (correction) {
							sendEvent('retry_started', { reason: 'Low quality score', quality: selfEval.quality });
							const retry = await callOllama(acePrompt.systemPrompt, acePrompt.contextWindow, query, maxTokens, temperature, correction);
							fullResponse = retry.text;
							tokensUsed += retry.tokensUsed;
							const retryEval = await evaluateResponse({ query, response: fullResponse, context, backend: 'ollama' });
							evaluation = {
								quality: retryEval.quality,
								completeness: retryEval.completeness,
								accuracy: retryEval.accuracy,
								suggestions: retryEval.suggestions,
								wasRetried: true
							};
							evalMs += performance.now() - evalStart;
						}
					}
					sendEvent('evaluation', evaluation);
				}

				const citations = extractCitations(fullResponse, context.ragChunks);
				const confidence = computeConfidence(fullResponse, citations, evaluation);
				const totalMs = performance.now() - totalStart;

				sendEvent('complete', {
					synthesisId: crypto.randomUUID(),
					query,
					answer: fullResponse,
					citations,
					evaluation,
					confidence,
					model: MODEL,
					tokensUsed,
					timing: { contextMs: Math.round(performance.now() - ctxStart), generateMs: Math.round(generateMs), evalMs: Math.round(evalMs), totalMs: Math.round(totalMs) },
					cached: false,
					timestamp: new Date().toISOString()
				} satisfies SynthesisResponse);
			} catch (err) {
				sendEvent('error', { message: err instanceof Error ? err.message : 'Synthesis failed' });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}

// ── POST Handler ──────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
	const auth = await requireAuth(event);
	const totalStart = performance.now();

	const raw = await event.request.json();
	const parsed = synthesisRequestSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const body = parsed.data;

	const {
		query,
		maxTokens = 2048,
		temperature = 0.3,
		enableACE = true,
		retryOnLowQuality = true,
		includeCitations = true,
	} = body;

	// SSE stream mode
	if (body.stream) {
		return handleStream(body, auth.user.id);
	}

	// ── JSON mode ─────────────────────────────────────────────────────

	try {
		// Stage 1: Cache check
		const cacheKey = buildCacheKey(auth.user.id, query, body.caseId, body.persona);
		const { entry: cached } = await getVectorCache(cacheKey, {});
		if (cached) {
			return json({ ...(cached as unknown as SynthesisResponse), cached: true });
		}

		// Stage 2: ACE context assembly
		const ctxStart = performance.now();
		const context = await assembleACEContext({
			query,
			userId: auth.user.id,
			caseId: body.caseId,
			conversationId: body.conversationId,
			persona: body.persona,
			sectionTypes: body.sectionTypes
		});
		const acePrompt = buildACEPrompt(context, query);
		const contextMs = performance.now() - ctxStart;

		// Stage 3: LLM synthesis
		const gen = await callOllama(acePrompt.systemPrompt, acePrompt.contextWindow, query, maxTokens, temperature);
		let answer = gen.text;
		let tokensUsed = gen.tokensUsed;

		// Stage 4: Citations
		const citations = includeCitations ? extractCitations(answer, context.ragChunks) : [];

		// Stage 5: ACE self-evaluation (fire-and-forget via RabbitMQ)
		const synthesisId = crypto.randomUUID();

		if (enableACE) {
			rabbitmq.publishACEEvaluation({
				responseId: synthesisId,
				query,
				response: answer,
				context: {
					ragChunks: context.ragChunks,
					kagNeighbors: context.kagNeighbors,
					persona: context.persona
				}
			}).catch(() => {});
		}

		const confidence = computeConfidence(answer, citations, null);
		const totalMs = performance.now() - totalStart;

		const response: SynthesisResponse = {
			synthesisId,
			query,
			answer,
			citations,
			evaluation: null,
			confidence,
			model: MODEL,
			tokensUsed,
			timing: {
				contextMs: Math.round(contextMs),
				generateMs: Math.round(gen.durationMs),
				evalMs: 0,
				totalMs: Math.round(totalMs)
			},
			cached: false,
			timestamp: new Date().toISOString()
		};

		// Cache (fire-and-forget)
		setVectorCache(cacheKey, [response], {
			searchTime: totalMs,
			totalResults: 1,
			model: MODEL,
			distanceMetric: 'cosine',
			threshold: 0
		}).catch(() => {});

		return json(response);
	} catch (err) {
		console.error('[synthesis] Error:', err);
		const isOllamaDown = err instanceof Error && (err.message.includes('Ollama') || err.message.includes('fetch'));
		return json(
			{ error: isOllamaDown ? 'LLM service unavailable' : 'Synthesis failed', degraded: true },
			{ status: isOllamaDown ? 502 : 500 }
		);
	}
};
