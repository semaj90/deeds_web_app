import { browser } from '$app/environment';
import { WorkflowEventStream, type WorkflowEvent } from '$lib/client/workflow-event-stream.js';
import type { AgentVisualState } from '$lib/types/agent.js';
import {
	mergeWorkflowAgentVisualState,
	isWorkflowVisualEventType,
} from '$lib/utils/workflow-agent-visual.js';

type LiveWorkflowStatus = 'idle' | 'connecting' | 'running' | 'done' | 'error';

const EVENT_TYPES = [
	'SSE_CONNECTED',
	'SSE_ERROR',
	'WORKFLOW_COMPLETE',
	'WORKFLOW_ERROR',
	'OCR_COMPLETE',
	'OCR_ERROR',
	'EMBEDDING_COMPLETE',
	'EMBEDDING_ERROR',
	'ENTITY_COMPLETE',
	'ENTITY_ERROR',
	'SUMMARY_COMPLETE',
	'SUMMARY_ERROR',
	'SCHEMA_LOOKUP_COMPLETE',
	'RERANK_COMPLETE',
	'KAG_COMPLETE',
	'SCAFFOLD_WARMED',
	'ASSIST_COMPLETE',
	'ASSIST_ERROR',
	'PIPELINE_STAGE_START',
	'PIPELINE_STAGE_DONE',
	'PIPELINE_STAGE_ERROR',
] as const;

function eventLabel(event: WorkflowEvent): string {
	return event.label ?? event.type;
}

class LiveAgentVisualsStore {
	states = $state<AgentVisualState[]>([]);
	status = $state<LiveWorkflowStatus>('idle');
	sessionId = $state<string | null>(null);
	lastLabel = $state<string>('');
	lastError = $state<string | null>(null);

	private stream: WorkflowEventStream | null = null;
	private unsubs: Array<() => void> = [];

	async start(query: string): Promise<{ sessionId: string }> {
		this.disconnect();
		if (!browser) {
			this.status = 'error';
			this.lastError = 'Live workflow streams are browser-only';
			return { sessionId: '' };
		}

		const sessionId = crypto.randomUUID();
		this.sessionId = sessionId;
		this.status = 'connecting';
		this.states = [];
		this.lastLabel = 'Preparing workflow';
		this.lastError = null;

		const stream = new WorkflowEventStream(sessionId, '/api/workflow-events');
		this.stream = stream;

		for (const type of EVENT_TYPES) {
			const unsub = stream.on(type, (event) => {
				if (!isWorkflowVisualEventType(event.type)) return;
				this.lastLabel = eventLabel(event);
				this.states = mergeWorkflowAgentVisualState(this.states, event, sessionId);

				if (event.type === 'WORKFLOW_COMPLETE' || event.type === 'ASSIST_COMPLETE') {
					this.status = 'done';
				} else if (event.type === 'WORKFLOW_ERROR' || event.type === 'ASSIST_ERROR') {
					this.status = 'error';
					this.lastError = event.error ?? eventLabel(event);
				} else if (event.type === 'SSE_CONNECTED') {
					this.status = 'running';
				}
			});
			this.unsubs.push(unsub);
		}

		stream.connect();

		try {
			const response = await fetch('/api/codebase-index/claude-assist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					sessionId,
					compactContext: true,
					preferCachedResearch: true,
					maxContextChunks: 6,
					limitPerWorker: 4,
					compact: true,
				}),
			});

			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				const message = body?.error ?? `HTTP ${response.status}`;
				this.status = 'error';
				this.lastError = message;
				this.disconnect();
				throw new Error(message);
			}

			this.status = 'running';
			return { sessionId };
		} catch (err) {
			this.status = 'error';
			this.lastError = err instanceof Error ? err.message : 'Failed to start live workflow';
			this.disconnect();
			throw err;
		}
	}

	disconnect(): void {
		for (const unsub of this.unsubs.splice(0)) unsub();
		this.stream?.disconnect();
		this.stream = null;
		if (this.status !== 'error') this.status = 'idle';
		this.sessionId = null;
	}
}

export const liveAgentVisuals = new LiveAgentVisualsStore();
