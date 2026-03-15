/**
 * Ollama/Gemma3 LLM Client - Task 5.3
 *
 * Provides a clean interface for LLM integration with the RAG system.
 * Supports both streaming and non-streaming responses.
 * Routes through LiteLLM proxy when LITELLM_ENABLED=true for semantic caching.
 */
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { litellmChat, ollamaFetch } from '$lib/server/ollama.js';

const DEFAULT_URL = ENV.OLLAMA_BASE_URL;
const DEFAULT_MODEL = process.env.OLLAMA_MODEL_CHAT ?? process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest';
const MODEL_KEEP_ALIVE = process.env?.OLLAMA_KEEP_ALIVE ?? '24h';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	topK?: number;
	stream?: boolean;
}

export interface LLMResponse {
	content: string;
	model: string;
	totalDuration?: number;
	promptEvalCount?: number;
	evalCount?: number;
}

/**
 * Generate a completion using Ollama (or LiteLLM when enabled)
 */
export async function generateCompletion(
	prompt: string,
	options: LLMOptions = {}
): Promise<LLMResponse> {
	const model = options.model ?? DEFAULT_MODEL;

	// Route through LiteLLM proxy when enabled (gets semantic caching)
	if (ENV.LITELLM_ENABLED) {
		return traceLLM('generate-completion', { model, prompt: prompt.slice(0, 500) }, async (gen) => {
			const content = await litellmChat(
				[{ role: 'user', content: prompt }],
				model,
				{ temperature: options.temperature, maxTokens: options.maxTokens }
			);
			const result: LLMResponse = { content, model };
			gen.end({ output: content.slice(0, 1000) });
			return result;
		});
	}

	return traceLLM('generate-completion', { model, prompt: prompt.slice(0, 500) }, async (gen) => {
		const response = await ollamaFetch(`${DEFAULT_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				stream: false,
				keep_alive: MODEL_KEEP_ALIVE,
				options: {
					temperature: options.temperature ?? 0.7,
					num_predict: options.maxTokens ?? 2048,
					top_p: options.topP ?? 0.9,
					top_k: options.topK ?? 40,
				},
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Ollama error: ${response.status} - ${error}`);
		}

		const data = await response.json();
		const result: LLMResponse = {
			content: data.response,
			model: data.model,
			totalDuration: data.total_duration,
			promptEvalCount: data.prompt_eval_count,
			evalCount: data.eval_count,
		};

		gen.end({
			output: result.content.slice(0, 1000),
			usage: { promptTokens: result.promptEvalCount, completionTokens: result.evalCount },
		});

		return result;
	});
}

/**
 * Chat completion with message history
 */
export async function chatCompletion(
	messages: LLMMessage[],
	options: LLMOptions = {}
): Promise<LLMResponse> {
	const model = options.model ?? DEFAULT_MODEL;

	// Route through LiteLLM proxy when enabled (gets semantic caching)
	if (ENV.LITELLM_ENABLED) {
		return traceLLM('chat-completion', { model, messages: messages.slice(-3) }, async (gen) => {
			const content = await litellmChat(
				messages,
				model,
				{ temperature: options.temperature, maxTokens: options.maxTokens }
			);
			const result: LLMResponse = { content, model };
			gen.end({ output: content.slice(0, 1000) });
			return result;
		});
	}

	return traceLLM('chat-completion', { model, messages: messages.slice(-3) }, async (gen) => {
		const response = await ollamaFetch(`${DEFAULT_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages,
				stream: false,
				keep_alive: MODEL_KEEP_ALIVE,
				options: {
					temperature: options.temperature ?? 0.7,
					num_predict: options.maxTokens ?? 2048,
					top_p: options.topP ?? 0.9,
					top_k: options.topK ?? 40,
				},
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Ollama chat error: ${response.status} - ${error}`);
		}

		const data = await response.json();
		const result: LLMResponse = {
			content: data.message?.content ?? '',
			model: data.model,
			totalDuration: data.total_duration,
			promptEvalCount: data.prompt_eval_count,
			evalCount: data.eval_count,
		};

		gen.end({
			output: result.content.slice(0, 1000),
			usage: { promptTokens: result.promptEvalCount, completionTokens: result.evalCount },
		});

		return result;
	});
}

/**
 * Legal-domain RAG prompt builder
 */
export function buildLegalRAGPrompt(
	question: string,
	sources: Array<{
		text: string; filename?: string; page?: number;
		n: number;
	}>
): string {
	const sourcesBlock = sources
		.map((s) => {
			const header = `[#${s.n}] ${s.filename ?? 'Unknown'} (page ${s.page ?? '?'})`;
			return `${header}\n${s.text}`;
		})
		.join('\n\n');

	return `You are a legal-domain assistant analyzing evidence and legal documents.

INSTRUCTIONS:
- Use ONLY the SOURCES below to answer the question
- If the sources don't support an answer, say you don't have enough evidence
- Cite sources using [#N] markers that match the source numbers
- Be precise and accurate - do not make assumptions beyond what sources state
- Focus on legal relevance and evidentiary value

SOURCES:
${sourcesBlock}

QUESTION: ${question}

ANSWER:`;
}

/**
 * Relationship suggestion prompt for Evidence Board
 */
export function buildRelationshipPrompt(
	evidenceA: {
		text: string; filename: string;
		tags: string[];
	},
	evidenceB: {
		text: string; filename: string;
		tags: string[];
	}
): string {
	return `You are a legal analyst examining two pieces of evidence for potential relationships.

EVIDENCE A (${evidenceA.filename}):
${evidenceA.text.slice(0, 1500)}
Tags: ${evidenceA.tags.join(', ') ?? 'none'}

EVIDENCE B (${evidenceB.filename}):
${evidenceB.text.slice(0, 1500)}
Tags: ${evidenceB.tags.join(', ') ?? 'none'}

Analyze these documents and suggest possible legal relationships between them.
Return your analysis as JSON array with this structure:
[
  {
    "type": "supports" | "contradicts" | "references" | "timeline" | "same_party" | "same_statute",
    "confidence": 0.0-1.0,
    "rationale": "Brief explanation"
  }
]

Only suggest relationships you can justify from the text. Return empty array [] if no clear relationship exists.

JSON:`;
}

/**
 * Check if Ollama is available (always checks Ollama directly, not LiteLLM)
 */
export async function checkOllamaHealth(): Promise<{
	available: boolean;
	models?: string[];
	error?: string;
}> {
	try {
		// @ts-ignore
		const response = await ollamaFetch(`${DEFAULT_URL}/api/tags`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000),
		});

		if (!response.ok) {
			return { available: false, error: `HTTP ${response.status}` };
		}

		const data = await response.json();
		const models = (data.models ?? []).map((m: any) => m.name);

		return { available: true, models };
	} catch (e) {
		return {
			available: false,
			error: e instanceof Error ? e.message : 'Connection failed',
		};
	}
}

/**
 * Get configured model info
 */
export function getModelConfig() {
	return {
		url: DEFAULT_URL,
		chatModel: DEFAULT_MODEL,
		embedModel: process.env.OLLAMA_MODEL_EMBED ?? 'nomic-embed-text',
		litellmEnabled: ENV.LITELLM_ENABLED,
		litellmUrl: ENV.LITELLM_URL,
	};
}
