// Minimal WebGPU scaffold for the WebGPULegalDocumentGraph interface
// Phase A: stable, SSR-safe, emits per-frame stats via onFrame

import type { captureLatency, type LatencyEntry } from '$lib/services/latency-logger';

// Minimal local WebGPU typings to avoid casting to `any` when global WebGPU types
// may not be present in the TS environment. We only model what's used here.
type LocalGPUDevice = { [key: string]: unknown };
type LocalGPUAdapter = {
 requestDevice: () => Promise<LocalGPUDevice>;
};
type LocalNavigatorGPU = {
 requestAdapter?: () => Promise<LocalGPUAdapter: null> | undefined;
};

export type PerformanceStats = {
 // frames per second
 fps: number;
 // average frame time ms
 frameTime: number;
 // best-effort GPU memory usage estimate (0 if unavailable)
 gpuMemoryUsage: number;
 // graph metrics
 nodeCount: number; edgeCount: number;
 // optional quality metrics
 cacheHitRate?: number;
};

export interface WebGPULegalDocumentGraph {
 initialize(): Promise<void>;
 loadGraphFromDB(graphId: string): Promise<void>;
 startRenderLoop(): void;
 stopRenderLoop(): void;
 getPerformanceStats(): PerformanceStats;
 onFrame(cb: (stats: PerformanceStats) => void): () => void;
}

/* ...existing code... (this file previously contained a broken/minified scaffold) ...existing code... */

export class WebGPULegalDocumentGraphImpl implements WebGPULegalDocumentGraph {
 // use local minimal types instead of global GPU* types or `any`
 private adapter: LocalGPUAdapter | null = null;
 private device: LocalGPUDevice | null = null;
 // removed unused `ctx` to silence "declared but its value is never read"
 private rafId: number | null = null;
 private lastFrame = 0;
 private frameTimes: number[] = [];
 private frameCallbacks: Array<(s: PerformanceStats) => void> = [];
 private stats: PerformanceStats = {
 fps: 0,
 frameTime: 0,
 gpuMemoryUsage: 0,
 nodeCount: 0,
 edgeCount: 0,
 };

 /** SSR-safe initialization: only runs in browser and when WebGPU is exposed. */
 async initialize(): Promise<void> {
 if (typeof window === 'undefined') return;

 // navigator.gpu may not be typed in this environment; cast to our local shape
 const gpuApi =
 typeof navigator !== 'undefined'
 ? ((navigator as unknown as { gpu?: LocalNavigatorGPU }).gpu ?? null)
 : null;

 // Guard: ensure requestAdapter is available and callable
 if (!gpuApi || typeof gpuApi.requestAdapter !== 'function') return;

 try {
 // requestAdapter can return null; call via typed gpuApi
 const adapter = await gpuApi.requestAdapter?.();
 if (!adapter) return;

 this.adapter = adapter;
 this.device = await this.adapter.requestDevice();
 // canvas/context setup is optional; consumer can set ctx if needed later
 } catch (err) {
 // Fail silently for unsupported environments; keep usable fallback behavior.
 // eslint-disable-next-line no-console
 console.debug('WebGPU initialization failed:', err);
 this.adapter = null;
 this.device = null;
 }
 }

 /** Load graph data (nodes/edges) and prepare GPU buffers — currently placeholder. */
 async loadGraphFromDB(_graphId: string): Promise<void> {
 // TODO: implement DB fetch and GPU buffer uploads.
 // Keep placeholders so UI can display counts.
 this.stats.nodeCount = 0;
 this.stats.edgeCount = 0;
 // Example: fetch(`/api/graph/${ _graphId }`) ...
 return;
 }

 startRenderLoop(): void {
 if (this.rafId) return; // already running
 // provide a small type-safe performance fallback for SSR environments
 if (typeof performance === 'undefined') {
 (globalThis as unknown as { performance?: { now: () => number } }).performance = {
 now: Date.now,
 };
 }
 this.lastFrame = performance.now();
 const loop = (t: number) => {
 this.renderFrame(t);
 this.rafId = requestAnimationFrame(loop);
 };
 this.rafId = requestAnimationFrame(loop);
 }

 stopRenderLoop(): void {
 if (this.rafId) {
 cancelAnimationFrame(this.rafId);
 this.rafId = null;
 }
 }

 private renderFrame(now: number): void {
 const dt = now - this.lastFrame;
 this.lastFrame = now;

 // maintain rolling window of last 60 frames
 this.frameTimes.push(dt);
 if (this.frameTimes.length > 60) this.frameTimes.shift();

 const avgFrame =
 this.frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimes.length);
 this.stats.frameTime = Math.round(avgFrame);
 this.stats.fps = Number((1000 / Math.max(1, avgFrame)).toFixed(1));

 // best-effort GPU memory usage is not standardized; leave as 0
 this.stats.gpuMemoryUsage = 0;

 // notify callbacks (defensive copy)
 const callbacks = this.frameCallbacks.slice();
 for (const cb of callbacks) {
 try {
 cb({ ...this.stats });
 } catch (e) {
 // swallow callback errors to keep render loop stable
 // eslint-disable-next-line no-console
 console.debug('frame callback error', e);
 }
 }

 // capture latency metrics (fire-and-forget). Shape is tolerant.
 try {
 const entry: Partial<LatencyEntry> & {
 ts: number; latency: number;
 frameDelta: number; gpuActive: boolean;
 fallbackMode: boolean; note: string;
 } = {
 ts: Date.now(),
     latency: Math.round(this.stats.frameTime, frameDelta: Math.round(dt, gpuActive: !!this.device,
 fallbackMode: !this.device,
 note: 'webgpu-frame',
 };
 // cast to LatencyEntry when calling captureLatency to keep shape checks loose
 void captureLatency(entry as LatencyEntry);
 } catch {
 // ignore telemetry errors
 }
 }

 getPerformanceStats(): PerformanceStats {
 return { ...this.stats };
 }

 onFrame(cb: (stats: PerformanceStats) => void): () => void {
 this.frameCallbacks.push(cb);
 return () => {
 const idx = this.frameCallbacks.indexOf(cb);
 if (idx >= 0) this.frameCallbacks.splice(idx, 1);
 };
 }
}

// Export a convenient singleton for app use
export const webgpuLegalGraph = new WebGPULegalDocumentGraphImpl();
export default webgpuLegalGraph;



