/**
 * NLP Analyzer — Sentiment + Document Classification via Ollama
 *
 * Uses Ollama's JSON mode (format: "json") to get structured output
 * from gemma3-legal for:
 *   1. Sentiment analysis (positive/negative/neutral + confidence)
 *   2. Document classification (contract, deed, brief, motion, etc.)
 *   3. Key phrase extraction
 *
 * All inference runs through local Ollama — no external API needed.
 */

import { ENV } from '$lib/server/env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MODEL = 'gemma3-legal:latest';

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

/** Analyze sentiment of legal text via Ollama structured JSON output. */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
	const prompt = `Analyze the sentiment of this legal text. Respond ONLY with valid JSON matching this schema:
{"sentiment": "positive|negative|neutral|mixed", "confidence": 0.0-1.0, "reasoning": "brief explanation", "emotions": ["list of detected emotions"]}

Text to analyze:
${text.slice(0, 2000)}`;

	const result = await ollamaJSON<SentimentResult>(prompt);
	return {
		sentiment: result.sentiment ?? 'neutral',
		confidence: Math.min(Math.max(result.confidence ?? 0.5, 0), 1),
		reasoning: result.reasoning ?? '',
		emotions: Array.isArray(result.emotions) ? result.emotions.slice(0, 5) : []
	};
}

/** Classify a legal document by type and practice area. */
export async function classifyDocument(text: string): Promise<ClassificationResult> {
	const prompt = `Classify this legal document. Respond ONLY with valid JSON matching this schema:
{"documentType": "contract|deed|brief|motion|complaint|order|statute|regulation|letter|memo|report|other", "subType": "specific sub-type", "confidence": 0.0-1.0, "practiceArea": "civil|criminal|family|real-estate|corporate|ip|employment|immigration|tax|environmental|other", "keyPhrases": ["up to 5 key legal phrases"]}

Document text:
${text.slice(0, 3000)}`;

	const result = await ollamaJSON<ClassificationResult>(prompt);
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

/** Call Ollama with JSON format mode and parse the response. */
async function ollamaJSON<T>(prompt: string): Promise<T> {
	const res = await fetch(`${OLLAMA_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			prompt,
			format: 'json',
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

	try {
		return JSON.parse(raw) as T;
	} catch {
		// Try to extract JSON from response if wrapped in markdown
		const match = raw.match(/\{[\s\S]*\}/);
		if (match) return JSON.parse(match[0]) as T;
		throw new Error('Failed to parse Ollama JSON response');
	}
}
