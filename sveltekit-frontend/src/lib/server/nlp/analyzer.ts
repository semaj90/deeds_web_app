/**
 * NLP Analyzer — Sentiment + Document Classification via llama-server
 *
 * Uses the canonical local synthesis model via llama-server (Zod → JSON Schema) for:
 *   1. Sentiment analysis (positive/negative/neutral + confidence)
 *   2. Document classification (contract, deed, brief, motion, etc.)
 *   3. Key phrase extraction
 *
 * Generative inference runs through the local llama-server /v1 boundary.
 * Ollama is reserved for the EmbeddingGemma embedding lane.
 */

import { resolveLlamaInferenceTarget } from '$lib/server/llm/runtime-contract.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { z } from 'zod';

export interface SentimentResult {
	sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
	confidence: number;
	reasoning: string;
	emotions: string[];
}

export interface ClassificationResult {
	documentType: string;
	subType: string;
	confidence: number;
	practiceArea: string;
	keyPhrases: string[];
}

export interface NLPAnalysis {
	sentiment: SentimentResult;
	classification: ClassificationResult;
	processingMs: number;
}

/** Zod schemas for GBNF-constrained output */
const sentimentSchema = z.object({
	sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
	confidence: z.number(),
	reasoning: z.string(),
	emotions: z.array(z.string()),
});
const sentimentJsonSchema = z.toJSONSchema(sentimentSchema);

const classificationSchema = z.object({
	documentType: z.string(),
	subType: z.string(),
	confidence: z.number(),
	practiceArea: z.string(),
	keyPhrases: z.array(z.string()),
});
const classificationJsonSchema = z.toJSONSchema(classificationSchema);

/** Analyze sentiment of legal text via llama-server structured JSON output. */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
	const prompt = `Analyze the sentiment of this legal text. Return JSON with sentiment, confidence, reasoning, and emotions.

Text to analyze:
${text.slice(0, 2000)}`;

	const result = await llamaServerJSON<SentimentResult>(prompt, sentimentJsonSchema);
	return {
		sentiment: result.sentiment ?? 'neutral',
		confidence: Math.min(Math.max(result.confidence ?? 0.5, 0), 1),
		reasoning: result.reasoning ?? '',
		emotions: Array.isArray(result.emotions) ? result.emotions.slice(0, 5) : []
	};
}

/** Classify a legal document by type and practice area. */
export async function classifyDocument(text: string): Promise<ClassificationResult> {
	const prompt = `Classify this legal document. Return JSON with documentType, subType, confidence, practiceArea, and keyPhrases.

Document text:
${text.slice(0, 3000)}`;

	const result = await llamaServerJSON<ClassificationResult>(prompt, classificationJsonSchema);
	return {
		documentType: result.documentType ?? 'other',
		subType: result.subType ?? '',
		confidence: Math.min(Math.max(result.confidence ?? 0.5, 0), 1),
		practiceArea: result.practiceArea ?? 'other',
		keyPhrases: Array.isArray(result.keyPhrases) ? result.keyPhrases.slice(0, 5) : []
	};
}

/** Run both sentiment + classification in parallel. */
export async function analyzeText(text: string): Promise<NLPAnalysis> {
	const start = performance.now();
	const [sentiment, classification] = await Promise.all([
		analyzeSentiment(text),
		classifyDocument(text)
	]);
	return {
		sentiment,
		classification,
		processingMs: Math.round(performance.now() - start)
	};
}

/** Call llama-server with JSON mode and parse the response. */
async function llamaServerJSON<T>(prompt: string, jsonSchema: Record<string, unknown>): Promise<T> {
	const target = await resolveLlamaInferenceTarget();
	return traceLLM('nlp-analyzer', { model: target.model, prompt: prompt.slice(0, 500) }, async (gen) => {
		const res = await fetch(`${target.baseUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: target.model,
				messages: [
					{ role: 'system', content: `Return only JSON matching this schema: ${JSON.stringify(jsonSchema)}` },
					{ role: 'user', content: prompt },
				],
				response_format: { type: 'json_object' },
				stream: false,
				temperature: 0.1,
				max_tokens: 512
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			throw new Error(`llama-server ${res.status}: ${await res.text()}`);
		}

		const data = await res.json();
		const raw = data.choices?.[0]?.message?.content ?? '';
		gen.end({ output: raw.slice(0, 500) });

		try {
			return JSON.parse(raw) as T;
		} catch {
			const match = raw.match(/\{[\s\S]*\}/);
			if (match) return JSON.parse(match[0]) as T;
			throw new Error('Failed to parse llama-server JSON response');
		}
	});
}
