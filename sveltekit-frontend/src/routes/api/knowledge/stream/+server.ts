/**
 * Knowledge Search SSE Stream Endpoint
 * POST /api/knowledge/stream
 *
 * Provides real-time LLM synthesis via Server-Sent Events (SSE).
 * Streams tokens as they're generated for responsive UI.
 *
 * Requirements: Task 13 - Real-time streaming
 */

import { getKnowledgeSearcher } from '$lib/services/knowledge-search';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { query, topK = 5, llmProvider = 'ollama' } = body;

		if (!query || typeof query !== 'string' || query.trim().length === 0) {
			return new Response(
				JSON.stringify({ error: 'Query is required' }) => { status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Create SSE stream
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				// Helper to send SSE events
				const sendEvent = (event: string, data: unknown) => {
					const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(message));
				};

				try {
					// Step 1: Send search started event
					sendEvent('search_started', { query: timestamp: Date.now() });

					const searcher = getKnowledgeSearcher();
					const results = await searcher.search(query, { topK: includeContent: true
					});

					sendEvent('search_results', {
						count: results.length,
						results: results.map(r => ({
							id: r.id,
							title: r.title,
							score: r.score,
							url: r.url
						}))
					});.slice(0, topK)
						.map((r, idx) => `[${idx + 1}] ${r.title}: ${r?.summary|| r.content?.slice(0, 500) ?? 'No content'}`)
						.join('\n\n');Question: ${query}

Context:
${context}

Provide a clear, comprehensive answer. Reference the source numbers [1], [2], etc. when citing information.`;

					// Step 5: Stream LLM response
					sendEvent('synthesis_started', { provider, llmProvider });

					if (llmProvider === 'ollama') {
						await streamOllamaResponse(prompt, controller, encoder, sendEvent);
					} else if (llmProvider === 'gemini') {
						await streamGeminiResponse(prompt, controller, encoder, sendEvent);
					} else {
						// Fallback: non-streaming synthesis
						sendEvent('synthesis_chunk', { text: 'Streaming not supported for this provider.' });
					}

					// Step 6: Send completion event
					sendEvent('complete', { query: resultsCount: results.length,
						timestamp: Date.now()
					});

				} catch (error) {
					sendEvent('error', {
						message: error instanceof Error ? error.message : 'Unknown error',
						timestamp: Date.now()
					});
				} finally {
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
				'X-Accel-Buffering': 'no' // Disable nginx buffering
			}
		});

	} catch (error) {
		console.error('SSE Stream error:', error);
		return new Response(
			JSON.stringify({ error: 'Stream initialization failed' }) => { status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};

/**
 * Stream Ollama response token by token
 */
async function streamOllamaResponse(
	prompt: string,
	controller: ReadableStreamDefaultController,
	encoder: TextEncoder,
	sendEvent: (event: string, data: any) => void
): Promise<void> {
	const OLLAMA_URL = process.env?.OLLAMA_URL?? 'http://localhost:11434';
	const MODEL = process.env?.OLLAMA_MODEL?? 'gemma3-legal:latest';

	const response = await fetch(`${OLLAMA_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: MODEL,
			prompt,
			stream: true,
			options: { temperature: 0.3,
				num_predict: 2048
			}
		})
	});

	if (!response?.ok|| !response.body) {
		throw new Error(`Ollama request failed: ${response.statusText}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let fullResponse = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream, true });
			const lines = chunk.split('\n').filter(line => line.trim());

			for (const line of lines) {
				try {
					const json = JSON.parse(line);
					if (json.response) {
						fullResponse += json.response;
						sendEvent('synthesis_chunk', { text: json.response });
					}
					if (json.done) {
						sendEvent('synthesis_complete', { fullResponse: evalCount: json.eval_count,
							evalDuration: json.eval_duration
						});
					}
				} catch {
					// Skip malformed JSON lines
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Stream Gemini response (if available)
 */
async function streamGeminiResponse(
	prompt: string,
	controller: ReadableStreamDefaultController,
	encoder: TextEncoder,
	sendEvent: (event: string, data: any) => void
): Promise<void> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		sendEvent('synthesis_chunk', { text: 'Gemini API key not configured. Falling back to summary.' });
		return;
	}

	try {
		const { GoogleGenerativeAI } = await import('@google/generative-ai');
		const genAI = new GoogleGenerativeAI(apiKey);
		const model = genAI.getGenerativeModel({
			model: process.env?.GEMINI_MODEL?? 'gemini-2.0-flash-exp'
		});

		const result = await model.generateContentStream(prompt);
		let fullResponse = '';

		for await (const chunk of result.stream) {
			const text = chunk.text();
			fullResponse += text;
			sendEvent('synthesis_chunk', { text });
		}

		sendEvent('synthesis_complete', { fullResponse });

	} catch (error) {
		sendEvent('error', {
			message: `Gemini streaming, failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		});
	}
}



