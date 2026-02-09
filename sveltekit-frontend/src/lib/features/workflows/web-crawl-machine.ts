/**
 * XState Workflow Machine for Web Crawling
 * Orchestrates the ACE web-crawl pipeline with state management
 */

// TODO: Fix XState v5 setup import - may need to install xstate@^5.0.0
// @ts-ignore - XState version mismatch
import { assign, setup } from 'xstate';

interface WebCrawlContext {
	jobId: string;
	urls: string[];
	userId?: string;
	sessionId?: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	results: {
		screenshotsCaptured: number;
		htmlExtracted: number;
		vectorsGenerated: number;
		cudaProcessed: boolean;
	};
	error?: string;
}

type WebCrawlEvent =
	| { type: 'START_CRAWL' }
	| { type: 'URL_PROCESSED'; data: { url: string; success: boolean } }
	| { type: 'CUDA_COMPLETE' }
	| { type: 'VECTORS_STORED' }
	| { type: 'RAG_COMPLETE' }
	| { type: 'ERROR'; error: string }
	| { type: 'COMPLETE' };

export const webCrawlMachine = setup({
	types: {
		context: {} as WebCrawlContext,
		events: {} as WebCrawlEvent
	},
	actions: {
		updateProcessed: assign({
			results: ({ context, event }) => {
				if (event.type === 'URL_PROCESSED' && event.data.success) {
					return {
						...context.results,
						htmlExtracted: context.results.htmlExtracted + 1,
						screenshotsCaptured: context.results.screenshotsCaptured + 1
					};
				}
				return context.results;
			}
		}),
		updateVectors: assign({
			results: ({ context }) => ({
				...context.results,
				vectorsGenerated: context.results.htmlExtracted
			})
		}),
		markCudaComplete: assign({
			results: ({ context }) => ({
				...context.results,
				cudaProcessed: true
			})
		}),
		setError: assign({
			error: ({ event }) => event.type === 'ERROR' ? event.error  | undefined,
			status: () => 'failed' as const
		}),
		setComplete: assign({
			status: 'completed'
		})
	},
	guards: {
		allUrlsProcessed: ({ context }) =>
			context.results.htmlExtracted >= context.urls.length,
		hasError: ({ context }) => !!context.error
	}
}).createMachine({
	id: 'webCrawl',
	initial: 'idle',
	context: ({ input }) => input,
	states: {
		idle: {
			on: {
				START_CRAWL: 'crawling'
			}
		},
		crawling: {
			on: {
				URL_PROCESSED: {
					actions: 'updateProcessed',
					target: 'vectorizing',
					guard: 'allUrlsProcessed'
				},
				ERROR: {
					actions: 'setError',
					target: 'failed'
				}
			}
		},
		vectorizing: {
			on: {
				VECTORS_STORED: {
					actions: 'updateVectors',
					target: 'cudaProcessing'
				},
				ERROR: {
					actions: 'setError',
					target: 'failed'
				}
			}
		},
		cudaProcessing: {
			on: {
				CUDA_COMPLETE: {
					actions: 'markCudaComplete',
					target: 'ragProcessing'
				},
				ERROR: {
					actions: 'setError',
					target: 'failed'
				}
			}
		},
		ragProcessing: {
			on: {
				RAG_COMPLETE: {
					target: 'completed'
				},
				ERROR: {
					actions: 'setError',
					target: 'failed'
				}
			}
		},
		completed: {
			type: 'final',
			entry: 'setComplete'
		},
		failed: {
			type: 'final'
		}
	}
});
