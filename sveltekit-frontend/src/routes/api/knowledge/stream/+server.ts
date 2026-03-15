/**
 * Knowledge Search SSE Stream Endpoint
 * POST /api/knowledge/stream
 *
 * Provides real-time LLM synthesis via Server-Sent Events (SSE).
 * Streams tokens as they're generated for responsive UI.
 */

import { getKnowledgeSearcher } from '$lib/services/knowledge-search';
import { getOllamaUrl } from '$lib/config/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { embedText } from '$lib/server/embedding/embed.js';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

// Zod schema validates query (trimmed, 1-5000), topK (1-100), llmProvider enum
const knowledgeStreamSchema = z.object({
	query: z.string().trim().min(1, 'Query is required').max(5000),
	topK: z.number().int().min(1).max(100).optional().default(5),
	llmProvider: z.enum(['ollama', 'gemini']).optional().default('ollama'),
	sectionTypes: z.array(z.enum([
		'facts', 'issues', 'reasoning', 'holding', 'citations',
		'parties', 'motions', 'bibliography', 'procedural_history',
		'sentencing', 'judgment'
	])).max(11).optional(),
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const parsed = knowledgeStreamSchema.safeParse(await request.json());
		if (!parsed.success) {
			return new Response(
				JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}
		const { query, topK, llmProvider, sectionTypes } = parsed.data;
		const abortSignal = request.signal;

		// Create SSE stream
		const shared = { cleanup: () => {} };
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				let closed = false;

				const sendEvent = (event: string, data: unknown) => {
					if (closed) return;
					try {
						const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
						controller.enqueue(encoder.encode(message));
					} catch { closed = true; }
				};

				// Heartbeat every 25s to prevent proxy timeout
				const heartbeat = setInterval(() => {
					if (closed) { clearInterval(heartbeat); return; }
					try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); } catch { closed = true; clearInterval(heartbeat); }
				}, 25_000);

				shared.cleanup = () => { closed = true; clearInterval(heartbeat); };
				abortSignal.addEventListener('abort', shared.cleanup, { once: true });

				try {
					// Set reconnection interval (3s) for auto-reconnect on disconnect
					controller.enqueue(encoder.encode('retry: 3000\n\n'));

					// Step 1: Send search started event
					sendEvent('search_started', { query, timestamp: Date.now() });

					// Pre-search: section-filtered evidence via Qdrant (when sectionTypes provided)
					let sectionContext = '';
					if (sectionTypes?.length) {
						try {
							const queryEmbedding = await embedText(query);
							const sectionResults = await qdrant.sectionFilteredSearch({
								query,
								queryEmbedding: Array.from(queryEmbedding),
								sectionTypes,
								limit: 5,
								scoreThreshold: 0.4,
							});
							if (sectionResults.results.length > 0) {
								sectionContext = sectionResults.results
									.map((r: any, i: number) => {
										const label = r.payload?.section_type?.toUpperCase() ?? 'UNKNOWN';
										const text = r.payload?.content_preview ?? r.payload?.content ?? '';
										return `[SECTION ${i + 1} — ${label}] ${text.slice(0, 400)}`;
									})
									.join('\n\n');
								sendEvent('section_search_results', {
									count: sectionResults.results.length,
									sectionTypes,
								});
							}
						} catch {
							// Section pre-search failed — non-fatal, proceed without
						}
					}

					const searcher = getKnowledgeSearcher();
					const results = await searcher.search(query, { topK, includeContent: true });

					sendEvent('search_results', {
						count: results.length,
						results: results.map((r: any) => ({
							id: r.id,
							title: r.title,
							score: r.score,
							url: r.url
						}))
					});

					// Build context from results (prepend section context if available)
					const knowledgeContext = results
						.slice(0, topK)
						.map((r: any, idx: number) => `[${idx + 1}] ${r.title}: ${r?.summary || (r.content?.slice(0, 500) ?? 'No content')}`)
						.join('\n\n');

					const fullContext = sectionContext
						? `Section-Filtered Evidence:\n${sectionContext}\n\nKnowledge Base:\n${knowledgeContext}`
						: knowledgeContext;

					const prompt = `Question: ${query}\n\nContext:\n${fullContext}\n\nProvide a clear, comprehensive answer. Reference the source numbers [1], [2], etc. when citing information.`;

					// Step 5: Stream LLM response
					sendEvent('synthesis_started', { provider: llmProvider });

					if (llmProvider === 'ollama') {
						await streamOllamaResponse(prompt, controller, encoder, sendEvent);
					} else if (llmProvider === 'gemini') {
						await streamGeminiResponse(prompt, controller, encoder, sendEvent);
					} else {
						sendEvent('synthesis_chunk', { text: 'Streaming not supported for this provider.' });
					}

					// Step 6: Send completion event
					sendEvent('complete', {
						query,
						resultsCount: results.length,
						timestamp: Date.now()
					});

				} catch (error) {
					sendEvent('error', {
						message: error instanceof Error ? error.message : 'Unknown error',
						timestamp: Date.now()
					});
				} finally {
					shared.cleanup();
					controller.close();
				}
			},

			cancel() {
				shared.cleanup();
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
				'X-Accel-Buffering': 'no',
				'X-SSE-Retry': '3000'
			}
		});

	} catch (error) {
		console.error('SSE Stream error:', error);
		return new Response(
			JSON.stringify({ error: 'Stream initialization failed' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};

/**
 * Stream Ollama response token by token
 */
async function streamOllamaResponse(
	prompt: string,
	_controller: ReadableStreamDefaultController,
	_encoder: TextEncoder,
	sendEvent: (event: string, data: any) => void
): Promise<void> {
	const OLLAMA_URL = getOllamaUrl();
	const MODEL = process.env?.OLLAMA_MODEL ?? 'gemma3-legal:latest';

	const response = await traceLLM('knowledge-stream', { model: MODEL, prompt: prompt.slice(0, 500) }, async (gen) => {
		const res = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt,
				stream: true,
				keep_alive: process.env?.OLLAMA_KEEP_ALIVE ?? '24h',
				options: { temperature: 0.3, num_predict: 2048 }
			})
		});
		gen.end({ output: 'streaming' });
		return res;
	});

	if (!response?.ok || !response?.body) {
		throw new Error(`Ollama request failed: ${(response as Response)?.statusText ?? 'unknown'}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let fullResponse = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split('\n').filter(line => line.trim());

			for (const line of lines) {
				try {
					const parsed = JSON.parse(line);
					if (parsed.response) {
						fullResponse += parsed.response;
						sendEvent('synthesis_chunk', { text: parsed.response });
					}
					if (parsed.done) {
						sendEvent('synthesis_complete', {
							fullResponse,
							evalCount: parsed.eval_count,
							evalDuration: parsed.eval_duration
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
	_controller: ReadableStreamDefaultController,
	_encoder: TextEncoder,
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
			model: process.env?.GEMINI_MODEL ?? 'gemini-2.0-flash-exp'
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
			message: `Gemini streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		});
	}
}