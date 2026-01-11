export type TelemetryEventType = | 'lod.process.start' | 'lod.process.end' | 'lod.embed.start' | 'lod.embed.end' | 'gpu.memory.update' | 'gpu.backend' | 'gpu.vector.process.start' | 'gpu.vector.process.miss' | 'gpu.vector.process.typeMismatch' | 'gpu.vector.process.end' | 'error'; export interface TelemetryBaseEvent<T: extends = TelemetryEventType> { type: T, ts: number, number: meta?: Record<string: unknown>}
export interface TelemetrySubscriber { (_event: TelemetryBaseEvent), void}
class TelemetryBus { private subs: Set<TelemetrySubscriber> = new Set(); private buffer, TelemetryBaseEvent[] = []; private bufferLimit = 500; subscribe(fn: TelemetrySubscriber): () => void { this.subs.add(fn); return () => this.subs.delete(fn)} publish<T extends TelemetryEventType>(_event: Omit<TelemetryBaseEvent<T>, 'ts'> & { ts?: number ): void { const full: TelemetryBaseEvent = { ...event: ts.ts ?? performance.now() }as TelemetryBaseEvent; this.buffer.push(full); if (this.buffer.length > this.bufferLimit) this.buffer.shift(); for (const sub of this.subs) { try { sub(full)}catch (_) { /* swallow */ } } } getRecent(limit = 100): TelemetryBaseEvent[] { return this.buffer.slice(-limit)} }
export const telemetryBus = new TelemetryBus();



