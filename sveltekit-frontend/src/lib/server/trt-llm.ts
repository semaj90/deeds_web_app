/**
 * TensorRT-LLM Inference Client
 *
 * GPU-accelerated inference via TRT-LLM container (host port 8099 by default).
 * Uses /v1/completions endpoint (OpenAI-compatible API).
 * Requires GPU arbiter lease before calling.
 */
import { ENV } from '$lib/server/env.server.js';

const getEndpoint = () => ENV.TENSORRT_URL;

export interface TrtLlmRequest {
	prompt: string;
	maxTokens?: number;
	temperature?: number;
	stream?: boolean;
}

export interface TrtLlmResponse {
	text: string;
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
	error?: string;
}

/**
 * Non-streaming inference via TRT-LLM /v1/completions.
 */
export async function inferLLM(request: TrtLlmRequest): Promise<TrtLlmResponse> {
	const endpoint = getEndpoint();

	try {
		const res = await fetch(`${endpoint}/v1/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt: request.prompt,
				max_tokens: request.maxTokens ?? 2048,
				temperature: request.temperature ?? 0.7,
				stream: false
			}),
			signal: AbortSignal.timeout(60000)
		});

		if (!res.ok) {
			const errText = await res.text().catch(() => '');
			return { text: '', error: `TRT-LLM error ${res.status}: ${errText.slice(0, 200)}` };
		}

		const data = (await res.json()) as {
			choices?: Array<{ text: string }>;
			usage?: TrtLlmResponse['usage'];
		};

		return {
			text: data.choices?.[0]?.text ?? '',
			usage: data.usage
		};
	} catch (err) {
		return {
			text: '',
			error: err instanceof Error ? err.message : 'Failed to connect to TensorRT-LLM'
		};
	}
}

/**
 * Streaming inference via TRT-LLM /v1/completions with stream=true.
 */
export async function* streamLLM(
	request: TrtLlmRequest
): AsyncGenerator<{ content: string; done: boolean }> {
	const endpoint = getEndpoint();

	const res = await fetch(`${endpoint}/v1/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			prompt: request.prompt,
			max_tokens: request.maxTokens ?? 2048,
			temperature: request.temperature ?? 0.7,
			stream: true
		}),
		signal: AbortSignal.timeout(60000)
	});

	if (!res.ok || !res.body) {
		throw new Error(`TRT-LLM stream error: ${res.status}`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;
			const data = line.slice(6).trim();
			if (data === '[DONE]') {
				yield { content: '', done: true };
				return;
			}
			try {
				const json = JSON.parse(data);
				const text = json.choices?.[0]?.text ?? '';
				yield { content: text, done: false };
			} catch {
				// skip malformed SSE
			}
		}
	}

	yield { content: '', done: true };
}

/**
 * Health check — verify TRT-LLM is accepting requests.
 */
export async function healthCheck(): Promise<boolean> {
	try {
		const endpoint = getEndpoint();
		const res = await fetch(`${endpoint}/health`, {
			signal: AbortSignal.timeout(2000)
		});
		return res.ok;
	} catch {
		return false;
	}
}
