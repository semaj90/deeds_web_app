/**
 * Error Brain Transport: Multiplexer
 * Publish to multiple transports
 */

import type { ErrorBrainEvent } from '../types.js';
import type { ErrorBrainTransport } from './interface.js';

export class MuxTransport implements ErrorBrainTransport {
 constructor(private transports: ErrorBrainTransport[]) {}

 async publish(evt: ErrorBrainEvent): Promise<void> {
 await Promise.allSettled(this.transports.map((t) => t.publish(evt)));
 }
}

