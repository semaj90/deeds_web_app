// Upload Machine — XState v5 wrapper for EnhancedFileUpload component
// Creates a simple upload state machine with pipeline configuration
import { setup, assign } from 'xstate';

interface UploadContext {
	files: Array<{ name: string; size: number; status: string; progress: number }>;
	pipeline: any;
	error: string | null;
}

type UploadEvent =
	| { type: 'ADD_FILES'; files: Array<{ name: string; size: number }> }
	| { type: 'START' }
	| { type: 'PROGRESS'; fileIndex: number; progress: number }
	| { type: 'COMPLETE' }
	| { type: 'ERROR'; error: string }
	| { type: 'RESET' };

export function createUploadMachine(pipeline: any) {
	return setup({
		types: {
			context: {} as UploadContext,
			events: {} as UploadEvent,
		},
	}).createMachine({
		id: 'upload',
		initial: 'idle',
		context: {
			files: [],
			pipeline,
			error: null,
		},
		states: {
			idle: {
				on: {
					ADD_FILES: {
						actions: assign({
							files: ({ context, event }) => [
								...context.files,
								...event.files.map((f) => ({ ...f, status: 'pending', progress: 0 })),
							],
						}),
					},
					START: { target: 'uploading' },
				},
			},
			uploading: {
				on: {
					PROGRESS: {
						actions: assign({
							files: ({ context, event }) =>
								context.files.map((f, i) =>
									i === event.fileIndex ? { ...f, progress: event.progress } : f,
								),
						}),
					},
					COMPLETE: { target: 'done' },
					ERROR: {
						target: 'error',
						actions: assign({ error: ({ event }) => event.error }),
					},
				},
			},
			done: {
				on: { RESET: { target: 'idle', actions: assign({ files: () => [], error: () => null }) } },
			},
			error: {
				on: { RESET: { target: 'idle', actions: assign({ files: () => [], error: () => null }) } },
			},
		},
	});
}
