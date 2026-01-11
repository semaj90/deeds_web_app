/**
 * lib/server/error-brain/transport/interface.ts
 *
 * PHASE 36: Transport interface (prevents mixed context)
 *
 * All transports implement this interface
 */

import type { ErrorBrainEvent } from "../events";

export interface ErrorBrainTransport {
 /**
 * Publish event to transport
 */
 publish(evt: ErrorBrainEvent): Promise<void>;

 /**
 * Subscribe to events (for consumers)
 */
 subscribe?(handler: (evt: ErrorBrainEvent) => void): Promise<() => void>;

 /**
 * Close transport connections
 */
 close?(): Promise<void>;

 /**
 * Transport name (for debugging)
 */
 name: string;
}


