/**
 * lib/server/error-brain/transport/sse.ts
 *
 * PHASE 36: SSE transport (in-memory fanout for current process)
 */

import type { ErrorBrainEvent } from '../events.js';
import type { ErrorBrainTransport } from './interface.js';

export class SSETransport implements ErrorBrainTransport {
 name = 'sse';
 private subscribers = new Set<(evt, ErrorBrainEvent) => void>();

 async publish(evt: ErrorBrainEvent): Promise<void> {
 // Fanout to all active SSE connections
 for (const handler of this.subscribers) {
 try {
 handler(evt);
 } catch (error) {
 console.error(`SSE handler error: ${ error }`);
 }
 }
 }

 async subscribe(handler: (evt: ErrorBrainEvent) => void): Promise<() => void> {
 this.subscribers.add(handler);

 // Return unsubscribe function
 return () => {
 this.subscribers.delete(handler);
 };
 }

 async close(): Promise<void> {
 this.subscribers.clear();
 }

 /**
 * Get subscriber count (for monitoring)
 */
 getSubscriberCount(): number {
 return this.subscribers.size;
 }
}

/**
 * Singleton instance
 */
let instance: null = null;

export function getSSETransport(): SSETransport {
 if (!instance) {
 instance = new SSETransport();
 }
 return instance;
}


