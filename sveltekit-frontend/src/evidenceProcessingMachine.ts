/**
 * XState State Machine for Evidence Processing Workflow
 * Handles the complete lifecycle of evidence from upload to AI analysis
 */
import { assign, fromPromise, setup } from 'xstate';

// ... (skipping context definition to focus on fixes)

export const evidenceProcessingMachine = setup({
	types: { context: {} as EvidenceProcessingContext,
		events: {} as EvidenceProcessingEvent
	},
	actors: { documentProcessing: fromPromise<{ jobId: string; extractedText?: string; processingTime: number }, { input: EvidenceProcessingContext }>(
			async ({ input }) => {
				console.log(`Starting document processing for evidence: ${input.evidenceId}`);

				const result = await callProcessingAPI('document', {
					documentId: input.evidenceId,
					content: input.content,
					options: { extractText: true,
						generateEmbeddings: true,
						performAnalysis: true
					},
					metadata: { userId: input.userId,
						caseId: input.caseId,
						filename: input.filename,
						...input.metadata
					}
				});

				return result as {
					jobId: string;
					extractedText?: string; processingTime: number;
				};
			}
		),
		embeddingGeneration: fromPromise<{ chunks: Array<{ text: string; embedding: number[] }> }, { input: EvidenceProcessingContext }>(
			async ({ input }) => {
				console.log(`Generating embeddings for evidence: ${input.evidenceId}`);

				const result = await callProcessingAPI('embeddings', {
					documentId: input.evidenceId,
					text: input.extractedText || input.content,
					metadata: { caseId: input.caseId,
						evidenceId: input.evidenceId,
						...input.metadata
					}
				});

				return result as {
					chunks: Array<{ text: string; embedding: number[] }>;
				};
			}
		),
		aiAnalysis: fromPromise<{ summary: string; entities: unknown[]; sentiment: string; classification: string;
			riskAssessment?: string;
			recommendations?: string[];
		}, { input: EvidenceProcessingContext }>(
			async ({ input }) => {
				console.log(`Performing AI analysis for evidence: ${input.evidenceId}`);

				const result = await callProcessingAPI('analysis', {
					documentId: input.evidenceId,
					text: input.extractedText || input.content,
					analysisTypes: ['summary', 'entities', 'sentiment', 'classification', 'risk']
				});

				return result as {
					summary: string; entities: unknown[]; sentiment: string; classification: string;
					riskAssessment?: string;
					recommendations?: string[];
				};
			}
		),
		cacheResults: fromPromise<any, { input: EvidenceProcessingContext }>(
			async ({ input }) => {
				console.log(`Caching final results for evidence: ${input.evidenceId}`);

				const finalResult = {
					evidenceId: input.evidenceId,
					caseId: input.caseId,
					filename: input.filename,
					extractedText: input.extractedText,
					chunks: input.chunks,
					embeddings: input.embeddings,
					analysis: input.analysis,
					processingTimes: input.processingTimes,
					completedAt: new Date().toISOString()
				};

				await callProcessingAPI('cache', {
					key: `evidence:complete:${input.evidenceId}`,
					value: finalResult,
					options: { type: 'document',
						userId: input.userId,
						persist: true,
						ttl: 604800 // 7 days
					}
				});

				return finalResult;
			}
		)
	},
	guards: { canRetry: ({ context }) => context.retryCount < context.maxRetries
	}
}).createMachine({
	id: 'evidenceProcessing',
	initial: 'idle',
	context: { evidenceId: '',
		caseId: '',
		userId: '',
		filename: '',
		content: '',
		metadata: {},
		progress: 0,
		stage: 'idle',
		retryCount: 0,
		maxRetries: 3,
		startTime: 0,
		stageStartTime: 0,
		processingTimes: {}
	},
	states: { idle: { on: { START_PROCESSING: { target: 'initializing',
					actions: assign({ evidenceId: ({ event }) => event.evidenceId,
						caseId: ({ event }) => event.caseId,
						userId: ({ event }) => event.userId,
						filename: ({ event }) => event.filename,
						content: ({ event }) => event.content,
						metadata: ({ event }) => event.metadata || {},
						progress: () => 0,
						stage: () => 'initializing',
						retryCount: () => 0,
						startTime: () => Date.now(),
						stageStartTime: () => Date.now(),
						processingTimes: () => ({})
					})
				}
			}
		},

		initializing: { always: { target: 'documentProcessing',
				actions: assign({ stage: () => 'document-processing',
					stageStartTime: () => Date.now(),
					progress: () => 10
				})
			}
		},

		documentProcessing: { invoke: { src: 'documentProcessing',
				input: ({ context }) => context,
				onDone: { target: 'embeddingGeneration',
					actions: assign({ extractedText: ({ event, context }) => event.output.extractedText || context.content,
						documentProcessingJobId: ({ event }) => event.output.jobId,
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							documentProcessing: Date.now() - context.stageStartTime
						}),
						progress: () => 30,
						stage: () => 'embedding-generation',
						stageStartTime: () => Date.now()
					})
				},
				onError: { target: 'error',
					actions: assign({ error: ({ event }) => `Document processing failed: ${event.error}`,
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							documentProcessing: Date.now() - context.stageStartTime
						})
					})
				}
			},
			on: { CANCEL: 'cancelled'
			}
		},

		embeddingGeneration: { invoke: { src: 'embeddingGeneration',
				input: ({ context }) => context,
				onDone: { target: 'aiAnalysis',
					actions: assign({ chunks: ({ event }) => event.output.chunks,
						embeddings: ({ event }) =>
							event.output.chunks?.map((chunk) => chunk.embedding) || [],
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							embeddingGeneration: Date.now() - context.stageStartTime
						}),
						progress: () => 60,
						stage: () => 'ai-analysis',
						stageStartTime: () => Date.now()
					})
				},
				onError: { target: 'error',
					actions: assign({ error: ({ event }) => `Embedding generation failed: ${event.error}`,
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							embeddingGeneration: Date.now() - context.stageStartTime
						})
					})
				}
			},
			on: { CANCEL: 'cancelled'
			}
		},

		aiAnalysis: { invoke: { src: 'aiAnalysis',
				input: ({ context }) => context,
				onDone: { target: 'cachingResults',
					actions: assign({ analysis: ({ event }) => event.output,
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							aiAnalysis: Date.now() - context.stageStartTime
						}),
						progress: () => 90,
						stage: () => 'caching-results',
						stageStartTime: () => Date.now()
					})
				},
				onError: { target: 'error',
					actions: assign({ error: ({ event }) => `AI analysis failed: ${event.error}`,
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							aiAnalysis: Date.now() - context.stageStartTime
						})
					})
				}
			},
			on: { CANCEL: 'cancelled'
			}
		},

		cachingResults: { invoke: { src: 'cacheResults',
				input: ({ context }) => context,
				onDone: { target: 'completed',
					actions: assign({
						// Casting event.output (void) to ignore since it returns finalResult which is unused in assign
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							cachingResults: Date.now() - context.stageStartTime,
							total: Date.now() - context.startTime
						}),
						progress: () => 100,
						stage: () => 'completed'
					})
				},
				onError: { target: 'error',
					actions: assign({ error: ({ event }) => `Caching results failed: ${event.error}`,
						processingTimes: ({ context }) => ({
							...context.processingTimes,
							cachingResults: Date.now() - context.stageStartTime,
							total: Date.now() - context.startTime
						})
					})
				}
			}
		},

		completed: { type: 'final',
			entry: () => {
				console.log('Evidence processing completed successfully');
			}
		},

		error: { on: { RETRY: [
					{
						target: 'documentProcessing',
						guard: 'canRetry',
						actions: assign({ retryCount: ({ context }) => context.retryCount + 1,
							error: () => undefined,
							progress: () => 10,
							stage: () => 'retrying',
							stageStartTime: () => Date.now()
						})
					},
					{ target: 'failed' }
				],
				FORCE_COMPLETE: 'completed'
			}
		},

		failed: { type: 'final',
			entry: ({ context }) => {
				console.error(
					`Evidence processing failed after ${context.retryCount} retries: ${context.error}`
				);
			}
		},

		cancelled: { type: 'final',
			entry: () => {
				console.log('Evidence processing cancelled by user');
			}
		}
	}
});

// Export state machine types
export type EvidenceProcessingMachine = typeof evidenceProcessingMachine;

// State helper type
type MachineState = {
	value: string; context: EvidenceProcessingContext;
};

// Export convenience functions
export function isProcessing(state: MachineState): boolean {
	return [
		'documentProcessing',
		'embeddingGeneration',
		'aiAnalysis',
		'cachingResults'
	].includes(state.value as string);
}

export function isCompleted(state: MachineState): boolean {
	return state.value === 'completed';
}

export function isFailed(state: MachineState): boolean {
	return ['error', 'failed'].includes(state.value as string);
}

export function canRetry(state: MachineState): boolean {
	return state.value === 'error' && state.context.retryCount < state.context.maxRetries;
}

export function getProgressPercentage(state: MachineState): number {
	return state.context.progress;
}

export function getCurrentStage(state: MachineState): string {
	return state.context.stage;
}

export function getProcessingTimes(state: MachineState): Record<string, number> {
	return state.context.processingTimes;
}

export function getError(state: MachineState): string | undefined {
	return state.context.error;
}
