import { randomUUID } from 'node:crypto';
import { pool } from '$lib/server/db/client.js';

export interface ClaimedLibraryIngestionJobV1 {
	jobId: string;
	documentId: string;
	leaseToken: string;
	fencingToken: string;
	attemptCount: number;
	sourceHash: string;
}

const DEFAULT_LEASE_SECONDS = 120;

/** Atomically claims one ready job, or reclaims one whose worker lease expired. */
export async function claimNextLibraryIngestionJobV1(
	leaseSeconds = DEFAULT_LEASE_SECONDS,
): Promise<ClaimedLibraryIngestionJobV1 | null> {
	if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) {
		throw new Error('LIBRARY_INGESTION_LEASE_SECONDS_OUT_OF_RANGE');
	}
	const leaseToken = randomUUID();
	const result = await pool.query(
		`WITH exhausted AS (
			UPDATE ingestion_jobs
			SET status = 'failed', stage = 'failed'::processing_status,
			    lease_token = NULL, lease_expires_at = NULL,
			    error_text = COALESCE(error_text, 'Worker lease expired after maximum attempts'),
			    updated_at = now()
			WHERE status = 'running' AND lease_token IS NOT NULL
			  AND lease_expires_at <= now() AND attempt_count >= max_attempts
			RETURNING document_id
		), failed_documents AS (
			UPDATE library_documents AS document
			SET processing_status = 'failed', updated_at = now()
			FROM (SELECT DISTINCT document_id FROM exhausted) AS expired
			WHERE document.id = expired.document_id
			RETURNING document.id
		), candidate AS (
			SELECT id
			FROM ingestion_jobs
			WHERE attempt_count < max_attempts
			  AND source_hash ~ '^[a-fA-F0-9]{64}$'
			  AND (
				(status = 'queued' AND available_at <= now())
				OR (status = 'running' AND lease_expires_at <= now())
			  )
			ORDER BY available_at, created_at, id
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		UPDATE ingestion_jobs AS job
		SET status = 'running',
		    attempt_count = job.attempt_count + 1,
		    lease_token = $1::uuid,
		    fencing_token = job.fencing_token + 1,
		    lease_expires_at = now() + ($2::integer * interval '1 second'),
		    updated_at = now()
		FROM candidate
		WHERE job.id = candidate.id
		RETURNING job.id, job.document_id, job.lease_token, job.fencing_token, job.attempt_count, job.source_hash`,
		[leaseToken, leaseSeconds],
	);
	const row = result.rows[0] as
		| { id: string; document_id: string; lease_token: string; fencing_token: string | number; attempt_count: number; source_hash: string }
		| undefined;
	if (!row) return null;
	return {
		jobId: row.id,
		documentId: row.document_id,
		leaseToken: row.lease_token,
		fencingToken: String(row.fencing_token),
		attemptCount: Number(row.attempt_count),
		sourceHash: row.source_hash,
	};
}

export async function heartbeatLibraryIngestionLeaseV1(
	jobId: string,
	leaseToken: string,
	fencingToken: string,
	leaseSeconds = DEFAULT_LEASE_SECONDS,
): Promise<boolean> {
	if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) {
		throw new Error('LIBRARY_INGESTION_LEASE_SECONDS_OUT_OF_RANGE');
	}
	const result = await pool.query(
		`UPDATE ingestion_jobs
		 SET lease_expires_at = now() + ($4::integer * interval '1 second'), updated_at = now()
		 WHERE id = $1::uuid AND status = 'running' AND lease_token = $2::uuid
		   AND fencing_token = $3::bigint AND lease_expires_at > now()`,
		[jobId, leaseToken, fencingToken, leaseSeconds],
	);
	return result.rowCount === 1;
}

export async function assertLibraryIngestionLeaseV1(jobId: string, leaseToken: string, fencingToken: string): Promise<void> {
	const result = await pool.query(
		`SELECT 1 FROM ingestion_jobs
		 WHERE id = $1::uuid AND status = 'running' AND lease_token = $2::uuid
		   AND fencing_token = $3::bigint AND lease_expires_at > now()`,
		[jobId, leaseToken, fencingToken],
	);
	if (result.rowCount !== 1) throw new Error('LIBRARY_INGESTION_LEASE_LOST');
}

export async function failLibraryIngestionAttemptV1(
	jobId: string,
	leaseToken: string,
	fencingToken: string,
	errorMessage: string,
): Promise<'retry_scheduled' | 'failed' | 'lease_lost'> {
	const result = await pool.query(
		`WITH failed_attempt AS (
		 UPDATE ingestion_jobs
		 SET status = CASE WHEN attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
		     stage = CASE WHEN attempt_count < max_attempts THEN 'queued'::processing_status ELSE 'failed'::processing_status END,
		     error_text = left($4, 4000),
		     metrics_json = COALESCE(metrics_json, '{}'::jsonb) || jsonb_build_object('lastError', left($4, 4000)),
		     available_at = CASE
		       WHEN attempt_count < max_attempts
		       THEN now() + (LEAST(300, 5 * power(2, GREATEST(attempt_count - 1, 0)))::integer * interval '1 second')
		       ELSE available_at
		     END,
		     lease_token = NULL, lease_expires_at = NULL, updated_at = now()
		 WHERE id = $1::uuid AND status = 'running' AND lease_token = $2::uuid
		   AND fencing_token = $3::bigint
		   AND lease_expires_at > now()
		RETURNING status, document_id
		)
		UPDATE library_documents document
		SET processing_status = failed_attempt.status::processing_status, updated_at = now()
		FROM failed_attempt WHERE document.id = failed_attempt.document_id
		RETURNING failed_attempt.status`,
		[jobId, leaseToken, fencingToken, errorMessage],
	);
	if (result.rowCount !== 1) return 'lease_lost';
	const status = result.rows[0]?.status;
	return status === 'queued' ? 'retry_scheduled' : 'failed';
}
