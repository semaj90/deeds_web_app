/**
 * ACE Self-Prompting Module
 *
 * After generating a response, evaluates quality and optionally
 * generates a correction prompt for retry (max 1 retry).
 *
 * Uses the LLM itself to evaluate its own output.
 * Stores evaluations in Redis for analytics.
 */
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { getChatModelKeepAlive, bifrostChat, ollamaFetch } from '$lib/server/ollama.js';
import { redis } from '$lib/server/redis.js';
import type { ACEContext, SelfEvaluation } from './types.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MODEL = 'gemma3-legal:latest';
const EVAL_CACHE_TTL = 3600; // 1 hour
const QUALITY_THRESHOLD = 0.6;

// Zod schema for ACE self-evaluation output — converted to JSON Schema for Ollama GBNF constraining
const evalSchema = z.object({
  quality: z.number(),
  completeness: z.number(),
  accuracy: z.number(),
  suggestions: z.array(z.string()),
  shouldRetry: z.boolean(),
});
const EVAL_FORMAT = z.toJSONSchema(evalSchema);

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

    const responseText = await traceLLM(
      'ace-self-eval',
      { model: MODEL, prompt: opts.query.slice(0, 300) },
      async (gen) => {
        // Route through Bifrost gateway when enabled (gets semantic caching)
        if (ENV.BIFROST_ENABLED) {
          const text = await bifrostChat([{ role: 'user', content: evalPrompt }], MODEL, {
            temperature: 0.1,
            maxTokens: 256,
            timeoutMs: 15_000,
          });
          gen.end({ output: text.slice(0, 500) });
          return text;
        }

        const res = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            prompt: evalPrompt,
            stream: false,
            format: EVAL_FORMAT,
            keep_alive: getChatModelKeepAlive(),
            options: { temperature: 0.1, num_predict: 256 },
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) throw new Error(`Ollama ${res.status}`);

        const data = await res.json();
        const text = String(data.response ?? '');
        gen.end({ output: text.slice(0, 500) });
        return text;
      }
    );
    const evaluation = parseEvaluation(responseText);
    evaluation.evalMs = Date.now() - start;

    // Cache evaluation
    const cacheKey = `ace:eval:${hashString(opts.query + opts.response)}`;
    await redis.set(cacheKey, JSON.stringify(evaluation), 'EX', EVAL_CACHE_TTL).catch(() => {});

    return evaluation;
  } catch (err) {
    console.warn('[ace-self-eval] Evaluation failed, skipping retry:', (err as Error).message ?? err);
    return {
      quality: 0.5,
      completeness: 0.5,
      accuracy: 0.5,
      suggestions: ['Evaluation unavailable — scores are placeholder'],
      shouldRetry: false,
      evalMs: Date.now() - start,
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
	// Static instruction prefix (Ollama KV-caches identical prefixes)
	return `You are an AI quality evaluator for legal assistant responses. Evaluate the response quality on a 0.0-1.0 scale for quality, completeness, and accuracy. Provide actionable improvement suggestions. Set shouldRetry to true only if quality is below 0.6.

User Question: ${query.slice(0, 300)}

AI Response: ${response.slice(0, 1000)}`;
}

function parseEvaluation(text: string): SelfEvaluation {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		console.warn('[ace-self-eval] No JSON found in LLM response, using placeholder scores');
		return { quality: 0.5, completeness: 0.5, accuracy: 0.5, suggestions: ['LLM returned non-JSON response'], shouldRetry: false, evalMs: 0 };
	}

	try {
		const raw = JSON.parse(jsonMatch[0]);
		const parsed = evalSchema.safeParse(raw);
		if (parsed.success) {
			const quality = clamp(parsed.data.quality);
			return {
				quality,
				completeness: clamp(parsed.data.completeness),
				accuracy: clamp(parsed.data.accuracy),
				suggestions: parsed.data.suggestions.slice(0, 5),
				shouldRetry: quality < QUALITY_THRESHOLD,
				evalMs: 0
			};
		}
		// Fallback: manual extraction if Zod parse fails
		const quality = clamp(Number(raw.quality ?? 0.7));
		return {
			quality,
			completeness: clamp(Number(raw.completeness ?? 0.7)),
			accuracy: clamp(Number(raw.accuracy ?? 0.7)),
			suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.slice(0, 5) : [],
			shouldRetry: quality < QUALITY_THRESHOLD,
			evalMs: 0
		};
	} catch {
		console.warn('[ace-self-eval] JSON parse failed for evaluation response');
		return { quality: 0.5, completeness: 0.5, accuracy: 0.5, suggestions: ['Evaluation parse failed'], shouldRetry: false, evalMs: 0 };
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
