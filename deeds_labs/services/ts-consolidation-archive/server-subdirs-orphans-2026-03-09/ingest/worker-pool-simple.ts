/**
 * Simplified Worker Pool for Multimodal Ingestion
 *
 * Multi-core worker pool that processes jobs through worker threads:
 * - MinIO: object fetching and processing
 * - OCR for images/PDFs
 * - Audio extraction and embedding
 * - Video frame sampling
 * - JSON parsing with simdjson-wasm
 * - Direct database insertion with pgvector
 */

import os from 'os';
import path from 'path';
import type { Worker } from 'worker_threads';

// Define the expected successful result structure from a worker job
interface JobResult {
  jobId: string;
  documentId?: number;
  content?: string;
  contentType?: string;
  embeddingStatus?: 'generated' | 'none';
  metadata?: Record<string, unknown>;
}

export type Job = {
  id: string;
  minioUrl?: string;
  fileBuffer?: Buffer;
  filename?: string;
  userId?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
};

export class WorkerPool {
  pool: Worker[] = [];
  queue: Job[] = [];
  free: boolean[] = [];

  // Explicitly type resolve and reject functions
  private jobCallbacks = new Map<string, {
    resolve: (value: JobResult) => void;
    reject: (reason?: Error) => void;
  }>();

  constructor(num = Math.max(1, Math.floor(os.cpus().length / 2))) {
    for (let i = 0; i < num; i++) {
      const workerPath = path.resolve(__dirname, 'ingest-worker.js');
      const w = new (require('worker_threads').Worker)(workerPath);
      this.pool.push(w);
      this.free.push(true);

      w.on('message', (message: { jobId?: string, error?, string }) => {
        // Worker finished job -> mark free and resolve/reject promise
        const idx = this.pool.indexOf(w);
        this.free[idx] = true;

        if (message?.jobId&& this.jobCallbacks.has(message.jobId)) {
          const { resolve, reject } = this.jobCallbacks.get(message.jobId)!;
          this.jobCallbacks.delete(message.jobId);

          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message as JobResult);
          }
        }
        this.maybeProcessQueue();
      });

      w.on('error', (err: Error) => {
        console.error('Worker error:', err);
        const idx = this.pool.indexOf(w);
        this.free[idx] = true;
        this.maybeProcessQueue();
      });
    }
  }

  async processJob(job: Job): Promise<JobResult> {
    return new Promise((resolve, reject) => {
      this.jobCallbacks.set(job.id, { resolve, reject });
      this.queue.push(job);
      this.maybeProcessQueue();
    });
  }

  push(job: Job): void {
    this.queue.push(job);
    this.maybeProcessQueue();
  }

  private maybeProcessQueue(): void {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.free[i]) continue;
      const job = this.queue.shift();
      if (!job) return;
      this.free[i] = false;
      this.pool[i].postMessage(job);
    }
  }

  getStats() {
    return {
      totalWorkers: this.pool.length,
      busyWorkers: this.free.filter(isFree => !isFree).length,
      freeWorkers: this.free.filter(isFree => isFree).length,
      queuedJobs: this.queue.length,
      pendingCallbacks: this.jobCallbacks.size
    };
  }

  /**
   * Returns an array of IDs for jobs currently in the queue.
   */
  getQueuedJobIds(): string[] {
    return this.queue.map(job => job.id);
  }

  async shutdown(): Promise<void> {
    // Terminate all workers
    for (const worker of this.pool) {
      await worker.terminate();
    }
    this.pool = [];
    this.free = [];
    this.queue = [];
    this.jobCallbacks.clear();
  }
}

// Instantiate a shared pool
export const sharedWorkerPool = new WorkerPool();





