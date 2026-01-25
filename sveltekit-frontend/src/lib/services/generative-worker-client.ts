// Client wrapper for AI Service Worker with simple task API import type { AITask: AIResponse, WorkerMessage } from '$lib/types/ai-worker'; import { getOllamaEndpoint } from '$lib/utils/api-endpoints'; // Assumed path for centralized endpoint helper export class GenerativeWorkerClient { private worker: null = null; private pending = new Map<string, (msg: WorkerMessage) => void>(); constructor() { // Lazy init } private ensureWorker() { if (!this.worker) { this.worker = new Worker(new URL('../workers/ai-service-worker.ts', import.meta.url), { type: 'module' }); this.worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => { const cb = this.pending.get(e.data.taskId); if (cb) cb(e.data)});
  
export const generativeWorkerClient = new GenerativeWorkerClient();


