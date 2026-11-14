import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '../src/lib/server/db/client.js';
import { runIngestionPipeline } from '../src/lib/server/features/legal-corpus/legal/ingestion-worker.js';
import {
	claimLibraryIngestionJobByIdV1,
	claimNextLibraryIngestionJobV1,
	reconcileLibraryDocumentParseTaskV1,
} from '../src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.js';
import {
	startLibraryDocumentParseConsumerV1,
	type LibraryDocumentParsePayloadV1,
} from '../src/lib/server/queue/library-document-parse-consumer-v1.js';

const LEASE_SECONDS = 120;
const runOnce = process.env.ATLAS_LIBRARY_INGESTION_ONCE === '1';
const rabbitConsumerEnabled = process.env.ATLAS_LIBRARY_INGESTION_RABBITMQ === '1';
const targetedJobId = process.env.ATLAS_LIBRARY_INGESTION_JOB_ID;
let stopping = false;

process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

async function reconcileTask(jobId: string): Promise<void> {
	try {
		await reconcileLibraryDocumentParseTaskV1(jobId);
	} catch (error) {
		console.error(JSON.stringify({ event: 'workflow_task_reconcile_failed', jobId, error: String(error) }));
	}
}

async function processClaimedJob(job: NonNullable<Awaited<ReturnType<typeof claimNextLibraryIngestionJobV1>>>): Promise<void> {
	if (!job) return;
	console.log(JSON.stringify({
		event: 'claimed', jobId: job.jobId, documentId: job.documentId,
		attemptCount: job.attemptCount,
	}));
	try {
		const result = await runIngestionPipeline(job);
		console.log(JSON.stringify({ event: 'completed', jobId: job.jobId, ...result }));
	} catch (error) {
		console.error(JSON.stringify({ event: 'attempt_failed', jobId: job.jobId, error: String(error) }));
	} finally {
		await reconcileTask(job.jobId);
	}
}

async function processDocumentParseTask(payload: LibraryDocumentParsePayloadV1): Promise<void> {
	const job = await claimLibraryIngestionJobByIdV1(payload.jobId, LEASE_SECONDS, {
		documentId: payload.documentId,
		sourceSha256: payload.sourceSha256,
		documentRevision: payload.documentRevision,
	});
	if (!job) {
		// The polling recovery loop may already own this job, or it may have
		// completed before this at-least-once notification was delivered.
		await reconcileTask(payload.jobId);
		return;
	}
	await processClaimedJob(job);
}

async function main(): Promise<void> {
	console.log(`[library-ingestion-worker] started; concurrency=1 rabbitmq=${rabbitConsumerEnabled}`);
	let stopRabbitConsumer: (() => Promise<void>) | undefined;
	try {
		if (rabbitConsumerEnabled) {
			stopRabbitConsumer = await startLibraryDocumentParseConsumerV1(processDocumentParseTask);
		}
		while (!stopping) {
			const job = targetedJobId
				? await claimLibraryIngestionJobByIdV1(targetedJobId, LEASE_SECONDS)
				: await claimNextLibraryIngestionJobV1(LEASE_SECONDS);
			if (!job) {
				if (runOnce) break;
				await delay(2_000);
				continue;
			}

			await processClaimedJob(job);
			if (runOnce) break;
		}
	} finally {
		await stopRabbitConsumer?.().catch((error) => console.error('[library-ingestion-worker] RabbitMQ close failed:', error));
		await pool.end();
	}
	console.log('[library-ingestion-worker] stopped');
}

main().catch((error) => {
	console.error('[library-ingestion-worker] fatal:', error);
	process.exitCode = 1;
});
