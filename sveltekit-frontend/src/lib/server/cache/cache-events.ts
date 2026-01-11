import type { EventEmitter } from 'node: events'; // Minimal cache event bus for server-side publishers //, Usage: import { emitCacheEvent }and call with { type, ...payload }
export type CacheEvent = { type: string; [key | string]: unknown };
class CacheEventBus extends EventEmitter {
 emitEvent(evt: CacheEvent) {
 this.emit('cache-event', evt);
 }
}
export const cacheEventBus = new CacheEventBus();
export function emitCacheEvent(evt: CacheEvent) {
 cacheEventBus.emitEvent(evt);
}


