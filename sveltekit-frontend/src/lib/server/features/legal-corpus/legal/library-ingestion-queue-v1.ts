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
	return claimLibraryIngestionJobV1(undefined, leaseSeconds);
}

/** Claims one specific durable job after a document.parse notification arrives. */
export async function claimLibraryIngestionJobByIdV1(
	jobId: string,
	leaseSeconds = DEFAULT_LEASE_SECONDS,
	expected?: { documentId: string; sourceSha256: string; documentRevision: string },
): Promise<ClaimedLibraryIngestionJobV1 | null> {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
		throw new Error('LIBRARY_INGESTION_JOB_ID_INVALID');
	}
	if (expected && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected.documentId)
		|| !/^[a-f0-9]{64}$/i.test(expected.sourceSha256)
		|| !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected.documentRevision))) {
		throw new Error('LIBRARY_INGESTION_DISPATCH_IDENTITY_INVALID');
	}
	return claimLibraryIngestionJobV1(jobId, leaseSeconds, expected);
}

async function claimLibraryIngestionJobV1(
	jobId: string | undefined,
	leaseSeconds: number,
	expected?: { documentId: string; sourceSha256: string; documentRevision: string },
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
			  AND ($3::uuid IS NULL OR id = $3::uuid)
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
			  AND ($3::uuid IS NULL OR id = $3::uuid)
			  AND ($4::uuid IS NULL OR document_id = $4::uuid)
			  AND ($5::text IS NULL OR lower(source_hash) = lower($5::text))
			  AND ($6::uuid IS NULL OR EXISTS (
				SELECT 1 FROM library_document_versions version
				WHERE version.id = $6::uuid
				  AND version.document_id = ingestion_jobs.document_id
				  AND lower(version.source_hash) = lower(ingestion_jobs.source_hash)
			  ))
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
		[leaseToken, leaseSeconds, jobId ?? null, expected?.documentId ?? null, expected?.sourceSha256 ?? null, expected?.documentRevision ?? null],
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

/** Keep the generic workflow projection aligned with the canonical ingestion job. */
export async function reconcileLibraryDocumentParseTaskV1(jobId: string): Promise<void> {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
		throw new Error('LIBRARY_INGESTION_JOB_ID_INVALID');
	}
	await pool.query(
		`UPDATE workflow_tasks task
		 SET status = CASE job.status
		       WHEN 'complete' THEN 'succeeded'
		       WHEN 'failed' THEN 'failed'
		       WHEN 'running' THEN 'running'
		       ELSE 'queued'
		     END,
		     result = CASE WHEN job.status = 'complete'
		       THEN jsonb_build_object('jobId', job.id, 'documentId', job.document_id, 'sourceHash', job.source_hash, 'status', job.status)
		       ELSE task.result END,
		     error_message = CASE WHEN job.status = 'failed' THEN job.error_text ELSE NULL END,
		     completed_at = CASE WHEN job.status IN ('complete', 'failed') THEN now() ELSE NULL END,
		     updated_at = now()
		FROM ingestion_jobs job
		WHERE job.id = $1::uuid
		  AND task.command_type = 'document.parse'
		  AND task.payload->>'jobId' = job.id::text`,
		[jobId],
	);
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
