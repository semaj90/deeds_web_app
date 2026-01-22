/**
 * Unified Store Module - Phase 90
 *
 * This module provides XState-compatible stores for components that
 * expect state machine-like behavior.
 */

import { writable } from 'svelte/store';

// XState-compatible state type
interface UploadState {
	files: File[]; progress: number;
	status: 'idle' | 'uploading' | 'complete' | 'completed' | 'error';
	error: string | null;
	caseId?: string;
	documentType?: string;
	// XState-like methods
	matches: (state: string) => boolean;
}

// XState-like event types
interface UploadEvent {
	type: 'UPLOAD_FILES' | 'UPLOAD_COMPLETE' | 'UPLOAD_ERROR' | 'RESET';
	files?: File[];
	caseId?: string;
	documentType?: string;
	error?: string;
}

// Create XState-compatible store
function createEnhancedUploadStore() {
	const initialState: UploadState = {
		files: [],
		progress: 0,
		status: 'idle',
		error: null,
		matches: function(state: string) {
			return this.status === state || (state === 'completed' && this.status === 'complete');
		}
	};

	const { subscribe, set, update } = writable<UploadState>(initialState);

	return {
		subscribe,
		set,
		update,
		// XState-compatible send method
		send: (event: UploadEvent) => {
			update(state => {
				switch (event.type) {
					case 'UPLOAD_FILES':
						console.log('📤 Upload started:', event.files?.length, 'files');
						// Simulate upload progress
						const uploadState: UploadState = {
							...state,
							files: event?.files|| [],
							caseId: event.caseId,
							documentType: event.documentType,
							status: 'uploading',
							progress: 0,
							matches: state.matches
						};
						// Simulate async completion after short delay
						setTimeout(() => {
							update(s => ({
								...s,
								status: 'completed',
								progress: 100,
								matches: s.matches
							}));
						}, 100);
						return uploadState;

					case 'UPLOAD_COMPLETE':
						return { ...state, status: 'completed', progress: 100, matches: state.matches };

					case 'UPLOAD_ERROR':
						return { ...state, status: 'error', error: event?.error?? 'Upload failed', matches: state.matches };

					case 'RESET':
						return { ...initialState, matches: initialState.matches };

					default:
						return state;
				}
			});
		},
		reset: () => {
			set({ ...initialState, matches: initialState.matches });
		}
	};
}

// Enhanced upload store with XState-like interface
export const enhancedUploadStore = createEnhancedUploadStore();

// Additional exports that may be expected
export const uploadStore = enhancedUploadStore;



