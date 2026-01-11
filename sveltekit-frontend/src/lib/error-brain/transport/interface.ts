/**
 * Error Brain Transport Interface
 * Clean event publishing abstraction
 */

import type { ErrorBrainEvent } from '../types.js';

export interface ErrorBrainTransport {
 publish(evt: ErrorBrainEvent): Promise<void>;
}


