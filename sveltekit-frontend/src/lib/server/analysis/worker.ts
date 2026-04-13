/**
 * DB-backed analysis worker loop.
 *
 * Polls `analysis_jobs` for queued jobs and processes them with
 * the concurrency gates from concurrency-gate.ts.
 *
 * On startup, resets stale 'running' jobs back to 'queued' (crash recovery).
 * Uses FOR UPDATE SKIP LOCKED so concurrent claims never collide.
 */

import {
	claimNextJob,
	updateAnalysisJob,
	completeAnalysisJob,
	failAnalysisJob,
	resetStaleJobs,
	type JobType,
} from './analysis-jobs.js';
import { embedGate, entityGate, forensicsGate, summarizeGate, gated, getGateStats } from './concurrency-gate.js';

// --- Stage executors (lazy-imported to avoid circular deps) ---

async function runEntityExtraction(evidenceId: string, meta: Record<string, unknown>) {
	const { extractEntities } = await import('./entity-extraction.js');
	const text = (meta.text as string) ?? '';
	if (!text) return { entityCount: 0, types: [] };
	const entities = await extractEntities(text.slice(0, 50_000));
	return {
		entityCount: entities.length,
		types: [...new Set(entities.map(e => e.label))],
		entities: entities.slice(0, 200),
	};
}

async function runForensics(_evidenceId: string, meta: Record<string, unknown>) {
	const { detectForensicPatterns } = await import('./forensics.js');
	const text = (meta.text as string) ?? '';
	if (!text) return { flagCount: 0, types: [] };
	const flags = detectForensicPatterns(text.slice(0, 50_000));
	return { flagCount: flags.length, types: flags.map(f => f.type) };
}

async function runSummarization(_evidenceId: string, meta: Record<string, unknown>) {
	const { summarizeDocument } = await import('./summarizer.js');
	const text = (meta.text as string) ?? '';
	if (!text) return { summaryLength: 0 };
	const summary = await summarizeDocument(text);
	return { summaryLength: summary.length, summary: summary.slice(0, 5000) };
}

// --- Gate + executor mapping ---

const stageConfig: Record<string, {
	gate: ReturnType<typeof import('p-limit').default>;
	run: (evidenceId: string, meta: Record<string, unknown>) => Promise<Record<string, unknown>>;
}> = {
	entity_extraction: { gate: entityGate, run: runEntityExtraction },
	forensics: { gate: forensicsGate, run: runForensics },
	summarization: { gate: summarizeGate, run: runSummarization },
};

// --- Worker loop ---

let workerInterval: ReturnType<typeof setInterval> | null = null;
let polling = false;
const POLL_MS = 3_000;

// Error tracking for exponential backoff
let consecutiveDbErrors = 0;
let lastDbErrorLog = 0;
const DB_ERROR_LOG_INTERVAL = 60_000; // Log once per minute max

async function pollOnce(): Promise<void> {
	if (polling) return;
	polling = true;

	try {
		for (const jobType of Object.keys(stageConfig) as JobType[]) {
			const cfg = stageConfig[jobType];
			if (!cfg) continue;

			// Skip if gate is at capacity
			if (cfg.gate.activeCount >= (cfg.gate as any).concurrency) continue;

			const job = await claimNextJob(jobType);
			if (!job) continue;

			// Reset backoff on successful claim
			consecutiveDbErrors = 0;

			// Run inside concurrency gate (non-blocking)
			gated(cfg.gate, async () => {
				const t0 = Date.now();
				try {
					await updateAnalysisJob(job.id, { progress: '10' });
					const result = await cfg.run(job.evidenceId, job.result);
					await completeAnalysisJob(job.id, { ...result, durationMs: Date.now() - t0 });
					console.log(`[Worker] ${jobType}/${job.id} done in ${Date.now() - t0}ms`);
				} catch (err) {
					console.error(`[Worker] ${jobType}/${job.id} failed:`, err);
					await failAnalysisJob(job.id, String(err)).catch(() => {});
				}
			}).catch(() => {});
		}
	} catch (err: any) {
		consecutiveDbErrors++;

		// Exponential backoff: 2s, 4s, 8s, 16s, 32s (max)
		const backoffMs = Math.min(2000 * Math.pow(2, consecutiveDbErrors - 1), 32000);

		// Only log once per minute to avoid spam
		const now = Date.now();
		if (now - lastDbErrorLog > DB_ERROR_LOG_INTERVAL) {
			if (err.code === 'ECONNREFUSED') {
				console.warn(`[Worker] DB unavailable (ECONNREFUSED), backing off ${backoffMs}ms`);
			} else if (err.message?.includes('57P03') || err.message?.includes('starting up')) {
				console.warn(`[Worker] DB still starting up, backing off ${backoffMs}ms`);
			} else {
				console.error(`[Worker] Poll error:`, err.message);
			}
			lastDbErrorLog = now;
		}

		// Apply backoff delay
		await new Promise(resolve => setTimeout(resolve, backoffMs));
	} finally {
		polling = false;
	}
}

/**
 * Start the analysis worker. Idempotent — safe to call multiple times.
 * Call from hooks.server.ts or a layout server load.
 */
export function startWorker(): void {
	if (workerInterval) return;

	// Crash recovery: re-queue jobs stuck in 'running' for >10 min
	resetStaleJobs(10).then((n) => {
		if (n > 0) console.log(`[Worker] Reset ${n} stale jobs to queued`);
	}).catch(() => {});

	workerInterval = setInterval(pollOnce, POLL_MS);
	console.log('[Worker] Analysis worker started (poll every 3s)');
	pollOnce();
}

/** Stop the worker (for graceful shutdown / tests). */
export function stopWorker(): void {
	if (workerInterval) {
		clearInterval(workerInterval);
		workerInterval = null;
		console.log('[Worker] Analysis worker stopped');
	}
}

/** Health check stats. */
export function getWorkerStats() {
	return { running: workerInterval !== null, gates: getGateStats() };
}
