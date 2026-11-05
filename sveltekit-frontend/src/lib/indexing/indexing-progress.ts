/**
 * Typed loading-state adapter for long-running Atlas operations.
 *
 * The server or durable worker owns progress. This module only projects real request outcomes and real
 * progress events into a state the loader can show. It never invents a percentage: `completed` and `total`
 * are null unless the source event carries real counts.
 *
 * Sources handled today:
 *   - request lifecycle of a synchronous POST (queued -> running -> complete | error)
 *   - SSE events from /api/codebase-index/index-stream (mirror_progress carries { mirrored, total })
 * A durable job feed (e.g. GET /api/indexing/jobs/:id/events) is not implemented yet. When it exists, map its
 * events through applyStreamEvent or add a sibling mapper here. Do not add a second progress model.
 */

export type AtlasOperation = 'INDEXING' | 'SEARCH' | 'GRAPHIFY' | 'SPZ';
export type AtlasLoadingStatus = 'queued' | 'running' | 'complete' | 'error';

export interface AtlasLoadingState {
	jobId: string | null;
	operation: AtlasOperation;
	stage: string | null;
	completed: number | null;
	total: number | null;
	status: AtlasLoadingStatus;
	errorMessage: string | null;
}

/** Stage labels for the index-stream SSE events. Unknown events are ignored, not shown. */
const STREAM_STAGES: Record<string, string> = {
	scroll: 'SCANNING FILES',
	summarize: 'SUMMARIZING CHUNKS',
	autoencode: 'ENCODING LATENTS',
	qdrant_upsert: 'UPSERTING QDRANT',
	mirror_progress: 'MIRRORING VECTORS',
	mirror: 'MIRRORING VECTORS',
	gpu_tag: 'TAGGING ON GPU'
};

export function createLoadingState(operation: AtlasOperation, jobId: string | null = null): AtlasLoadingState {
	return {
		jobId,
		operation,
		stage: null,
		completed: null,
		total: null,
		status: 'queued',
		errorMessage: null
	};
}

export function markRunning(state: AtlasLoadingState): AtlasLoadingState {
	if (isTerminal(state)) return state;
	return { ...state, status: 'running' };
}

export function markComplete(state: AtlasLoadingState): AtlasLoadingState {
	if (isTerminal(state)) return state;
	const total = state.total;
	return { ...state, status: 'complete', completed: total ?? state.completed, errorMessage: null };
}

export function markError(state: AtlasLoadingState, message: string): AtlasLoadingState {
	if (isTerminal(state)) return state;
	return { ...state, status: 'error', errorMessage: message };
}

export function isTerminal(state: AtlasLoadingState): boolean {
	return state.status === 'complete' || state.status === 'error';
}

function isCount(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Apply one SSE event from index-stream. Ignored when the state is already terminal, or when the event is unknown.
 * Counts are copied only when the event supplies both `mirrored`/`total` (or a numeric `total` alone).
 */
export function applyStreamEvent(state: AtlasLoadingState, event: string, data: unknown): AtlasLoadingState {
	if (isTerminal(state)) return state;
	if (event === 'error') {
		const message = (data as { message?: unknown } | null)?.message;
		return markError(state, typeof message === 'string' ? message : 'indexing failed');
	}
	if (event === 'complete') return markComplete({ ...state, status: 'running' });

	const stage = STREAM_STAGES[event];
	if (!stage) return state;

	const d = (data ?? {}) as { mirrored?: unknown; total?: unknown };
	const completed = isCount(d.mirrored) ? d.mirrored : null;
	const total = isCount(d.total) ? d.total : null;
	return { ...state, status: 'running', stage, completed, total };
}

/** Helper for the loader props: show a determinate bar only when both counts are real. */
export function determinateProgress(state: AtlasLoadingState): number | null {
	if (state.completed === null || state.total === null || state.total <= 0) return null;
	return Math.min(100, Math.max(0, (state.completed / state.total) * 100));
}
