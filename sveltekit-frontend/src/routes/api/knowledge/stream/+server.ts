import { json } from '@sveltejs/kit';
/**
 * Knowledge Search SSE Stream Endpoint
 * POST /api/knowledge/stream
 *
 * Provides real-time LLM synthesis via Server-Sent Events (SSE).
 * Streams tokens as they're generated for responsive UI.
 */

import { getKnowledgeSearcher } from '$lib/server/services/knowledge-search/KnowledgeSearcher.js';

import { routeStreamingInference } from '$lib/server/inference/inference-router.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { embedText } from '$lib/server/embedding/embed.js';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

// Zod schema validates query (trimmed, 1-5000), topK (1-100), llmProvider enum
const knowledgeStreamSchema = z.object({
  query: z.string().trim().min(1, 'Query is required').max(5000),
  topK: z.number().int().min(1).max(100).optional().default(5),
  llmProvider: z.enum(['ollama']).optional().default('ollama'),
  sectionTypes: z
    .array(
      z.enum([
        'facts',
        'issues',
        'reasoning',
        'holding',
        'citations',
        'parties',
        'motions',
        'bibliography',
        'procedural_history',
        'sentencing',
        'judgment',
      ])
    )
    .max(11)
    .optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = knowledgeStreamSchema.safeParse(await request.json());
		if (!parsed.success) {
			return new Response(
				JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}
		const { query, topK, sectionTypes } = parsed.data;
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
									.map((r: { payload?: Record<string, unknown> }, i: number) => {
										const label = String(r.payload?.section_type ?? 'UNKNOWN').toUpperCase();
										const text = String(r.payload?.content_preview ?? r.payload?.content ?? '');
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
						results: results.map((r: Record<string, any>) => ({
							id: r.id,
							title: r.title,
							score: r.scores ?? r.similarity ?? 0,
							url: r.url ?? ''
						}))
					});

					// Build context from results (prepend section context if available)
					const knowledgeContext = results
						.slice(0, topK)
						.map((r, idx: number) => `[${idx + 1}] ${r.title}: ${r?.summary || (r.content?.slice(0, 500) ?? 'No content')}`)
						.join('\n\n');

					const fullContext = sectionContext
						? `Section-Filtered Evidence:\n${sectionContext}\n\nKnowledge Base:\n${knowledgeContext}`
						: knowledgeContext;

					const prompt = `Question: ${query}\n\nContext:\n${fullContext}\n\nProvide a clear, comprehensive answer. Reference the source numbers [1], [2], etc. when citing information.`;

					// Step 5: Stream LLM response
					sendEvent('synthesis_started', { provider: 'ollama' });
          await streamOllamaResponse(prompt, controller, encoder, sendEvent);

					// Step 6: Send completion event
					sendEvent('complete', {
						query,
						resultsCount: results.length,
						timestamp: Date.now()
					});

				} catch (error) {
					sendEvent('error', {
						message: 'Stream error',
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
 * Stream LLM response token by token via inference cascade (TRT-LLM → Triton → Ollama).
 */
async function streamOllamaResponse(
	prompt: string,
	_controller: ReadableStreamDefaultController,
	_encoder: TextEncoder,
	sendEvent: (event: string, data: unknown) => void
): Promise<void> {
  const start = performance.now();
  let fullResponse = '';
  let backend: string = 'ollama';
  let tokenCount = 0;

  for await (const chunk of routeStreamingInference({
    prompt,
    temperature: 0.3,
    maxTokens: 2048,
  })) {
    if (chunk.done) {
      sendEvent('synthesis_complete', {
        fullResponse,
        backend: chunk.backend ?? backend,
      });
      break;
    }
    if (chunk.content) {
      fullResponse += chunk.content;
      tokenCount++;
      sendEvent('synthesis_chunk', { text: chunk.content });
      if (chunk.backend) backend = chunk.backend;
    }
  }

  logInference({
    type: 'llm',
    model: backend === 'ollama' ? 'gemma4-legal:latest' : backend,
    backend: backend as 'ollama' | 'tensorrt' | 'triton',
    latencyMs: Math.round(performance.now() - start),
    tokenCount,
    cacheHit: false,
  });
}
