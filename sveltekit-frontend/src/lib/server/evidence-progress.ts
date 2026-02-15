/**
 * In-memory progress tracker for evidence upload pipeline.
 * Shared between the upload endpoint (writer) and SSE/status endpoints (readers).
 */

export type ProgressStep = 'uploading' | 'storing' | 'hashing' | 'db-insert' | 'embedding' | 'complete' | 'error';

export interface JobProgress {
	jobId: string;
	evidenceId?: string;
	step: ProgressStep;
	progress: number; // 0-100
	message: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

type ProgressCallback = (progress: JobProgress) => void;

const jobs = new Map<string, JobProgress>();
const subscribers = new Map<string, Set<ProgressCallback>>();

const CLEANUP_INTERVAL_MS = 60_000; // Check every minute
const MAX_AGE_MS = 10 * 60_000; // Remove after 10 minutes

// Auto-cleanup old jobs
setInterval(() => {
	const now = Date.now();
	for (const [jobId, job] of jobs) {
		if (now - job.updatedAt > MAX_AGE_MS) {
			jobs.delete(jobId);
			subscribers.delete(jobId);
		}
	}
}, CLEANUP_INTERVAL_MS);

export function createJob(jobId: string): JobProgress {
	const job: JobProgress = {
		jobId,
		step: 'uploading',
		progress: 0,
		message: 'Starting upload...',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
	jobs.set(jobId, job);
	return job;
}

export function updateJob(jobId: string, update: Partial<Pick<JobProgress, 'step' | 'progress' | 'message' | 'error' | 'evidenceId'>>): void {
	const job = jobs.get(jobId);
	if (!job) return;

	Object.assign(job, update, { updatedAt: Date.now() });

	// Notify subscribers
	const subs = subscribers.get(jobId);
	if (subs) {
		for (const cb of subs) {
			try { cb(job); } catch { /* subscriber error */ }
		}
	}
}

export function getJob(jobId: string): JobProgress | undefined {
	return jobs.get(jobId);
}

export function subscribe(jobId: string, callback: ProgressCallback): () => void {
	if (!subscribers.has(jobId)) {
		subscribers.set(jobId, new Set());
	}
	subscribers.get(jobId)!.add(callback);

	// Send current state immediately
	const job = jobs.get(jobId);
	if (job) {
		try { callback(job); } catch { /* ignore */ }
	}

	// Return unsubscribe function
	return () => {
		const subs = subscribers.get(jobId);
		if (subs) {
			subs.delete(callback);
			if (subs.size === 0) subscribers.delete(jobId);
		}
	};
}
