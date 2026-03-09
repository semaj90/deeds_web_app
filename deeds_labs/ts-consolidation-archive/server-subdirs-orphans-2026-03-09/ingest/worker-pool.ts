import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { EventEmitter } from 'events';
import path from 'path';

export type JobType = 'ocr' | 'audio' | 'video' | 'document' | 'embedding' | 'json' | 'other';

export type Job = {
    id: string;
	type: JobType;
    payload?: unknown;
    options?: {
        priority?: number;
        timeoutMs?: number;
        __resolve?: (r: JobResult) => void;
        [key: string]: unknown;
    };
};

export type JobResult = {
    success: boolean;
    data?: unknown;
    error?: string;
    processingTimeMs?: number;
};

export interface EmbeddingJobPayload {
    texts?: string[];
    text?: string;
    model?: string;
}

export interface WorkerPoolOptions {
    minWorkers?: number;
    maxWorkers?: number;
    idleTimeout?: number;
    cleanupIntervalMs?: number;
}

class WorkerSlot {
    worker: Worker;
    busy = false;
    lastUsed: number;

    constructor(worker: Worker) {
        this.worker = worker;
        this.lastUsed = Date.now();
    }
}

export class ServerIngestWorkerPool extends EventEmitter {
    private slots: WorkerSlot[] = [];
    private queue: Job[] = [];
    private options: Required<WorkerPoolOptions>;
    private activeJobs: number = 0;
    private totalProcessed: number = 0;
    private isShuttingDown = false;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(options: WorkerPoolOptions = {}) {
        super();
        this.options = {
            minWorkers: options.minWorkers ?? 1,
            maxWorkers: options.maxWorkers ?? Math.max(2, Math.floor(cpus().length / 2)),
            idleTimeout: options.idleTimeout ?? 5 * 60 * 1000,
            cleanupIntervalMs: options.cleanupIntervalMs ?? 60 * 1000,
        };

        for (let i = 0; i < this.options.minWorkers; i++) {
            this.addWorker();
        }

        this.cleanupInterval = setInterval(() => this.cleanupIdleWorkers(), this.options.cleanupIntervalMs);
    }

    private addWorker() {
        if (this.slots.length >= this.options.maxWorkers) return;

        // This path logic might need adjustment depending on build structure
        const workerPath = path.join(process.cwd(), 'sveltekit-frontend', 'dist', 'server', 'workers', 'ingest-worker.js');

        try {
            const w = new Worker(workerPath, { eval: false });
            const slot = new WorkerSlot(w);

            w.on('message', msg => this.onWorkerMessage(slot, msg));
            w.on('error', err => this.onWorkerError(slot, err));
            w.on('exit', code => this.onWorkerExit(slot, code));

            this.slots.push(slot);
            this.emit('workerAdded', { total: this.slots.length });
        } catch (e) {
            console.error("Failed to add worker", e);
        }
    }

    private removeWorker(slot: WorkerSlot) {
        slot.worker.terminate();
        this.slots = this.slots.filter(s => s !== slot);
        this.emit('workerRemoved', { total: this.slots.length });
    }

    private onWorkerMessage(slot: WorkerSlot, msg: any) {
        slot.busy = false;
        slot.lastUsed = Date.now();
        this.activeJobs--;
        this.totalProcessed++;

        // We handle request-response correlation via closures in runJobOnSlot usually,
        // but if we are just emitting, we do so here.
        // Actually runJobOnSlot handles the promise resolution locally.

        this.maybeProcess();
    }

    private onWorkerError(slot: WorkerSlot, err: Error) {
        slot.busy = false;
        slot.lastUsed = Date.now();
        this.activeJobs--;
        this.emit('workerError', err?.message || String(err));
        this.maybeProcess();
    }

    private onWorkerExit(slot: WorkerSlot, code: number) {
        this.slots = this.slots.filter(s => s !== slot);
        this.emit('workerExit', { code, total: this.slots.length });
        if (this.slots.length < this.options.minWorkers && !this.isShuttingDown) {
            this.addWorker();
        }
    }

    async push(job: Job): Promise<JobResult> {
        if (this.isShuttingDown) return { success: false, error: 'Shutdown' };

        // Try to find a free slot
        let slot = this.slots.find(s => !s.busy);
        if (!slot && this.slots.length < this.options.maxWorkers) {
            this.addWorker();
            slot = this.slots[this.slots.length - 1];
        }

        if (!slot) {
            return new Promise<JobResult>(resolve => {
                this.queue.push({ ...job, options: { ...job.options, __resolve: resolve } });
            });
        }

        return this.runJobOnSlot(slot, job);
    }

    private runJobOnSlot(slot: WorkerSlot, job: Job): Promise<JobResult> {
        slot.busy = true;
        slot.lastUsed = Date.now();
        this.activeJobs++;

        return new Promise<JobResult>(resolve => {
            const start = Date.now();
            const timeout = job.options?.timeoutMs ?? 5 * 60 * 1000;

            const timer = setTimeout(() => {
                slot.worker.removeListener('message', listener);
                slot.busy = false;
                this.activeJobs--;
                resolve({ success: false, error: 'job timeout', processingTimeMs: Date.now() - start });
                this.maybeProcess();
            },
	timeout);

            const listener = (msg: any) => {
                // Check if msg matches job id? Assuming worker echoes ID or we rely on serial execution per slot logic which isn't guaranteed with raw listeners unless careful.
                // For this stub, assuming 1 job at a time per worker slot.
                clearTimeout(timer);
                slot.worker.removeListener('message', listener); // Important cleanup
                // onWorkerMessage update state already, but let's override logic slightly to resolve promise
                // Ideally onWorkerMessage delegates to here? Or we rely on the listener here.
                // We'll rely on the listener here and ensure onWorkerMessage doesn't double count if we move checking logic there.

                // For simplicity, let's assume onWorkerMessage is for general pool stats, and this listener is for the specific job.
                resolve({ success: true, data: msg, processingTimeMs: Date.now() - start });
            };

            slot.worker.postMessage(job);
            slot.worker.once('message', listener);
        });
    }

    private maybeProcess() {
        if (this.isShuttingDown) return;
        while (this.queue.length > 0) {
            const freeSlot = this.slots.find(s => !s.busy);
            if (!freeSlot) break;

            const job = this.queue.shift();
            if (!job) continue;

            const resolve = job.options?.__resolve;
            if (resolve) {
                this.runJobOnSlot(freeSlot, job).then(resolve);
            }
        }
    }

    private cleanupIdleWorkers() {
        if (this.isShuttingDown) return;
        const now = Date.now();
        const workersToRemove: WorkerSlot[] = [];

        for (const slot of this.slots) {
            if (!slot.busy && this.slots.length > this.options.minWorkers && (now - slot.lastUsed > this.options.idleTimeout)) {
                workersToRemove.push(slot);
            }
        }

        for (const slot of workersToRemove) {
            if (this.slots.length > this.options.minWorkers) {
                this.removeWorker(slot);
            }
        }
    }

    async shutdown(graceful = true, timeout = 30000) {
        this.isShuttingDown = true;
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);

        // Wait for active jobs... implementation omitted for brevity in stub

        for (const slot of this.slots) {
            slot.worker.terminate();
        }
        this.slots = [];
    }
}

let workerPoolInstance: ServerIngestWorkerPool | null = null;
export function getWorkerPool(options?: WorkerPoolOptions): ServerIngestWorkerPool {
    if (!workerPoolInstance) {
        workerPoolInstance = new ServerIngestWorkerPool(options);
    }
    return workerPoolInstance;
}
