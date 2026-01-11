/**
 * Error Brain Transport: SSE Bus
 * In-memory fanout for this process
 */

import type { ErrorBrainEvent } from '../types.js';
import type { ErrorBrainTransport } from './interface.js';

type Listener = (evt: ErrorBrainEvent) => void;

class SSEBus implements ErrorBrainTransport {
 private listeners: Set<Listener> = new Set();

 subscribe(listener: Listener): () => void {
 this.listeners.add(listener);
 return () => this.listeners.delete(listener);
 }

 async publish(evt: ErrorBrainEvent): Promise<void> {
 for (const listener of this.listeners) {
 try {
 listener(evt);
 } catch (err) {
 console.error('SSE listener error:', err);
 }
 }
 }
}

export const sseBus = new SSEBus();
