import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '../src/lib/server/db/client.js';
import { runIngestionPipeline } from '../src/lib/server/features/legal-corpus/legal/ingestion-worker.js';
import { claimNextLibraryIngestionJobV1 } from '../src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.js';

const LEASE_SECONDS = 120;
let stopping = false;

process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

async function main(): Promise<void> {
	console.log('[library-ingestion-worker] started; concurrency=1');
	try {
		while (!stopping) {
			const job = await claimNextLibraryIngestionJobV1(LEASE_SECONDS);
			if (!job) {
				await delay(2_000);
				continue;
			}

			console.log(JSON.stringify({
				event: 'claimed', jobId: job.jobId, documentId: job.documentId,
				attemptCount: job.attemptCount,
			}));
			try {
				const result = await runIngestionPipeline(job);
				console.log(JSON.stringify({ event: 'completed', jobId: job.jobId, ...result }));
			} catch (error) {
				console.error(JSON.stringify({ event: 'attempt_failed', jobId: job.jobId, error: String(error) }));
			}
		}
	} finally {
		await pool.end();
	}
	console.log('[library-ingestion-worker] stopped');
}

main().catch((error) => {
	console.error('[library-ingestion-worker] fatal:', error);
	process.exitCode = 1;
});
