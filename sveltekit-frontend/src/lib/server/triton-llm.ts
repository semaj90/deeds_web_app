import { ENV } from '$lib/server/env.server.js';

const getEndpoint = () => ENV.TRITON_URL;
const getModel = () => ENV.TRITON_LLM_MODEL;
const withBasePath = (path: string) => `${getEndpoint().replace(/\/$/, '')}${path}`;

export interface TritonLlmRequest {
	prompt: string;
	maxTokens?: number;
	temperature?: number;
}

export interface TritonLlmResponse {
	text: string;
	error?: string;
}

function extractOutputText(payload: unknown): string {
	const outputs = (payload as { outputs?: Array<{ name?: string; data?: unknown[] }> } | null)?.outputs;
	if (!Array.isArray(outputs)) return '';

	const preferred = ['output_text', 'OUTPUT_TEXT', 'text', 'TEXT'];
	for (const name of preferred) {
		const match = outputs.find((output) => output.name === name);
		const value = match?.data?.[0];
		if (typeof value === 'string' && value.length > 0) return value;
	}

	for (const output of outputs) {
		const value = output.data?.[0];
		if (typeof value === 'string' && value.length > 0) return value;
	}

	return '';
}

export async function inferLLM(request: TritonLlmRequest): Promise<TritonLlmResponse> {
	try {
		const response = await fetch(withBasePath(`/v2/models/${encodeURIComponent(getModel())}/infer`), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				inputs: [
					{
						name: 'input_text',
						shape: [1],
						datatype: 'BYTES',
						data: [request.prompt]
					}
				],
				outputs: [{ name: 'output_text' }],
				parameters: {
					max_tokens: request.maxTokens ?? 2048,
					temperature: request.temperature ?? 0.7
				}
			}),
			signal: AbortSignal.timeout(15000)
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => '');
			return { text: '', error: `Triton error ${response.status}: ${errText.slice(0, 200)}` };
		}

		const data = await response.json();
		const text = extractOutputText(data);
		return text ? { text } : { text: '', error: 'Triton returned no output text' };
	} catch (err) {
		return {
			text: '',
			error: err instanceof Error ? err.message : 'Failed to connect to Triton'
		};
	}
}

/**
 * Streaming inference via Triton generate_stream endpoint.
 * Falls back to non-streaming infer + single yield if generate_stream unavailable.
 */
export async function* streamLLM(
	request: TritonLlmRequest
): AsyncGenerator<{ content: string; done: boolean }> {
	const model = getModel();

	// Try Triton's generate_stream endpoint first (vLLM backend)
	try {
		const response = await fetch(
			withBasePath(`/v2/models/${encodeURIComponent(model)}/generate_stream`),
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text_input: request.prompt,
					parameters: {
						max_tokens: request.maxTokens ?? 2048,
						temperature: request.temperature ?? 0.7,
						stream: true,
					},
				}),
				signal: AbortSignal.timeout(60000),
			}
		);

		if (response.ok && response.body) {
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data:')) continue;
					const data = line.slice(5).trim();
					if (data === '[DONE]') {
						yield { content: '', done: true };
						return;
					}
					try {
						const json = JSON.parse(data);
						const text = json.text_output ?? json.text ?? '';
						if (text) yield { content: text, done: false };
					} catch {
						// skip malformed SSE
					}
				}
			}

			yield { content: '', done: true };
			return;
		}
	} catch {
		// generate_stream not available — fall back to non-streaming
	}

	// Fallback: non-streaming infer, yield complete text as single chunk
	const result = await inferLLM(request);
	if (result.text) {
		yield { content: result.text, done: false };
	}
	yield { content: '', done: true };
}

export async function healthCheck(): Promise<boolean> {
	return healthCheckModel(getModel());
}

export async function healthCheckModel(modelName: string): Promise<boolean> {
	try {
		const response = await fetch(withBasePath(`/v2/models/${encodeURIComponent(modelName)}/ready`), {
			signal: AbortSignal.timeout(2000)
		});
		if (response.ok) return true;
	} catch {
		// Fall through to server-wide readiness check.
	}

	try {
		const response = await fetch(withBasePath('/v2/health/ready'), {
			signal: AbortSignal.timeout(2000)
		});
		return response.ok;
	} catch {
		return false;
	}
}
