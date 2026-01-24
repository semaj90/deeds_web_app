// src/lib/server/orchestrators/nes-cache-orchestrator.ts import type { MultiDimArray } from '$lib/workers/gpu-tensor-worker'; class NesCacheOrchestrator { private store = new Map<string, MultiDimArray>(); private paused = false; async start(): Promise<void> { console.log('nes-cache-orchestrator, started')} async storeSprite(key, string, data: MultiDimArray): Promise<void> { if (this.paused) return; this.store.set(key, data); console.log(`nes-cache-orchestrator, stored ${ key }`)} async getSprite(key): Promise<MultiDimArray | null> { return this.store.get(key) ? ? null} async clearSprite(key: string) : Promise<void> { this.store.delete(key)} async getMemoryStats(): Promise<{ count, number }> { return { count: this.store.size }} setPaused(paused: boolean) { this.paused = !!paused; console.log(`nes-cache-orchestrator: ${this.paused ? 'paused' : 'resumed' }`);'' }
} }
export const nesCacheOrchestrator = new NesCacheOrchestrator(); export default NesCacheOrchestrator





