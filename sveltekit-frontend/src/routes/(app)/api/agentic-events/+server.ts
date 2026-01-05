// API endpoint: /api/agentic-events
// Server-Sent Events stream for real-time agentic pipeline updates
// Connects to Phase 89 Enhanced Pipeline with CUDA clustering

import EnhancedAgenticPipeline from '../../../../scripts/phase89-enhanced-pipeline.mjs';
import type { RequestHandler } from './$types';

// Global pipeline instance (shared across SSE connections)
let globalPipeline: InstanceType<typeof EnhancedAgenticPipeline> | null = null;

export const GET: RequestHandler = async ({ request: request }) => {
	// Initialize pipeline if not exists
	if (!globalPipeline) {
		globalPipeline = new EnhancedAgenticPipeline();
	}

	const stream = new ReadableStream({
		start(controller) {
			// Send initial connection message
			controller.enqueue(': connected\n\n');

			// Send heartbeat every 30s
			const heartbeat = setInterval(() => {
				controller.enqueue(`: heartbeat\n\n`);
			}, 30000);

			// Create SSE responder that writes to controller
			const sseResponder = {
				write: (message: string) => {
					try {
						controller.enqueue(message);
					} catch (err) {
						console.error('Failed to write SSE:', err);
					}
				}
			};

			// Register with global pipeline
			globalPipeline!.addSSEClient(sseResponder);

			// Listen for pipeline events
			const eventHandlers: Record<string, (data: any) => void> = {
				stage_started: (data) => {
					controller.enqueue(
						`event: stage_started\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				clustering_complete: (data) => {
					controller.enqueue(
						`event: clustering_complete\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				recommendations_fetched: (data) => {
					controller.enqueue(
						`event: recommendations_fetched\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				fix_proposed: (data) => {
					controller.enqueue(
						`event: fix_proposed\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				fix_applied: (data) => {
					controller.enqueue(
						`event: fix_applied\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				pattern_learned: (data) => {
					controller.enqueue(
						`event: pattern_learned\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				rag_updated: (data) => {
					controller.enqueue(
						`event: rag_updated\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				kag_updated: (data) => {
					controller.enqueue(
						`event: kag_updated\ndata: ${JSON.stringify(data)}\n\n`
					);
				},
				ranking_complete: (data) => {
					controller.enqueue(
						`event: ranking_complete\ndata: ${JSON.stringify(data)}\n\n`
					);
				}
			};

			// Register all event handlers
			for (const [eventName, handler] of Object.entries(eventHandlers)) {
				globalPipeline!.on(eventName, handler);
			}

			// Cleanup on disconnect
			request.signal.addEventListener('abort', () => {
				clearInterval(heartbeat);
				globalPipeline!.removeSSEClient(sseResponder);

				// Remove all event handlers
				for (const [eventName, handler] of Object.entries(eventHandlers)) {
					globalPipeline!.removeListener(eventName, handler);
				}

				controller.close();
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
