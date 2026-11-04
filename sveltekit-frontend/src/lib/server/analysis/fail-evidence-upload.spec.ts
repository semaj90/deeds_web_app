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
	let evidenceSnapshots: Array<{ id: string; status: string | null; ai_analysis: unknown }> = [];
	let createdJobIds: string[] = [];

	beforeAll(async () => {
		const target = new URL(DB_URL);
		if (target.pathname !== '/scene_marker_full_002952') {
			throw new Error('FAIL07_TEST_DATABASE_MISMATCH: expected scene_marker_full_002952');
		}
		pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
		const identity = await pool.query('SELECT current_database() AS database');
		if (identity.rows[0]?.database !== 'scene_marker_full_002952') {
			throw new Error('FAIL07_TEST_DATABASE_MISMATCH: connected database is not scene_marker_full_002952');
		}
	});

	beforeEach(async () => {
		client = await pool.connect();
		db = drizzle(client);
		createdJobIds = [];
		const rows = await db.execute(sql`SELECT id, status, ai_analysis FROM evidence ORDER BY id LIMIT 2`);
		if (rows.rows.length < 2) {
			client.release();
			client = undefined;
			throw new Error('FAIL07_TEST_FIXTURE_MISSING: expected two scratch evidence rows');
		}
		evidenceSnapshots = rows.rows as Array<{ id: string; status: string | null; ai_analysis: unknown }>;
		evidenceId = evidenceSnapshots[0].id;
		otherEvidenceId = evidenceSnapshots[1].id;
	});

	afterEach(async () => {
		const cleanupClient = client;
		if (!cleanupClient) return;
		try {
			await cleanupClient.query('BEGIN');
			if (createdJobIds.length > 0) {
				await cleanupClient.query('DELETE FROM analysis_jobs WHERE id = ANY($1::uuid[])', [createdJobIds]);
			}
			for (const row of evidenceSnapshots) {
				const aiAnalysis = row.ai_analysis == null ? null : JSON.stringify(row.ai_analysis);
				await cleanupClient.query(
					'UPDATE evidence SET status = $1, ai_analysis = $2::jsonb WHERE id = $3::uuid',
					[row.status, aiAnalysis, row.id]
				);
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

	async function job(forEvidenceId = evidenceId): Promise<string> {
		const id = randomUUID();
		await db.execute(sql`
			INSERT INTO analysis_jobs (id, evidence_id, job_type, status, progress)
			VALUES (${id}::uuid, ${forEvidenceId}::uuid, 'upload_pipeline', 'running', '10')
		`);
		createdJobIds.push(id);
		return id;
	}

	it('completion replay is idempotent and rejects a mismatched evidence link', async () => {
		await db.execute(sql`
			UPDATE evidence SET status = 'pending', ai_analysis = '{}'::jsonb
			WHERE id IN (${evidenceId}::uuid, ${otherEvidenceId}::uuid)
		`);
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

	it('a missing source marks both the job and evidence source_missing', async () => {
		await db.execute(sql`UPDATE evidence SET status = 'pending', ai_analysis = '{}'::jsonb WHERE id = ${evidenceId}::uuid`);
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
		await db.execute(sql`UPDATE evidence SET status = 'pending', ai_analysis = '{}'::jsonb WHERE id = ${evidenceId}::uuid`);
		const jobId = await job();
		await failEvidenceUploadJobV1(jobId, evidenceId, 'first failure', db as never);
		await failEvidenceUploadJobV1(jobId, evidenceId, 'first failure', db as never);
		const j = await db.execute(sql`SELECT status FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((j.rows[0] as { status: string }).status).toBe('failed');
		const ev = await evidenceState();
		expect(ev.extractionStatus).toBe('failed');
	});

	it('rolls back evidence changes when terminal job finalization fails inside the transaction', async () => {
		await db.execute(sql`UPDATE evidence SET status = 'pending', ai_analysis = '{}'::jsonb WHERE id = ${evidenceId}::uuid`);
		const jobId = await job();
		let executions = 0;
		const failingExecutor = {
			transaction: (callback: (tx: { execute: (query: Parameters<typeof db.execute>[0]) => Promise<unknown> }) => Promise<unknown>) =>
				db.transaction(async (realTx) => callback({
					execute: async (query) => {
						executions += 1;
						const result = await realTx.execute(query);
						if (executions === 2) throw new Error('INJECTED_AFTER_EVIDENCE_UPDATE');
						return result;
					},
				})),
		};

		await expect(failEvidenceUploadJobV1(jobId, evidenceId, 'injected rollback', failingExecutor as never))
			.rejects.toThrow('INJECTED_AFTER_EVIDENCE_UPDATE');
		expect(await evidenceStatus()).toBe('pending');
		expect((await evidenceState()).extractionStatus).toBeUndefined();
		const jobRow = await db.execute(sql`SELECT status FROM analysis_jobs WHERE id = ${jobId}::uuid`);
		expect((jobRow.rows[0] as { status: string }).status).toBe('running');
	});

	it('bounds transient retries and increments attempts for the same durable job', async () => {
		await db.execute(sql`UPDATE evidence SET status = 'pending', ai_analysis = '{}'::jsonb WHERE id = ${evidenceId}::uuid`);
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
