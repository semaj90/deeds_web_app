// XState v5 Document Processing Workflow
// Models the server-side document processing pipeline:
//   idle → extracting → chunking → embedding → indexing → completed
// Used by orchestrator.ts for tracked workflow execution
import { assign, setup, fromPromise } from 'xstate';

export interface DocumentProcessingContext {
	documentId: string;
	content: string;
	metadata: Record<string, unknown>;
	extractedText: string;
	chunks: string[];
	embeddingCount: number;
	progress: number;
	errors: string[];
	status: 'pending' | 'processing' | 'completed' | 'failed';
}

export type DocumentProcessingEvent =
	| { type: 'START_PROCESSING'; documentId: string; content: string; metadata?: Record<string, unknown> }
	| { type: 'RETRY' };

// Actor: Extract text from document via Docling/OCR pipeline
const extractText = fromPromise<{ text: string; method: string }, { documentId: string; content: string }>(
	async ({ input }) => {
		const res = await fetch('/api/evidence/extract', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ documentId: input.documentId, content: input.content }),
		});
		if (!res.ok) throw new Error(`Extraction failed: ${res.status}`);
		return res.json();
	}
);

// Actor: Chunk extracted text using legal-chunker
const chunkDocument = fromPromise<{ chunks: string[]; count: number }, { text: string; documentId: string }>(
	async ({ input }) => {
		// Use the legal chunker's structure-aware splitting
		const { chunkText } = await import('$lib/server/indexer/legal-chunker.js');
		const chunks = chunkText(input.text, { maxChunkSize: 1500, overlap: 200 });
		return { chunks, count: chunks.length };
	}
);

// Actor: Generate embeddings for chunks and upsert to Qdrant
const embedAndIndex = fromPromise<{ indexed: number }, { chunks: string[]; documentId: string; metadata: Record<string, unknown> }>(
	async ({ input }) => {
		const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

		const points = [];
		for (let i = 0; i < input.chunks.length; i++) {
			try {
				const embedding = await generateSingleEmbedding(input.chunks[i].slice(0, 2048));
				if (embedding?.length) {
					points.push({
						id: `doc-${input.documentId}-chunk-${i}`,
						vector: embedding,
						payload: {
							documentId: input.documentId,
							chunkIndex: i,
							content: input.chunks[i].slice(0, 500),
							...input.metadata,
						},
					});
				}
			} catch {
				// Skip failed chunks, continue with rest
			}
		}

		if (points.length > 0) {
			await qdrant.batchUpsert({
				collection: 'legal_documents' as any,
				points,
			});
		}

		return { indexed: points.length };
	}
);

export const documentProcessingMachine = setup({
	types: {
		context: {} as DocumentProcessingContext,
		events: {} as DocumentProcessingEvent,
	},
	actors: {
		extractText,
		chunkDocument,
		embedAndIndex,
	},
}).createMachine({
	id: 'documentProcessing',
	initial: 'idle',
	context: {
		documentId: '',
		content: '',
		metadata: {},
		extractedText: '',
		chunks: [],
		embeddingCount: 0,
		progress: 0,
		errors: [],
		status: 'pending',
	},
	states: {
		idle: {
			on: {
				START_PROCESSING: {
					target: 'extracting',
					actions: assign(({ event }) => ({
						documentId: event.documentId,
						content: event.content,
						metadata: event.metadata ?? {},
						progress: 5,
						status: 'processing' as const,
						errors: [],
					})),
				},
			},
		},

		extracting: {
			invoke: {
				src: 'extractText',
				input: ({ context }) => ({
					documentId: context.documentId,
					content: context.content,
				}),
				onDone: {
					target: 'chunking',
					actions: assign(({ event }) => ({
						extractedText: event.output.text,
						progress: 30,
					})),
				},
				onError: {
					target: 'failed',
					actions: assign(({ event }) => ({
						errors: [`Extraction error: ${(event.error as Error).message}`],
						status: 'failed' as const,
					})),
				},
			},
		},

		chunking: {
			invoke: {
				src: 'chunkDocument',
				input: ({ context }) => ({
					text: context.extractedText,
					documentId: context.documentId,
				}),
				onDone: {
					target: 'embedding',
					actions: assign(({ event }) => ({
						chunks: event.output.chunks,
						progress: 55,
					})),
				},
				onError: {
					target: 'failed',
					actions: assign(({ event }) => ({
						errors: [`Chunking error: ${(event.error as Error).message}`],
						status: 'failed' as const,
					})),
				},
			},
		},

		embedding: {
			invoke: {
				src: 'embedAndIndex',
				input: ({ context }) => ({
					chunks: context.chunks,
					documentId: context.documentId,
					metadata: context.metadata,
				}),
				onDone: {
					target: 'completed',
					actions: assign(({ event }) => ({
						embeddingCount: event.output.indexed,
						progress: 100,
						status: 'completed' as const,
					})),
				},
				onError: {
					target: 'failed',
					actions: assign(({ event }) => ({
						errors: [`Embedding error: ${(event.error as Error).message}`],
						status: 'failed' as const,
					})),
				},
			},
		},

		completed: {
			type: 'final',
		},

		failed: {
			on: {
				RETRY: {
					target: 'extracting',
					actions: assign(() => ({
						errors: [],
						progress: 5,
						status: 'processing' as const,
					})),
				},
			},
		},
	},
});
