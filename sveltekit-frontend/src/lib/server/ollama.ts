/**
 * Ollama Integration Service — canonical Ollama client.
 *
 * Exports:
 *   - getOllamaEndpoint(): string — resolve Ollama URL from env
 *   - generateText(prompt): string — simple chat (non-streaming)
 *   - callOllamaChat(system, user): string — system+user chat with logging
 *   - checkOllamaHealth(): boolean — health probe via /api/tags
 *   - listAvailableModels(): string[] — available model names
 *   - VLM_MODELS — model name constants
 */

// VLM model configurations
export const VLM_MODELS = {
	vision: 'gemma3-vision:latest',
	embedding: 'embeddinggemma:latest',
	legal: 'gemma3-legal:latest',
} as const;

export type VLMModel = (typeof VLM_MODELS)[keyof typeof VLM_MODELS];

export interface OllamaMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface OllamaResponse {
	model: string;
	created_at: string;
	message: OllamaMessage;
	done: boolean;
	total_duration: number;
	load_duration: number;
	prompt_eval_count: number;
	prompt_eval_duration: number;
	eval_count: number;
	eval_duration: number;
}

import { ollamaBreaker } from '$lib/server/circuit-breaker.js';
import { retry, retryPredicates } from '$lib/server/utils/retry.js';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';

// ── Config ──────────────────────────────────────────────────────────────────

export function getOllamaEndpoint(): string {
	return ENV.OLLAMA_BASE_URL;
}

const OLLAMA_BASE_URL = ENV.OLLAMA_BASE_URL;
const CHAT_MODEL = process.env?.OLLAMA_MODEL ?? VLM_MODELS.legal;
const REQUEST_TIMEOUT_MS = Number(process.env?.OLLAMA_TIMEOUT_MS ?? '300000');

// ── Chat Functions (merged from ollama-service.ts) ──────────────────────────

export async function generateText(prompt: string): Promise<string> {
	const body = {
		model: CHAT_MODEL,
		messages: [{ role: 'user', content: prompt }],
		stream: false,
	};

	return traceLLM('generate-text', { model: CHAT_MODEL, prompt: prompt.slice(0, 500) }, async (gen) => {
		const content = await ollamaBreaker.call(() =>
			retry(async () => {
				const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
				});

				if (!res.ok) {
					const text = await res.text().catch(() => '');
					console.error('[ollama] /api/chat error:', res.status, text.slice(0, 200));
					throw new Error(`Ollama chat failed: ${res.status}`);
				}

				const data = await res.json() as { message?: { content: string } };
				return data.message?.content ?? '';
			}, { maxAttempts: 2, baseDelayMs: 500, isRetryable: retryPredicates.networkOrServer })
		);
		gen.end({ output: content.slice(0, 1000) });
		return content;
	});
}

export async function callOllamaChat(systemPrompt: string, userPrompt: string): Promise<string> {
	const body = {
		model: CHAT_MODEL,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		],
		stream: false,
	};

	const startTime = Date.now();

	return traceLLM('ollama-chat', { model: CHAT_MODEL, prompt: userPrompt.slice(0, 500) }, async (gen) => {
		const content = await ollamaBreaker.call(() =>
			retry(async () => {
				const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
				});

				const duration = Date.now() - startTime;

				if (!res.ok) {
					const text = await res.text().catch(() => '');
					console.error('[ollama] /api/chat error:', res.status, text.slice(0, 200));
					throw new Error(`Ollama chat failed: ${res.status}`);
				}

				const data = await res.json() as { message?: { content: string } };
				const result = data.message?.content ?? '';
				console.log(`[ollama] Chat completed in ${duration}ms (${result.length} chars)`);
				return result;
			}, { maxAttempts: 2, baseDelayMs: 500, isRetryable: retryPredicates.networkOrServer })
		);
		gen.end({ output: content.slice(0, 1000) });
		return content;
	});
}

// ── Health & Model Discovery ────────────────────────────────────────────────

export async function checkOllamaHealth(): Promise<boolean> {
	try {
		const healthy = await ollamaBreaker.call(
			async () => {
				const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
					signal: AbortSignal.timeout(5000)
				});
				return res.ok;
			},
			() => false
		);
		return healthy;
	} catch {
		return false;
	}
}

export async function listAvailableModels(): Promise<string[]> {
	try {
		const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) return [];
		const data = await res.json();
		return data.models?.map((m: any) => m.name) ?? [];
	} catch {
		return [];
	}
}
