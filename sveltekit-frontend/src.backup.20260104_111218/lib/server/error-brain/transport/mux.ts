/**
 * lib/server/error-brain/transport/mux.ts
 *
 * PHASE 36: Multiplexer transport (both SSE + Redis)
 */

import type { ErrorBrainEvent } from '../events.js';
import type { ErrorBrainTransport } from './interface.js';

export class MuxTransport implements ErrorBrainTransport {
 name = 'mux';

 constructor(private transports: ErrorBrainTransport[]) {}

 async publish(evt: ErrorBrainEvent): Promise<void> {
 // Publish to all transports in parallel
 await Promise.all(this.transports.map((t) => t.publish(evt)));
 }

 async subscribe(handler: (evt: ErrorBrainEvent) => void): Promise<() => void> {
 // Subscribe to all transports that support it
 const unsubscribers: (() => void | Promise<void>)[] = [];

 for (const transport of this.transports) {
 if (transport.subscribe) {
 const unsub = await transport.subscribe(handler);
 unsubscribers.push(unsub);
 }
 }

 // Return combined unsubscribe function
 return async () => {
 await Promise.all(unsubscribers.map((unsub) => unsub()));
 };
 }

 async close(): Promise<void> {
 await Promise.all(this.transports.filter((t) => t.close).map((t) => t.close!()));
 }
}
