import { assign, setup } from 'xstate';

export interface EvidenceUploadProgressContext {
	progress: number;
	step: string;
	message: string;
	evidenceId: string | null;
	connected: boolean;
	error: string | null;
}

export type EvidenceUploadProgressEvent =
	| { type: 'CONNECTED' }
	| { type: 'CONNECTION_LOST' }
	| { type: 'PROGRESS'; progress: number; step: string; message: string; evidenceId?: string | null }
	| { type: 'COMPLETE'; message: string; evidenceId?: string | null }
	| { type: 'FAILED'; message: string }
	| { type: 'RECONNECT' };

export const evidenceUploadProgressMachine = setup({
	types: {
		context: {} as EvidenceUploadProgressContext,
		events: {} as EvidenceUploadProgressEvent,
	},
	actions: {
		setConnected: assign({ connected: true, error: null }),
		setDisconnected: assign({ connected: false }),
		applyProgress: assign(({ context, event }) => {
			if (event.type !== 'PROGRESS') return {};
			const nextProgress = Math.max(0, Math.min(100, Math.round(event.progress)));
			if (nextProgress < context.progress) return { connected: true };
			return {
				progress: nextProgress,
				step: event.step,
				message: event.message,
				evidenceId: event.evidenceId ?? context.evidenceId,
				connected: true,
			};
		}),
		applyCompletion: assign(({ context, event }) => event.type === 'COMPLETE' ? {
			progress: 100,
			step: 'complete',
			message: event.message,
			evidenceId: event.evidenceId ?? context.evidenceId,
			connected: true,
		} : {}),
		applyFailure: assign(({ event }) => event.type === 'FAILED' ? {
			step: 'error',
			message: event.message,
			error: event.message,
		} : {}),
	},
}).createMachine({
	id: 'evidence-upload-progress-v1',
	initial: 'connecting',
	context: { progress: 0, step: 'uploading', message: 'Connecting to processing status…', evidenceId: null, connected: false, error: null },
	states: {
		connecting: {
			on: {
				CONNECTED: { target: 'processing', actions: 'setConnected' },
				PROGRESS: { target: 'processing', actions: 'applyProgress' },
				COMPLETE: { target: 'complete', actions: 'applyCompletion' },
				FAILED: { target: 'failed', actions: 'applyFailure' },
				CONNECTION_LOST: { actions: 'setDisconnected' },
			},
		},
		processing: {
			on: {
				PROGRESS: { actions: 'applyProgress' },
				COMPLETE: { target: 'complete', actions: 'applyCompletion' },
				FAILED: { target: 'failed', actions: 'applyFailure' },
				CONNECTION_LOST: { target: 'connecting', actions: 'setDisconnected' },
				CONNECTED: { actions: 'setConnected' },
			},
		},
		complete: { type: 'final' },
		failed: {
			on: {
				RECONNECT: { target: 'connecting', actions: assign({ error: null, connected: false }) },
			},
		},
	},
});
