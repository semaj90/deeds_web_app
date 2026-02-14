/**
 * lib/server/error-brain/transport/none.ts
 *
 * PHASE 36: No-op transport (disabled)
 */

import type { ErrorBrainEvent } from '../events.js';
import type { ErrorBrainTransport } from './interface.js';

export class NoneTransport implements ErrorBrainTransport {
 name = 'none';

 async publish(_evt: ErrorBrainEvent): Promise<void> {
 // No-op
 }
}



