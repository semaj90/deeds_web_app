import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	failEvidenceUploadJobV1,
	completeEvidenceUploadJobV1,
	markEvidenceUploadProcessingV1,
	requeueEvidenceUploadJobV1,
} from './analysis-jobs.js';

/** Scratch database only. Never point this at the live database. */
const DB_URL = process.env.FINALIZE_TEST_DATABASE_URL ?? '';

describe.runIf(Boolean(DB_URL))('failEvidenceUploadJobV1 (scratch database)', () => {
	let pool: pg.Pool;
	let client: pg.PoolClient | undefined;
	let db: ReturnType<typeof drizzle>;
	let evidenceId: string;
	let otherEvidenceId: string;
	let createdEvidenceIds: string[] = [];
	let createdJobIds: string[] = [];

	beforeAll(async () => {
		const target = new URL(DB_URL);
		if (
			target.hostname !== '127.0.0.1' ||
			target.port !== '5434' ||
			target.pathname !== '/scene_marker_full_002952'
		) {
			throw new Error('FAIL07_TEST_DATABASE_MISMATCH: expected 127.0.0.1:5434/scene_marker_full_002952');
		}
		pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
		const identity = await pool.query('SELECT current_database() AS database');
		if (identity.rows[0]?.database !== 'scene_marker_full_002952') {
			throw new Error('FAIL07_TEST_DATABASE_MISMATCH: connected database is not scene_marker_full_002952');
		}
	});

	beforeEach(async () => {
		// One connection for fixture setup, the finalizer and every assertion.
		client = await pool.connect();
		db = drizzle(client);
		createdEvidenceIds = [];
		createdJobIds = [];
		// Disposable, uniquely titled evidence rows. Existing scratch rows are never touched.
		evidenceId = await createEvidence();
		otherEvidenceId = await createEvidence();
	});

	afterEach(async () => {
		const cleanupClient = client;
		if (!cleanupClient) return;
		try {
			await cleanupClient.query('BEGIN');
			if (createdJobIds.length > 0) {
				await cleanupClient.query('DELETE FROM analysis_jobs WHERE id = ANY($1::uuid[])', [createdJobIds]);
			}
			if (createdEvidenceIds.length > 0) {
				await cleanupClient.query('DELETE FROM evidence WHERE id = ANY($1::uuid[])', [createdEvidenceIds]);
			}
			await cleanupClient.query('COMMIT');
		} catch (error) {
			await cleanupClient.query('ROLLBACK');
			throw error;
		} finally {
			cleanupClient.release();
			client = undefined;
		}
	});

	afterAll(async () => {
		await pool?.end();
	});

	async function createEvidence(status = 'pending'): Promise<string> {
		const id = randomUUID();
		await db.execute(sql`
			INSERT INTO evidence (id, title, evidence_type, canvas_position, status, ai_analysis)
			VALUES (${id}::uuid, ${`fail07 fixture ${id}`}, 'document', '{}'::jsonb, ${status}, '{}'::jsonb)
		`);
		createdEvidenceIds.push(id);
		return id;
	}

	async function job(forEvidenceId = evidenceId): Promise<string> {
		const id = randomUUID();
		await db.execute(sql`
			INSERT INTO analysis_jobs (id, evidence_id, job_type, status, progress)
			VALUES (${id}::uuid, ${forEvidenceId}::uuid, 'upload_pipeline', 'running', '10')
		`);
		createdJobIds.push(id);
		return id;
	}

	async function evidenceState(): Promise<Record<string, unknown>> {
		const r = await db.execute(sql`SELECT ai_analysis FROM evidence WHERE id = ${evidenceId}::uuid`);
		return ((r.rows[0] as { ai_analysis: Record<string, unknown> | null }).ai_analysis ?? {}) as Record<
			string,
			unknown
		>;
	}

	async function evidenceStatus(): Promise<string> {
		const r = await db.execute(sql`SELECT status FROM evidence WHERE id = ${evidenceId}::uuid`);
		return (r.rows[0] as { status: string }).status;
	}

	/** Full evidence + job state, used to compare before and after a rolled-back finalization. */
	async function snapshot(jobId: string): Promise<string> {
		const e = await db.execute(sql`SELECT status, ai_analysis FROM evidence WHERE id = ${evidenceId}::uuid`);
		const j = await db.execute(sql`SELECT status, error, completed_at IS NOT NULL AS completed FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		return JSON.stringify({ evidence: e.rows[0], job: j.rows[0] });
	}

	it('completion replay is idempotent and rejects a mismatched evidence link', async () => {
		const jobId = await job();
		const receipt = {
			status: 'processed', sourceRevision: `sha256:${'b'.repeat(64)}`,
			chunkCount: 1, persistedCount: 1,
		};
		await completeEvidenceUploadJobV1(jobId, evidenceId, receipt, db as never);
		await completeEvidenceUploadJobV1(jobId, evidenceId, receipt, db as never);
		let row = await db.execute(sql`SELECT status, result FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((row.rows[0] as { status: string }).status).toBe('completed');
		expect((await evidenceState()).sourceRevision).toBe(receipt.sourceRevision);

		const mismatchedJobId = await job(evidenceId);
		await expect(completeEvidenceUploadJobV1(mismatchedJobId, otherEvidenceId, receipt, db as never))
			.rejects.toThrow('ANALYSIS_UPLOAD_JOB_EVIDENCE_LINK_MISMATCH');
		row = await db.execute(sql`SELECT status FROM analysis_jobs WHERE id = ${mismatchedJobId}::uuid`);
		expect((row.rows[0] as { status: string }).status).toBe('running');
		const other = await db.execute(sql`SELECT status FROM evidence WHERE id = ${otherEvidenceId}::uuid`);
		expect((other.rows[0] as { status: string }).status).toBe('pending');
	});

	it('a missing source marks both the job and evidence source_missing', async () => {
		const jobId = await job();
		const missingSource = Object.assign(new Error('NoSuchKey: scratch source missing'), {
			name: 'NoSuchKey',
			code: 'NoSuchKey',
			$metadata: { httpStatusCode: 404 },
		});
		await failEvidenceUploadJobV1(jobId, evidenceId, missingSource, db as never);

		const j = await db.execute(sql`SELECT status, error FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((j.rows[0] as { status: string }).status).toBe('failed');
		expect(await evidenceStatus()).toBe('source_missing');
		const ev = await evidenceState();
		expect(ev.extractionStatus).toBe('source_missing');
		expect(ev.processingFailureCode).toBe('SOURCE_MISSING');
	});

	it('duplicate failure finalization is idempotent for job and evidence state', async () => {
		const jobId = await job();
		await failEvidenceUploadJobV1(jobId, evidenceId, 'first failure', db as never);
		await failEvidenceUploadJobV1(jobId, evidenceId, 'first failure', db as never);
		const j = await db.execute(sql`SELECT status FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((j.rows[0] as { status: string }).status).toBe('failed');
		const ev = await evidenceState();
		expect(ev.extractionStatus).toBe('failed');
	});

	it('rolls back evidence and job changes when finalization fails after the evidence update', async () => {
		const jobId = await job();
		// Baseline is read on the same connection the finalizer uses, after the disposable fixture is set up.
		const before = await snapshot(jobId);
		expect(await evidenceStatus()).toBe('pending');

		let executions = 0;
		let injectedAfterStatement: number | null = null;
		const failingExecutor = {
			transaction: (callback: (tx: { execute: (query: Parameters<typeof db.execute>[0]) => Promise<unknown> }) => Promise<unknown>) =>
				db.transaction(async (realTx) => callback({
					execute: async (query) => {
						executions += 1;
						const result = await realTx.execute(query);
						// Execution 2 is the evidence UPDATE inside persistEvidenceUploadStateV1.
						if (executions === 2) {
							injectedAfterStatement = executions;
							throw new Error('INJECTED_AFTER_EVIDENCE_UPDATE');
						}
						return result;
					},
				})),
		};

		await expect(failEvidenceUploadJobV1(jobId, evidenceId, 'injected rollback', failingExecutor as never))
			.rejects.toThrow('INJECTED_AFTER_EVIDENCE_UPDATE');
		expect(injectedAfterStatement).toBe(2);
		// The complete state, not only the status, must match the pre-test baseline.
		expect(await snapshot(jobId)).toBe(before);
	});

	it('bounds transient retries and increments attempts for the same durable job', async () => {
		const jobId = await job();
		const firstAttempt = await markEvidenceUploadProcessingV1(evidenceId, jobId, db as never);
		expect(firstAttempt).toBe(1);

		const temporary = Object.assign(new Error('temporary object store outage'), {
			code: 'STORAGE_TEMPORARY_FAILURE',
			$metadata: { httpStatusCode: 503 },
		});
		await expect(requeueEvidenceUploadJobV1(jobId, evidenceId, firstAttempt, temporary, db as never)).resolves.toBe(true);
		let jobRow = await db.execute(sql`SELECT status FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((jobRow.rows[0] as { status: string }).status).toBe('queued');
		let ev = await evidenceState();
		expect(ev.processingLastRetryCode).toBe('STORAGE_TEMPORARY_FAILURE');

		await db.execute(sql`UPDATE analysis_jobs SET status = 'running' WHERE id = ${jobId}::uuid`);
		const secondAttempt = await markEvidenceUploadProcessingV1(evidenceId, jobId, db as never);
		expect(secondAttempt).toBe(2);
		await expect(requeueEvidenceUploadJobV1(jobId, evidenceId, secondAttempt, temporary, db as never)).resolves.toBe(true);

		await db.execute(sql`UPDATE analysis_jobs SET status = 'running' WHERE id = ${jobId}::uuid`);
		const thirdAttempt = await markEvidenceUploadProcessingV1(evidenceId, jobId, db as never);
		expect(thirdAttempt).toBe(3);
		await expect(requeueEvidenceUploadJobV1(jobId, evidenceId, thirdAttempt, temporary, db as never)).resolves.toBe(false);
		await failEvidenceUploadJobV1(jobId, evidenceId, temporary, db as never);
		jobRow = await db.execute(sql`SELECT status FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((jobRow.rows[0] as { status: string }).status).toBe('failed');
		ev = await evidenceState();
		expect(ev.processingFailureCode).toBe('STORAGE_TEMPORARY_FAILURE');
	});

	it('a failure does not overwrite completed evidence and still fails its job', async () => {
		await db.execute(
			sql`UPDATE evidence SET status = 'complete', ai_analysis = '{"extractionStatus":"complete"}'::jsonb WHERE id = ${evidenceId}::uuid`
		);
		const jobId = await job();
		await failEvidenceUploadJobV1(jobId, evidenceId, 'late stale worker failure', db as never);
		const j = await db.execute(sql`SELECT status FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((j.rows[0] as { status: string }).status).toBe('failed');
		const ev = await evidenceState();
		expect(ev.extractionStatus).toBe('complete');
		expect(await evidenceStatus()).toBe('complete');
	});
});
