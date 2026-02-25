/**
 * ACE Self-Prompting Module
 *
 * After generating a response, evaluates quality and optionally
 * generates a correction prompt for retry (max 1 retry).
 *
 * Uses the LLM itself to evaluate its own output.
 * Stores evaluations in Redis for analytics.
 */
import { ENV } from '$lib/server/env.server.js';
import { redis } from '$lib/server/redis.js';
import type { ACEContext, SelfEvaluation } from './types.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MODEL = 'gemma3-legal:latest';
const EVAL_CACHE_TTL = 3600; // 1 hour
const QUALITY_THRESHOLD = 0.6;

/**
 * Evaluate the quality of an AI-generated response.
 * Returns a structured evaluation with quality scores.
 */
export async function evaluateResponse(opts: {
	query: string;
	response: string;
	context: ACEContext;
	backend: 'ollama' | 'tensorrt';
}): Promise<SelfEvaluation> {
	const start = Date.now();

	try {
		const evalPrompt = buildEvalPrompt(opts.query, opts.response);

		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt: evalPrompt,
				stream: false,
				options: { temperature: 0.1, num_predict: 256 }
			}),
			signal: AbortSignal.timeout(10000)
		});

		if (!res.ok) throw new Error(`Ollama ${res.status}`);

		const data = await res.json();
		const responseText = String(data.response ?? '');
		const evaluation = parseEvaluation(responseText);
		evaluation.evalMs = Date.now() - start;

		// Cache evaluation
		const cacheKey = `ace:eval:${hashString(opts.query + opts.response)}`;
		await redis
			.set(cacheKey, JSON.stringify(evaluation), 'EX', EVAL_CACHE_TTL)
			.catch(() => {});

		return evaluation;
	} catch {
		return {
			quality: 0.7,
			completeness: 0.7,
			accuracy: 0.7,
			suggestions: [],
			shouldRetry: false,
			evalMs: Date.now() - start
		};
	}
}

/**
 * Generate a correction prompt if quality is below threshold.
 * Returns null if no correction is needed.
 */
export function generateCorrectionPrompt(
	evaluation: SelfEvaluation,
	originalQuery: string,
	originalResponse: string
): string | null {
	if (!evaluation.shouldRetry || evaluation.quality >= QUALITY_THRESHOLD) {
		return null;
	}

	const issues = evaluation.suggestions.slice(0, 3).join('; ');
	return (
		`The previous response had quality issues: ${issues}. ` +
		`Please provide an improved answer to: "${originalQuery}". ` +
		`Address these specific gaps while maintaining accuracy. ` +
		`Previous response for reference (improve, don't repeat): ${originalResponse.slice(0, 500)}`
	);
}

function buildEvalPrompt(query: string, response: string): string {
	return `Evaluate this AI response for quality. Return ONLY valid JSON.

User Question: ${query.slice(0, 300)}

AI Response: ${response.slice(0, 1000)}

Rate on a 0.0-1.0 scale and provide suggestions:
{"quality":0.8,"completeness":0.7,"accuracy":0.9,"suggestions":["Add more detail about X"],"shouldRetry":false}`;
}

function parseEvaluation(text: string): SelfEvaluation {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		return { quality: 0.7, completeness: 0.7, accuracy: 0.7, suggestions: [], shouldRetry: false, evalMs: 0 };
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]);
		const quality = clamp(Number(parsed.quality ?? 0.7));
		return {
			quality,
			completeness: clamp(Number(parsed.completeness ?? 0.7)),
			accuracy: clamp(Number(parsed.accuracy ?? 0.7)),
			suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
			shouldRetry: quality < QUALITY_THRESHOLD,
			evalMs: 0
		};
	} catch {
		return { quality: 0.7, completeness: 0.7, accuracy: 0.7, suggestions: [], shouldRetry: false, evalMs: 0 };
	}
}

function clamp(n: number): number {
	return Math.max(0, Math.min(1, n));
}

function hashString(s: string): string {
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
	}
	return Math.abs(hash).toString(36);
}
