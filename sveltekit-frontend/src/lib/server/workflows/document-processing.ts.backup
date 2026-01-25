// XState v5 Document Processing Workflow - Minimal Stub
import { createMachine } from 'xstate';

export interface DocumentProcessingContext {
	documentId: string;
	content: string;
	metadata: Record<string, unknown>;
	chunks: string[];
	progress: number;
	errors: string[];
	status: 'pending' | 'processing' | 'completed' | 'failed';
}

export type DocumentProcessingEvent =
	| { type: 'START_PROCESSING'; documentId: string; content: string }
	| { type: 'COMPLETE' }
	| { type: 'FAIL'; error: string };

export const documentProcessingMachine = createMachine({
	id: 'documentProcessing',
	initial: 'idle',
	context: {
		documentId: '',
		content: '',
		metadata: {},
		chunks: [],
		progress: 0,
		errors: [],
		status: 'pending',
	} as DocumentProcessingContext,
	states: {
		idle: {
			on: { START_PROCESSING: 'processing' },
		},
		processing: {
			on: {
				COMPLETE: 'completed',
				FAIL: 'failed',
			},
		},
		completed: {
			type: 'final',
		},
		failed: {
			type: 'final',
		},
	},
});





