/**
 * Local llama-server configuration.
 *
 * Chat, generation, and streaming completions are owned here.
 * Ollama remains the embeddings/compatibility lane.
 */

import { getOllamaEndpoint as getChatEndpoint } from '$lib/server/utils/ollama-endpoint.js';

export interface LlamaServerConfig {
	baseUrl: string;
	model: string;
	timeout: number;
}

const DEFAULT_BASE_URL = getChatEndpoint();
const DEFAULT_MODEL = process.env?.OLLAMA_MODEL ?? 'gemma:7b';
const DEFAULT_TIMEOUT = 30000;

export function getLlamaServerEndpoint(): LlamaServerConfig {
	return {
		baseUrl: DEFAULT_BASE_URL,
		model: DEFAULT_MODEL,
		timeout: DEFAULT_TIMEOUT
	};
}

export function getLlamaServerUrl(endpoint: string = '/v1/chat/completions'): string {
	const config = getLlamaServerEndpoint();
	return `${config.baseUrl}${endpoint}`;
}

export async function checkLlamaServerHealth(): Promise<boolean> {
	try {
		const config = getLlamaServerEndpoint();
		const response = await fetch(`${config.baseUrl}/v1/models`, {
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch (error) {
		console.error('llama-server health check failed:', error);
		return false;
	}
}

export async function generateText(
	prompt: string,
	options?: {
		temperature?: number;
		topK?: number;
		topP?: number;
		numPredict?: number;
	}
): Promise<string> {
	const config = getLlamaServerEndpoint();

	try {
		const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: AbortSignal.timeout(120_000),
			body: JSON.stringify({
				model: config.model,
				messages: [{ role: 'user', content: prompt }],
				stream: false,
				temperature: options?.temperature ?? 0.7,
				num_predict: options?.numPredict ?? 256,
			}),
		});

		if (!response.ok) {
			throw new Error(`llama-server error: ${response.status}`);
		}

		const data = await response.json();
		return data.choices?.[0]?.message?.content ?? '';
	} catch (error) {
		console.error('Text generation failed:', error);
		throw error;
	}
}

export async function* streamText(
	prompt: string,
	options?: {
		temperature?: number;
		topK?: number;
		topP?: number;
	}
): AsyncGenerator<string> {
	const config = getLlamaServerEndpoint();

	try {
		const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: AbortSignal.timeout(120_000),
			body: JSON.stringify({
				model: config.model,
				messages: [{ role: 'user', content: prompt }],
				stream: true,
				temperature: options?.temperature ?? 0.7,
			}),
		});

		if (!response.ok) {
			throw new Error(`llama-server error: ${response.status}`);
		}

		const reader = response.body?.getReader();
		if (!reader) throw new Error('No response body');

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');

			for (let i = 0; i < lines.length - 1; i++) {
				const line = lines[i].trim();
				if (line.startsWith('data:')) {
					const payload = line.slice(5).trim();
					if (!payload || payload === '[DONE]') continue;
					try {
						const data = JSON.parse(payload);
						const chunk = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content;
						if (chunk) yield chunk;
					} catch {
						// ignore parse errors for partial json
					}
				}
			}

			buffer = lines[lines.length - 1];
		}

		if (buffer.trim()) {
			try {
				const trimmed = buffer.trim();
				if (trimmed.startsWith('data:')) {
					const payload = trimmed.slice(5).trim();
					if (payload && payload !== '[DONE]') {
						const data = JSON.parse(payload);
						const chunk = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content;
						if (chunk) {
							yield chunk;
						}
					}
				}
			} catch {
				// ignore
			}
		}
	} catch (error) {
		console.error('Stream generation failed:', error);
		throw error;
	}
}
