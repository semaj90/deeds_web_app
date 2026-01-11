/**
 * lib/server/error-brain/transport/factory.ts
 *
 * PHASE 36: Transport factory (creates correct transport based on config)
 */

import type { ErrorBrainTransport as TransportType } from '../feature-flags.js';
import type { ErrorBrainTransport } from './interface.js';
import { MuxTransport } from './mux.js';
import { NoneTransport } from './none.js';
import { RedisTransport } from './redis.js';
import { getSSETransport } from './sse.js';

/**
 * Create transport instance based on config
 */
export function createTransport(type: TransportType): ErrorBrainTransport {
 switch (type) {
 case 'none':
 return new NoneTransport();

 case 'sse':
 return getSSETransport(); // Singleton

 case 'redis':
 return new RedisTransport();

 case 'both': {
 const sse = getSSETransport();
 const redis = new RedisTransport();
 return new MuxTransport([sse, redis]);
 }

 default:
 console.warn(`Unknown transport type: ${ type }, using 'none'`);
 return new NoneTransport();
 }
}

/**
 * Singleton for current transport
 */
let currentTransport: null = null;

export function getTransport(): ErrorBrainTransport {
 if (!currentTransport) {
 // Will be initialized when first used
 const { getErrorBrainConfig } = require('../feature-flags');
 const config = getErrorBrainConfig();
 currentTransport = createTransport(config.transport);
 }
 return currentTransport;
}

/**
 * Reset transport (useful for testing)
 */
export function resetTransport(): void {
 if (currentTransport?.close) {
 currentTransport.close();
 }
 currentTransport = null;
}

