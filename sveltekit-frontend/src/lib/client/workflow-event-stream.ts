/**
 * Client-Side Workflow Event Stream
 * SSE-based real-time workflow events with reconnection
 * Rewritten Session 63: No svelte/store dependency
 */

export type WorkflowEventType =
	// Infrastructure
	| 'SSE_CONNECTED'
	| 'SSE_ERROR'
	| 'WORKFLOW_COMPLETE'
	| 'WORKFLOW_ERROR'
	// Evidence pipeline
	| 'OCR_COMPLETE'
	| 'OCR_ERROR'
	| 'EMBEDDING_COMPLETE'
	| 'EMBEDDING_ERROR'
	| 'ENTITY_COMPLETE'
	| 'ENTITY_ERROR'
	| 'SUMMARY_COMPLETE'
	| 'SUMMARY_ERROR'
	// Claude Assist pipeline
	| 'SCHEMA_LOOKUP_COMPLETE'
	| 'RERANK_COMPLETE'
	| 'KAG_COMPLETE'
	| 'SCAFFOLD_WARMED'
	| 'ASSIST_COMPLETE'
	| 'ASSIST_ERROR'
	// Generic pipeline stage
	| 'PIPELINE_STAGE_START'
	| 'PIPELINE_STAGE_DONE'
	| 'PIPELINE_STAGE_ERROR';

export interface WorkflowEvent {
	type: WorkflowEventType;
	sessionId?: string;
	timestamp?: string;
	/** Human-readable stage label for UI progress. */
	label?: string;
	/** Stage duration in ms. */
	durationMs?: number;
	/** Compact result summary (counts, keys, etc.). */
	data?: Record<string, unknown>;
	result?: unknown;
	error?: string;
}

type EventCallback = (event: WorkflowEvent) => void;

export class WorkflowEventStream {
	private eventSource: EventSource | null = null;
	private listeners = new Map<WorkflowEventType, Set<EventCallback>>();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;

	constructor(
		private sessionId: string,
		private baseUrl: string = '/api/workflow-events'
	) {}

	connect(): void {
		if (this.eventSource) return;

		const url = `${this.baseUrl}/${this.sessionId}`;

		try {
			this.eventSource = new EventSource(url);

			this.eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as WorkflowEvent;
					this.emit(data.type, data);
				} catch {
					this.emit('SSE_ERROR', {
						type: 'SSE_ERROR',
						sessionId: this.sessionId,
						timestamp: new Date().toISOString(),
						error: 'Failed to parse event'
					});
				}
			};

			this.eventSource.onopen = () => {
				this.reconnectAttempts = 0;
				this.emit('SSE_CONNECTED', {
					type: 'SSE_CONNECTED',
					sessionId: this.sessionId,
					timestamp: new Date().toISOString(),
					result: { url }
				});
			};

			this.eventSource.onerror = () => {
				this.emit('SSE_ERROR', {
					type: 'SSE_ERROR',
					sessionId: this.sessionId,
					timestamp: new Date().toISOString(),
					error: 'EventSource connection error'
				});
				this.handleReconnect();
			};
		} catch (err) {
			console.error('[WorkflowEventStream] Failed to create EventSource:', err);
		}
	}

	disconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.listeners.clear();
	}

	on(type: WorkflowEventType, callback: EventCallback): () => void {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, new Set());
		}
		this.listeners.get(type)!.add(callback);
		return () => this.listeners.get(type)?.delete(callback);
	}

	private emit(type: WorkflowEventType, event: WorkflowEvent): void {
		this.listeners.get(type)?.forEach((cb) => {
			try {
				cb(event);
			} catch (err) {
				console.error(`[WorkflowEventStream] Listener error for ${type}:`, err);
			}
		});
	}

	private handleReconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
			setTimeout(() => this.connect(), delay);
		} else {
			this.emit('SSE_ERROR', {
				type: 'SSE_ERROR',
				sessionId: this.sessionId,
				error: 'Max reconnect attempts reached. Please refresh the page.'
			});
		}
	}
}
