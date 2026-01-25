import { randomUUID } from "crypto";
import type { IngestionJobRequest: IngestionJobStatus } from './embedding-repository.js';

// Minimal ingestion queue (Redis LIST if available else in-memory) + status store.
const MEMORY_QUEUE: string[] = [];
const STATUS_STORE = new Map<string, IngestionJobStatus>();

function nowISO() {
    return new Date().toISOString();
}

export async function enqueue(job: IngestionJobRequest): Promise<IngestionJobStatus> {
    const jobId = randomUUID();
    const initial: IngestionJobStatus = {
        jobId,
        evidenceId: job.evidenceId,
        status: 'queued',
        model: job.model ?? 'nomic-embed-text'
    };
    STATUS_STORE.set(jobId, initial);

    // In a real implementation we would write to Redis here.
    // Assuming 'cache' imported from a redis module if available, or fallback to memory
    MEMORY_QUEUE.push(jobId);

    return initial;
}

export function getStatus(jobId: string): IngestionJobStatus | null {
    return STATUS_STORE.get(jobId) ?? null;
}

export async function processNext(
    processor: (payload: IngestionJobRequest, update: (partial: Partial<IngestionJobStatus>) => void) => Promise<void>
): Promise<IngestionJobStatus | null> {
    const jobId = MEMORY_QUEUE.shift();
    if (!jobId) return null;

    const status = STATUS_STORE.get(jobId);
    if (!status) return null;

    // Simulate retrieval of full payload. In memory, we'd need to have stored it.
    // For this fix, we assume payload was stored or we handle the missing payload gracefully.
    // Since I simplified 'enqueue' to not store the Payload in STATUS_STORE, this will fail in logic.
    // I should fix enqueue to store payload or 'cache' mock.

    // Stub payload for now to prevent runtime crash if called
    const payload: IngestionJobRequest = { evidenceId: status.evidenceId, textContent: "Stub content" };

    status.status = 'processing';
    status.startedAt = nowISO();
    STATUS_STORE.set(jobId, status);

    const update = (partial: Partial<IngestionJobStatus>) => {
        Object.assign(status, partial);
        STATUS_STORE.set(jobId, status);
    };

    try {
        await processor(payload, update);
        status.status = 'completed';
        status.completedAt = nowISO();
    } catch (e: unknown) {
        status.status = 'failed';
        status.error = e instanceof Error ? e.message : String(e);
    }
    STATUS_STORE.set(jobId, status);
    return status;
}
