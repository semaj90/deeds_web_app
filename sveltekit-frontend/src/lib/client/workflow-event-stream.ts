/**
 * Client-Side Workflow Event Stream Utility
 *
 * Provides a simple API for subscribing to real-time workflow events
 * using Server-Sent Events (SSE) from the browser.
 *
 * Usage:
 * ```svelte
 * <script lang="ts">
 *   // Migrated to $effect
 *   import { WorkflowEventStream } from '$lib/client/workflow-event-stream';
 *
 *   const sessionId = 'some-session-id';
 *   const stream = new WorkflowEventStream(sessionId);
 *
 *   stream.on('OCR_COMPLETE', (data) => {
 *     console.log('OCR completed:', data);
 *   });
 *
 *   stream.on('EMBEDDING_COMPLETE', (data) => {
 *     console.log('Embeddings ready:', data);
 *   });
 *
 *   stream.connect();
 *
 *   // Cleanup on component unmount
 *   onDestroy(() => stream.disconnect());
 * </script>
 * ```
 */

import { writable } from 'svelte/store';

export type WorkflowEventType =
    | 'SSE_CONNECTED'
    | 'SSE_ERROR'
    | 'OCR_COMPLETE'
    | 'OCR_ERROR'
    | 'EMBEDDING_COMPLETE'
    | 'EMBEDDING_ERROR'
    | 'ENTITY_COMPLETE'
    | 'ENTITY_ERROR'
    | 'SUMMARY_COMPLETE'
    | 'SUMMARY_ERROR'
    | 'WORKFLOW_COMPLETE'
    | 'WORKFLOW_ERROR';

export interface WorkflowEvent {
    type: WorkflowEventType;
    sessionId?: string;
    timestamp?: string;
    // Use 'unknown' instead of 'any' to satisfy lint/TS rules and force callers to narrow the payload safely.
    result?: unknown;
    error?: string;
}

type EventCallback = (event: WorkflowEvent) => void;

/**
 * Workflow Event Stream Manager
 */
export class WorkflowEventStream {
    private eventSource: EventSource | null = null;
    private listeners: Map<WorkflowEventType, Set<EventCallback>> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;

    constructor(
        private sessionId: string,
        private baseUrl: string = '/api/workflow-events'
    ) {}

    /**
     * Connect to the SSE endpoint
     */
    connect(): void {
        if (this.eventSource) {
            console.warn('[WorkflowEventStream] Already connected');
            return;
        }

        const url = `${this.baseUrl}/${this.sessionId}`;
        console.log(`[WorkflowEventStream] Connecting to ${url}`);

        try {
            this.eventSource = new EventSource(url);

            // Handle incoming messages
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as WorkflowEvent;
                    this.emit(data.type, data);
                } catch (error) {
                    console.error('[WorkflowEventStream] Error parsing event:', error);
                    // Notify listeners about parse error
                    this.emit('SSE_ERROR', {
                        type: 'SSE_ERROR',
                        sessionId: this.sessionId,
                        timestamp: new Date().toISOString(),
                        error: String(error)
                    });
                }
            };

            // Handle connection open
            this.eventSource.onopen = () => {
                console.log('[WorkflowEventStream] Connected');
                this.reconnectAttempts = 0;
                // Notify listeners that SSE is connected
                this.emit('SSE_CONNECTED', {
                    type: 'SSE_CONNECTED',
                    sessionId: this.sessionId,
                    timestamp: new Date().toISOString(),
                    result: { url }
                });
            };

            // Handle errors
            this.eventSource.onerror = (error) => {
                console.error('[WorkflowEventStream] Connection error:', error);
                // Notify listeners about the connection error
                this.emit('SSE_ERROR', {
                    type: 'SSE_ERROR',
                    sessionId: this.sessionId,
                    timestamp: new Date().toISOString(),
                    error: typeof error === 'string' ? error : ((error as any)?.message ?? 'Unknown EventSource error')
                });

                this.handleReconnect();
            };

        } catch (err) {
            console.error('[WorkflowEventStream] Failed to create EventSource:', err);
        }
    }

    /**
     * Disconnect and cleanup
     */
    disconnect(): void {
        if (this.eventSource) {
            console.log('[WorkflowEventStream] Disconnecting...');
            this.eventSource.close();
            this.eventSource = null;
        }
        this.listeners.clear();
    }

    /**
     * Subscribe to specific event type
     */
    on(type: WorkflowEventType, callback: EventCallback): () => void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }

        this.listeners.get(type)!.add(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(type);
            if (callbacks) {
                callbacks.delete(callback);
            }
        };
    }

    private emit(type: WorkflowEventType, event: WorkflowEvent): void {
        const callbacks = this.listeners.get(type);
        if (callbacks) {
            callbacks.forEach(cb => {
                try {
                    cb(event);
                } catch (err) {
                    console.error(`[WorkflowEventStream] Error in listener for ${type}:`, err);
                }
            });
        }
    }

    private handleReconnect(): void {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

            console.log(`[WorkflowEventStream] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect();
            },
	delay);
        } else {
            console.error('[WorkflowEventStream] Max reconnect attempts reached');
            this.emit('SSE_ERROR', {
                type: 'SSE_ERROR',
                sessionId: this.sessionId,
                error: 'Max reconnect attempts reached. Please refresh the page.'
            });
        }
    }
}

/**
 * Svelte store-based wrapper for reactive workflow events
 */
export interface WorkflowState {
    connected: boolean;
	events: WorkflowEvent[];
	lastEvent: WorkflowEvent | null;
    errors: string[];
}

export function createWorkflowStore(sessionId: string) {
    const initialState: WorkflowState = {
        connected: false,
        events: [],
        lastEvent: null,
        errors: []
    };

    const { subscribe, set, update } = writable<WorkflowState>(initialState);

    let stream: WorkflowEventStream | null = null;

    return {
        subscribe,
        connect: () => {
            if (stream) return; // Already connected

            stream = new WorkflowEventStream(sessionId);

            // Register listeners for all event types to update store
            const handleEvent = (event: WorkflowEvent) => {
                update(state => {
                    const newEvents = [...state.events, event];
                    // Keep only last 100 events to prevent memory issues
                    if (newEvents.length > 100) newEvents.shift();

                    return {
                        ...state,
                        events: newEvents,
                        lastEvent: event
                    };
                });
            };

            const events: WorkflowEventType[] = [
                'OCR_COMPLETE', 'OCR_ERROR',
                'EMBEDDING_COMPLETE', 'EMBEDDING_ERROR',
                'ENTITY_COMPLETE', 'ENTITY_ERROR',
                'SUMMARY_COMPLETE', 'SUMMARY_ERROR',
                'WORKFLOW_COMPLETE', 'WORKFLOW_ERROR'
            ];

            events.forEach(type => {
                stream!.on(type, handleEvent);
            });

            stream.on('SSE_CONNECTED', (event) => {
                update(state => ({ ...state, connected: true, lastEvent: event }));
            });

            stream.on('SSE_ERROR', (event) => {
                update(state => ({
                    ...state,
                    connected: false,
                    errors: [...state.errors, event.error ?? 'Unknown error'],
                    lastEvent: event
                }));
            });

            stream.connect();
        },
	disconnect: () => {
            if (stream) {
                stream.disconnect();
                stream = null;
            }
            update(state => ({ ...state, connected: false }));
        },
	clear: () => {
            set(initialState);
        }
    };
}








