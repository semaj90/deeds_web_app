export type AceIngestStep =
	| 'starting'
	| 'queued'
	| 'fetching'
	| 'extracting'
	| 'chunking'
	| 'embedding'
	| 'storing'
	| 'graph'
	| 'neo4j_sync'
	| 'deferred'
	| 'complete'
	| 'error';

export interface AceIngestJob {
	jobId: string;
	userId: string;
	sourceType: 'url' | 'file';
	caseId?: string | null;
	title?: string | null;
	filename?: string | null;
	step: AceIngestStep;
	progress: number;
	message: string;
	error?: string;
	result?: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
}

const jobs = new Map<string, AceIngestJob>();

const CLEANUP_INTERVAL_MS = 60_000;
const MAX_AGE_MS = 10 * 60_000;
const MAX_JOBS = 1_000;

setInterval(() => {
	const now = Date.now();
	for (const [jobId, job] of jobs) {
		if (now - job.updatedAt > MAX_AGE_MS) {
			jobs.delete(jobId);
		}
	}
}, CLEANUP_INTERVAL_MS).unref();

export function createAceIngestJob(input: {
	jobId: string;
	userId: string;
	sourceType: 'url' | 'file';
	caseId?: string | null;
	title?: string | null;
	filename?: string | null;
}): AceIngestJob {
	const job: AceIngestJob = {
		jobId: input.jobId,
		userId: input.userId,
		sourceType: input.sourceType,
		caseId: input.caseId ?? null,
		title: input.title ?? null,
		filename: input.filename ?? null,
		step: 'starting',
		progress: 0,
		message: 'Preparing ingest job...',
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	// Evict oldest if at capacity
	if (!jobs.has(input.jobId) && jobs.size >= MAX_JOBS) {
		const oldest = jobs.keys().next().value;
		if (oldest) jobs.delete(oldest);
	}
	jobs.set(input.jobId, job);
	return job;
}

export function updateAceIngestJob(
	jobId: string,
	update: Partial<Pick<AceIngestJob, 'step' | 'progress' | 'message' | 'error' | 'result' | 'title' | 'filename'>>
): void {
	const job = jobs.get(jobId);
	if (!job) return;

	Object.assign(job, update, { updatedAt: Date.now() });
	if (job.progress < 0) job.progress = 0;
	if (job.progress > 100) job.progress = 100;
	if (job.step !== 'error' && job.error) {
		delete job.error;
	}
}

export function getAceIngestJob(jobId: string): AceIngestJob | undefined {
	return jobs.get(jobId);
}
