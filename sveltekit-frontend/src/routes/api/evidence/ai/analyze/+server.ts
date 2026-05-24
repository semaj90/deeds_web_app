import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { rateLimitOrRespond, RateLimitPresets } from '$lib/server/middleware/rate-limit.js';
import { generateCacheKey, getExactMatchCache, setExactMatchCache } from '$lib/server/cache/redis-exact-match.js';

const analyzeSchema = z.object({
	node: z.object({
		id: z.string().min(1),
		title: z.string().optional(),
		type: z.string().optional(),
		description: z.string().optional(),
		confidence: z.number().optional(),
		metadata: z.record(z.string(), z.unknown()).optional()
	}),
	// Optional: use gemma4-rotorquant:latest for complex tasks like codebase summarization
	useComplexModel: z.boolean().optional()
});

/** POST /api/evidence/ai/analyze — AI analysis of an evidence node */
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	// Rate limiting: 20 requests per 5 minutes (AI endpoint preset)
	const rateLimited = await rateLimitOrRespond(event, RateLimitPresets.aiEndpoint);
	if (rateLimited) return rateLimited;

	try {
		const { request } = event;
		const raw = await request.json();
		const parsed = analyzeSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { node, useComplexModel = false } = parsed.data;
		const text = node.description || node.title || '';

		// Choose model: gemma3:270m (fast, 4.5s avg) or gemma4-rotorquant:latest (complex, 25s avg)
		const model = useComplexModel ? 'gemma4-rotorquant:latest' : 'gemma3:270m';

		// ── L1 Redis Cache Lookup (5ms) ──
		const cacheKey = generateCacheKey({
			model,
			messages: [
				{
					role: 'system',
					content: `Analyze evidence: ${node.type ?? 'unknown'}`
				},
				{
					role: 'user',
					content: `${node.title ?? 'untitled'}: ${text.slice(0, 1000)}`
				}
			],
			temperature: 0.4,
			maxTokens: 500
		});

		try {
			const cached = await getExactMatchCache(cacheKey);
			if (cached) {
				console.log(`[Evidence AI] L1 REDIS HIT — node=${node.id} model=${model}`);

				// Parse cached response
				try {
					const parsedCache = JSON.parse(cached.content);
					return json({
						analysis: parsedCache.analysis ?? cached.content,
						suggestions: Array.isArray(parsedCache.suggestions) ? parsedCache.suggestions : [],
						cached: true
					});
				} catch {
					return json({
						analysis: cached.content,
						suggestions: [],
						cached: true
					});
				}
			}
		} catch (cacheErr) {
			console.warn('[Evidence AI] Cache lookup failed (non-fatal):', cacheErr);
		}

		// ── Ollama Inference (gemma3:270m = 4.5s, gemma4-rotorquant:latest = 25s) ──
		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');

		const inferenceStart = performance.now();
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt: `Analyze this evidence item and provide: 1) A brief analysis of its legal significance, 2) Suggestions for further investigation.

Evidence type: ${node.type ?? 'unknown'}
Title: ${node.title ?? 'untitled'}
Description: ${text.slice(0, 5000)}

Return JSON: { "analysis": "...", "suggestions": ["...", "..."] }`,
				stream: false,
				options: { temperature: 0.4, num_predict: 500 }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		const inferenceTime = Math.round(performance.now() - inferenceStart);
		console.log(`[Evidence AI] Inference complete — model=${model} time=${inferenceTime}ms`);

		if (!res.ok) {
			return json({ analysis: 'Analysis unavailable', suggestions: [] });
		}

		const data = await res.json();
		let resultAnalysis: string;
		let resultSuggestions: string[] = [];

		try {
			const parsedResponse = JSON.parse(data.response);
			resultAnalysis = parsedResponse.analysis ?? data.response;
			resultSuggestions = Array.isArray(parsedResponse.suggestions) ? parsedResponse.suggestions : [];
		} catch {
			resultAnalysis = data.response;
			resultSuggestions = [];
		}

		// ── Store in L1 Redis Cache (1hr TTL) ──
		setExactMatchCache(cacheKey, {
			content: JSON.stringify({ analysis: resultAnalysis, suggestions: resultSuggestions }),
			model,
			backend: 'ollama'
		}).catch(err => {
			console.warn('[Evidence AI] Cache storage failed:', err);
		});

		return json({
			analysis: resultAnalysis,
			suggestions: resultSuggestions,
			cached: false,
			inferenceTime
		});
	} catch (err) {
		console.error('[/api/evidence/ai/analyze] error:', err);
		return json({ analysis: 'Analysis failed', suggestions: [] }, { status: 500 });
	}
};
