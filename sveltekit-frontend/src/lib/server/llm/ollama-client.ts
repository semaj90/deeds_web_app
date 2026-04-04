/**
 * Ollama/Gemma3 LLM Client - Task 5.3
 *
 * Provides a clean interface for LLM integration with the RAG system.
 * Supports both streaming and non-streaming responses.
 * Routes through Bifrost gateway when BIFROST_ENABLED=true for semantic caching.
 */
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { getChatModelKeepAlive, bifrostChat, ollamaFetch } from '$lib/server/ollama.js';

const DEFAULT_URL = ENV.OLLAMA_BASE_URL;
const DEFAULT_MODEL =
  process.env.OLLAMA_MODEL_CHAT ?? process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest';

// Canonical model parameters — mirrors gemma3Q4_K_M/Modelfile PARAMETER values.
// All TS callers previously missed num_ctx and repeat_penalty, letting Ollama
// silently fall back to its own built-in defaults instead of the Modelfile values.
const GEMMA3_DEFAULTS = {
  temperature: 0.1, // Modelfile: temperature 0.1  (legal precision, not creativity)
  top_k: 20, // Modelfile: top_k 20
  top_p: 0.8, // Modelfile: top_p 0.8
  num_ctx: 8192, // Modelfile: num_ctx 8192  — was MISSING from all TS callers
  repeat_penalty: 1.05, // Modelfile: repeat_penalty 1.05 — was MISSING from all TS callers
  num_predict: 2048, // sensible completion cap
} as const;

const GEMMA4_DEFAULTS = {
  temperature: 0.1,
  top_k: 20,
  top_p: 0.8,
  num_ctx: 32768, // Gemma 4 supports 131K; 32K is practical for 8GB VRAM with Q8_0 KV
  repeat_penalty: 1.05,
  num_predict: 4096, // Gemma 4 can handle longer completions
} as const;

/** Pick model defaults based on model name */
function getModelDefaults(model: string) {
  return model.startsWith('gemma4') ? GEMMA4_DEFAULTS : GEMMA3_DEFAULTS;
}

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
 * Generate a completion using Ollama (or Bifrost when enabled)
 */
export async function generateCompletion(
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const model = options.model ?? DEFAULT_MODEL;

  // Route through Bifrost gateway when enabled (gets semantic caching)
  if (ENV.BIFROST_ENABLED) {
    return traceLLM('generate-completion', { model, prompt: prompt.slice(0, 500) }, async (gen) => {
      const content = await bifrostChat([{ role: 'user', content: prompt }], model, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
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
        keep_alive: getChatModelKeepAlive(),
        options: {
          temperature: options.temperature ?? getModelDefaults(model).temperature,
          num_predict: options.maxTokens ?? getModelDefaults(model).num_predict,
          top_p: options.topP ?? getModelDefaults(model).top_p,
          top_k: options.topK ?? getModelDefaults(model).top_k,
          num_ctx: getModelDefaults(model).num_ctx,
          repeat_penalty: getModelDefaults(model).repeat_penalty,
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

  // Route through Bifrost gateway when enabled (gets semantic caching)
  if (ENV.BIFROST_ENABLED) {
    return traceLLM('chat-completion', { model, messages: messages.slice(-3) }, async (gen) => {
      const content = await bifrostChat(messages, model, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
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
        keep_alive: getChatModelKeepAlive(),
        options: {
          temperature: options.temperature ?? getModelDefaults(model).temperature,
          num_predict: options.maxTokens ?? getModelDefaults(model).num_predict,
          top_p: options.topP ?? getModelDefaults(model).top_p,
          top_k: options.topK ?? getModelDefaults(model).top_k,
          num_ctx: getModelDefaults(model).num_ctx,
          repeat_penalty: getModelDefaults(model).repeat_penalty,
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
 * Check if Ollama is available (always checks Ollama directly, not Bifrost)
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
		bifrostEnabled: ENV.BIFROST_ENABLED,
		bifrostUrl: ENV.BIFROST_URL,
	};
}
