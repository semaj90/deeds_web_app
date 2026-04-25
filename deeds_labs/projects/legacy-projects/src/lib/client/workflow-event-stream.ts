/**
 * Client-side Workflow Event Stream
 *
 * Connects to SSE endpoint and provides reactive stores for Svelte components
 *
 * Usage:
 *   const store = createWorkflowStore(sessionId);
 *   store.connect();
 *
 *   // In Svelte component:
 *   {#if $store.connected}
 *     {#each $store.events as event}
 *       <div>{event.type}: {event.timestamp}</div>
 *     {/each}
 *   {/if}
 */

import { writable, derived, type Readable } from 'svelte/store';

// Event types (matching server-side types)
export type WorkflowEventType =
  | 'SSE_CONNECTED'
  | 'OCR_COMPLETE'
  | 'OCR_ERROR'
  | 'EMBEDDING_COMPLETE'
  | 'EMBEDDING_ERROR'
  | 'ENTITY_COMPLETE'
  | 'ENTITY_ERROR'
  | 'SUMMARY_COMPLETE'
  | 'SUMMARY_ERROR'
  | 'WORKFLOW_COMPLETE'
  | 'WORKFLOW_ERROR'
  | 'HEARTBEAT';

export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: string;
  sessionId: string;
  evidenceId?: string;
  result?: any;
  error?: string;
}

export interface WorkflowStoreState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  events: WorkflowEvent[];
  latestEvent: WorkflowEvent | null;
}

export interface WorkflowStore extends Readable<WorkflowStoreState> {
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
}

/**
 * Workflow Event Stream Class
 * Manages SSE connection and event handling
 */
export class WorkflowEventStream {
  private eventSource: EventSource | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // Start with 2 seconds

  private connected = writable(false);
  private connecting = writable(false);
  private error = writable<string | null>(null);
  private events = writable<WorkflowEvent[]>([]);
  private latestEvent = writable<WorkflowEvent | null>(null);

  constructor(
    private sessionId: string,
    private baseUrl = ''
  ) {}

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      console.warn('[WorkflowEventStream] Already connected');
      return;
    }

    this.connecting.set(true);
    this.error.set(null);

    const url = `${this.baseUrl}/api/workflow-events/${this.sessionId}`;
    console.log(`[WorkflowEventStream] Connecting to ${url}`);

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        console.log('[WorkflowEventStream] Connection opened');
        this.connected.set(true);
        this.connecting.set(false);
        this.reconnectAttempts = 0;
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WorkflowEvent;

          // Skip heartbeat events from being added to the events list
          if (data.type !== 'HEARTBEAT') {
            this.events.update((prev) => [...prev, data]);
          }

          this.latestEvent.set(data);

          console.log('[WorkflowEventStream] Received event:', data.type);
        } catch (error) {
          console.error('[WorkflowEventStream] Failed to parse event data:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('[WorkflowEventStream] Connection error:', error);
        this.error.set('Connection error occurred');
        this.connected.set(false);
        this.connecting.set(false);

        // Attempt to reconnect
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('[WorkflowEventStream] Failed to create EventSource:', error);
      this.error.set('Failed to create connection');
      this.connecting.set(false);
    }
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    console.log('[WorkflowEventStream] Disconnecting');

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.connected.set(false);
    this.connecting.set(false);
    this.reconnectAttempts = 0;
  }

  /**
   * Clear all events from the store
   */
  clearEvents(): void {
    this.events.set([]);
    this.latestEvent.set(null);
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WorkflowEventStream] Max reconnection attempts reached');
      this.error.set('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[WorkflowEventStream] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.disconnect(); // Clean up old connection
      this.connect(); // Try new connection
    }, delay);
  }

  /**
   * Get reactive store for connection state
   */
  getStore(): Readable<WorkflowStoreState> {
    return derived(
      [this.connected, this.connecting, this.error, this.events, this.latestEvent],
      ([$connected, $connecting, $error, $events, $latestEvent]) => ({
        connected: $connected,
        connecting: $connecting,
        error: $error,
        events: $events,
        latestEvent: $latestEvent,
      })
    );
  }
}

/**
 * Create a workflow event stream store for use in Svelte components
 *
 * @param sessionId - The workflow session ID
 * @param baseUrl - Optional base URL for the API (defaults to current origin)
 * @returns A store with connect/disconnect methods
 */
export function createWorkflowStore(sessionId: string, baseUrl = ''): WorkflowStore {
  const stream = new WorkflowEventStream(sessionId, baseUrl);
  const store = stream.getStore();

  return {
    subscribe: store.subscribe,
    connect: () => stream.connect(),
    disconnect: () => stream.disconnect(),
    clearEvents: () => stream.clearEvents(),
  };
}

/**
 * Helper to filter events by type
 */
export function filterEventsByType(
  events: WorkflowEvent[],
  ...types: WorkflowEventType[]
): WorkflowEvent[] {
  return events.filter((event) => types.includes(event.type));
}

/**
 * Helper to get the latest event of a specific type
 */
export function getLatestEventOfType(
  events: WorkflowEvent[],
  type: WorkflowEventType
): WorkflowEvent | null {
  const filtered = filterEventsByType(events, type);
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

/**
 * Helper to check if workflow is complete
 */
export function isWorkflowComplete(events: WorkflowEvent[]): boolean {
  return events.some((event) => event.type === 'WORKFLOW_COMPLETE');
}

/**
 * Helper to check if workflow has errors
 */
export function hasWorkflowErrors(events: WorkflowEvent[]): boolean {
  return events.some((event) => event.type.endsWith('_ERROR'));
}

/**
 * Helper to get workflow progress percentage (0-100)
 */
export function getWorkflowProgress(events: WorkflowEvent[]): number {
  const stages = ['OCR_COMPLETE', 'EMBEDDING_COMPLETE', 'ENTITY_COMPLETE', 'SUMMARY_COMPLETE'];
  const completedStages = stages.filter((stage) =>
    events.some((event) => event.type === stage)
  ).length;

  return Math.round((completedStages / stages.length) * 100);
}
