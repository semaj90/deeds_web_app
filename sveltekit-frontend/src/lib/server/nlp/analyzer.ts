/**
 * NLP Analyzer — Sentiment + Document Classification via Ollama
 *
 * Uses Ollama's GBNF-constrained structured output (Zod → JSON Schema)
 * from gemma4-rotorquant:latest for:
 *   1. Sentiment analysis (positive/negative/neutral + confidence)
 *   2. Document classification (contract, deed, brief, motion, etc.)
 *   3. Key phrase extraction
 *
 * All inference runs through local Ollama — no external API needed.
 */

import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { z } from 'zod';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MODEL = ENV.ROTORQUANT_CHAT_MODEL;

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

/** Analyze sentiment of legal text via Ollama structured JSON output. */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
	const prompt = `Analyze the sentiment of this legal text. Return JSON with sentiment, confidence, reasoning, and emotions.

Text to analyze:
${text.slice(0, 2000)}`;

	const result = await ollamaJSON<SentimentResult>(prompt, sentimentJsonSchema);
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

	const result = await ollamaJSON<ClassificationResult>(prompt, classificationJsonSchema);
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

/** Call Ollama with GBNF-constrained JSON schema and parse the response. */
async function ollamaJSON<T>(prompt: string, jsonSchema: Record<string, unknown>): Promise<T> {
	return traceLLM('nlp-analyzer', { model: MODEL, prompt: prompt.slice(0, 500) }, async (gen) => {
		const res = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt,
				format: jsonSchema,
				stream: false,
				options: { temperature: 0.1, num_predict: 512 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			throw new Error(`Ollama ${res.status}: ${await res.text()}`);
		}

		const data = await res.json();
		const raw = data.response ?? '';
		gen.end({ output: raw.slice(0, 500) });

		try {
			return JSON.parse(raw) as T;
		} catch {
			const match = raw.match(/\{[\s\S]*\}/);
			if (match) return JSON.parse(match[0]) as T;
			throw new Error('Failed to parse Ollama JSON response');
		}
	});
}
