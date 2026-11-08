import { pgRows } from '$lib/server/db/client';
/**
 * Drizzle-based analysis job tracking with DB-backed queue.
 * Jobs are enqueued as 'queued', claimed via FOR UPDATE SKIP LOCKED,
 * and processed by the worker loop with p-limit concurrency gates.
 */

import { db } from '$lib/server/db/client';
import { analysisJobs, cases, evidence } from '$lib/server/db/schema-postgres.js';
import {
  coercePersistedPayloadEnvelope,
  type PersistedEnvelope,
} from '$lib/shared/schemas/protocol.js';
import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { postgresErrorDetails } from '$lib/server/db/postgres-error-details.js';
import { classifyPostgresError } from '$lib/server/db/readiness.js';

export type JobType = 'upload_pipeline' | 'entity_extraction' | 'forensics' | 'summarization' | 'code_feature_registry' | 'lexical_feature_registry';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export const ANALYSIS_JOBS_NOTIFY_CHANNEL = 'atlas_analysis_jobs';

let analysisJobsTableMissing = false;
let loggedMissingAnalysisJobsTable = false;

export type AnalysisJobPayload = PersistedEnvelope | Record<string, unknown>;

export function normalizeAnalysisJobPayload(
  value: AnalysisJobPayload | undefined,
  lane: string,
  ok: boolean = true
): PersistedEnvelope {
  return coercePersistedPayloadEnvelope(value, {
    source: 'analysis_jobs',
    lane,
    protocol: 'internal',
    ok,
    validatorTag: 'protocol/PersistedPayloadEnvelope@v1',
  });
}

function isMissingAnalysisJobsTableError(err: unknown): boolean {
  let current: unknown = err;

  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === 'object' && current !== null) {
      const code = 'code' in current ? String((current as { code?: unknown }).code ?? '') : '';
      const message =
        'message' in current ? String((current as { message?: unknown }).message ?? '') : '';

      if (code === '42P01' || message.includes('relation "analysis_jobs" does not exist')) {
        return true;
      }

      current = 'cause' in current ? (current as { cause?: unknown }).cause : null;
      continue;
    }

    const message = String(current ?? '');
    if (message.includes('relation "analysis_jobs" does not exist')) {
      return true;
    }
    break;
  }

  return false;
}

function markAnalysisJobsUnavailable(): void {
  analysisJobsTableMissing = true;
  if (loggedMissingAnalysisJobsTable) {
    return;
  }

  loggedMissingAnalysisJobsTable = true;
  console.warn(
    '[AnalysisJobs] analysis_jobs table is missing; DB-backed analysis polling is disabled'
  );
}

async function notifyAnalysisJobs(payload: Record<string, unknown>): Promise<void> {
  if (analysisJobsTableMissing) return;

  try {
    await db.execute(sql`
      SELECT pg_notify(
        ${ANALYSIS_JOBS_NOTIFY_CHANNEL},
        ${JSON.stringify(payload)}
      )
    `);
  } catch (err) {
    console.warn('[AnalysisJobs] job wake notification failed (non-fatal):', err);
  }
}

/**
 * Enqueue a new job with status='queued' (not running).
 * The worker loop will claim it via claimNextJob().
 */
export async function enqueueJob(params: {
  id?: string;
  evidenceId: string;
  caseId?: string | null;
  jobType: JobType;
  result?: AnalysisJobPayload;
}): Promise<string> {
  const [row] = await db
    .insert(analysisJobs)
    .values({
      ...(params.id ? { id: params.id } : {}),
      evidenceId: params.evidenceId,
      caseId: params.caseId ?? null,
      jobType: params.jobType,
      status: 'queued',
      progress: '0',
      result: normalizeAnalysisJobPayload(params.result, params.jobType),
    })
    .returning({ id: analysisJobs.id });

  void notifyAnalysisJobs({
    event: 'enqueued',
    jobId: row.id,
    evidenceId: params.evidenceId,
    jobType: params.jobType,
  });
  return row.id;
}

/**
 * Legacy: create a job that starts immediately (bypasses queue).
 * Kept for backward compat — prefer enqueueJob() for new code.
 */
export async function createAnalysisJob(params: {
  id?: string;
  evidenceId: string;
  caseId?: string | null;
  jobType: JobType;
  result?: AnalysisJobPayload;
}): Promise<string> {
  const [row] = await db
    .insert(analysisJobs)
    .values({
      ...(params.id ? { id: params.id } : {}),
      evidenceId: params.evidenceId,
      caseId: params.caseId ?? null,
      jobType: params.jobType,
      status: 'running',
      startedAt: new Date(),
      progress: '0',
      result: normalizeAnalysisJobPayload(params.result, params.jobType),
    })
    .returning({ id: analysisJobs.id });
  return row.id;
}

/**
 * Claim the next queued job of a given type using FOR UPDATE SKIP LOCKED.
 * Returns null if no jobs are available (all claimed or none queued).
 * This is the core of the DB-backed concurrency gate.
 *
 * Throws ECONNREFUSED or 57P03 errors for backoff handling by caller.
 */
export async function claimNextJob(jobType?: JobType): Promise<{
  id: string;
  evidenceId: string;
  caseId: string | null;
  jobType: string;
  result: PersistedEnvelope;
} | null> {
  const jobs = await claimBatch(jobType, 1);
  return jobs[0] ?? null;
}

/**
 * Claim up to `limit` queued jobs of a given type using FOR UPDATE SKIP LOCKED.
 * This is the batch version of the DB-backed concurrency gate.
 */
export async function claimBatch(
  jobType: JobType | undefined,
  limit: number,
  executor: { execute(query: SQL): Promise<unknown> } = db
): Promise<Array<{
  id: string;
  evidenceId: string;
  caseId: string | null;
  jobType: string;
  result: PersistedEnvelope;
}>> {
  const batchLimit = Math.floor(limit);
  if (!Number.isFinite(limit) || batchLimit <= 0) {
    return [];
  }

  if (analysisJobsTableMissing) {
    return [];
  }

  try {
    const typeFilter = jobType ? sql`AND job_type = ${jobType}` : sql``;

    const rows = await executor.execute(sql`
      WITH picked AS (
        SELECT id
        FROM analysis_jobs
        WHERE status = 'queued' ${typeFilter}
        ORDER BY created_at ASC
        LIMIT ${batchLimit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE analysis_jobs AS j
      SET status = 'running', started_at = NOW(), updated_at = NOW()
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id, j.evidence_id, j.case_id, j.job_type, j.result
    `);

    type JobRow = {
      id: string;
      evidence_id: string;
      case_id: string | null;
      job_type: string;
      result: Record<string, unknown> | null;
    };
    const batch = pgRows<JobRow>(rows);
    if (batch.length === 0) return [];

    return batch.map((item) => ({
      id: item.id,
      evidenceId: item.evidence_id,
      caseId: item.case_id,
      jobType: item.job_type,
      result: normalizeAnalysisJobPayload(item.result ?? {}, item.job_type),
    }));
  } catch (err: any) {
    // Throw specific errors for backoff logic in worker.ts
    if (
      err.code === 'ECONNREFUSED' ||
      err.message?.includes('57P03') ||
      err.message?.includes('starting up') ||
      classifyPostgresError(err).state === 'starting'
    ) {
      throw err; // Let caller handle backoff
    }

    const details = postgresErrorDetails(err);
    const detailsText = `${details.drizzleMessage ?? ''} ${details.postgresMessage ?? ''}`.toLowerCase();

    if (
      classifyPostgresError(err).retryable ||
      classifyPostgresError(details.postgresMessage).retryable ||
      /timeout|timed out|connection terminated/.test(detailsText)
    ) {
      throw err;
    }

    if (isMissingAnalysisJobsTableError(err)) {
      markAnalysisJobsUnavailable();
      return [];
    }

    // Other errors: log once and return empty
    console.error('[AnalysisJobs] Unexpected DB error:', details);
    return [];
  }
}

/**
 * Get job by ID (for SSE progress polling from DB).
 */
export async function getAnalysisJob(id: string) {
  if (analysisJobsTableMissing) {
    return null;
  }

  try {
    const [row] = await db.select().from(analysisJobs).where(eq(analysisJobs.id, id)).limit(1);
    return row ?? null;
  } catch (err) {
    if (isMissingAnalysisJobsTableError(err)) {
      markAnalysisJobsUnavailable();
      return null;
    }
    throw err;
  }
}

export async function getAnalysisJobForOwner(id: string, ownerId: number) {
	if (analysisJobsTableMissing || !Number.isSafeInteger(ownerId) || ownerId <= 0) return null;

	try {
		const [row] = await db
			.select({ job: analysisJobs })
			.from(analysisJobs)
			.innerJoin(evidence, eq(analysisJobs.evidenceId, evidence.id))
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(and(
				eq(analysisJobs.id, id),
				or(
					eq(evidence.uploadedBy, ownerId),
					eq(evidence.userId, ownerId),
					eq(cases.userId, ownerId),
					eq(cases.assignedAttorney, ownerId),
				),
			))
			.limit(1);
		return row?.job ?? null;
	} catch (err) {
		if (isMissingAnalysisJobsTableError(err)) {
			markAnalysisJobsUnavailable();
			return null;
		}
		throw err;
	}
}

/**
 * Get all jobs for an evidence item (for status page).
 */
export async function getJobsForEvidence(evidenceId: string) {
  if (analysisJobsTableMissing) {
    throw new Error('ANALYSIS_JOBS_TABLE_UNAVAILABLE');
  }

  try {
    return await db.select().from(analysisJobs).where(eq(analysisJobs.evidenceId, evidenceId));
  } catch (err) {
    if (isMissingAnalysisJobsTableError(err)) {
      markAnalysisJobsUnavailable();
      throw new Error('ANALYSIS_JOBS_TABLE_UNAVAILABLE', { cause: err });
    }
    throw err;
  }
}

/**
 * Reset stale 'running' jobs back to 'queued' (crash recovery).
 * Jobs without a heartbeat update for more than `staleMinutes` are re-queued.
 */
export async function resetStaleJobs(staleMinutes: number = 10): Promise<number> {
  if (analysisJobsTableMissing) {
    return 0;
  }

  try {
    const result = await db.execute(sql`
		UPDATE analysis_jobs
		SET status = 'queued', started_at = NULL, updated_at = NOW()
		WHERE status = 'running'
		  AND updated_at < NOW() - make_interval(mins => ${staleMinutes})
	`);
    return (result as any).rowCount ?? 0;
  } catch (err) {
    if (isMissingAnalysisJobsTableError(err)) {
      markAnalysisJobsUnavailable();
      return 0;
    }
    throw err;
  }
}

export async function updateAnalysisJob(
  id: string,
  patch: {
    status?: JobStatus;
    progress?: string;
    result?: AnalysisJobPayload;
    error?: string | null;
    completedAt?: Date | null;
  }
): Promise<void> {
  const normalizedResult =
    typeof patch.result === 'undefined'
      ? undefined
      : normalizeAnalysisJobPayload(patch.result, 'analysis', patch.status !== 'failed');

  await db
    .update(analysisJobs)
    .set({
      ...patch,
      ...(normalizedResult ? { result: normalizedResult } : {}),
      updatedAt: new Date(),
    })
    .where(eq(analysisJobs.id, id));
}

export async function completeAnalysisJob(
  id: string,
  result: AnalysisJobPayload,
  executor: { execute(query: SQL): Promise<unknown> } = db
): Promise<void> {
  const normalizedResult = normalizeAnalysisJobPayload(result, 'analysis', true);
  const updated = await executor.execute(sql`
    UPDATE analysis_jobs
    SET status = 'completed', progress = '100', result = ${JSON.stringify(normalizedResult)}::jsonb,
        completed_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id
  `);
  if (pgRows(updated).length !== 1) {
    throw new Error('ANALYSIS_JOB_COMPLETION_ROW_MISSING');
  }
}

type EvidenceUploadStateExecutor = { execute(query: SQL): Promise<unknown> };
type EvidenceUploadState = 'processing' | 'complete' | 'failed' | 'source_missing';

/** Lock and verify the durable upload job before changing its linked evidence row. */
async function assertEvidenceUploadJobLinkV1(
  executor: EvidenceUploadStateExecutor,
  jobId: string,
  evidenceId: string
): Promise<void> {
  const rows = await executor.execute(sql`
    SELECT id
    FROM analysis_jobs
    WHERE id = ${jobId}::uuid
      AND evidence_id = ${evidenceId}::uuid
      AND job_type = 'upload_pipeline'
    FOR UPDATE
  `);
  if (pgRows(rows).length !== 1) throw new Error('ANALYSIS_UPLOAD_JOB_EVIDENCE_LINK_MISMATCH');
}

export type EvidenceUploadFailureCodeV1 =
  | 'SOURCE_MISSING'
  | 'SOURCE_CHECKSUM_MISMATCH'
  | 'STORAGE_TEMPORARY_FAILURE'
  | 'UPLOAD_PIPELINE_FAILED';

export const MAX_EVIDENCE_UPLOAD_ATTEMPTS_V1 = 3;

export function shouldRetryEvidenceUploadFailureV1(
  failureCode: EvidenceUploadFailureCodeV1,
  attemptCount: number
): boolean {
  return failureCode === 'STORAGE_TEMPORARY_FAILURE' &&
    Number.isInteger(attemptCount) &&
    attemptCount > 0 &&
    attemptCount < MAX_EVIDENCE_UPLOAD_ATTEMPTS_V1;
}

/** Classify only explicit object-store absence as source_missing; bucket/config errors stay failed. */
export function classifyEvidenceUploadFailureV1(error: unknown): EvidenceUploadFailureCodeV1 {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  const metadata = typeof record.$metadata === 'object' && record.$metadata !== null
    ? record.$metadata as Record<string, unknown>
    : {};
  const name = String(record.name ?? '');
  const code = String(record.code ?? record.Code ?? '');
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(metadata.httpStatusCode ?? record.statusCode ?? record.status);

  if (/EVIDENCE_SOURCE_SHA256_MISMATCH/.test(message)) return 'SOURCE_CHECKSUM_MISMATCH';
  if (name === 'NoSuchKey' || code === 'NoSuchKey' || /\bNoSuchKey\b/.test(message)) return 'SOURCE_MISSING';
  if (
    code === 'STORAGE_TEMPORARY_FAILURE' || /EVIDENCE_UPLOAD_RETRY_LIMIT_EXCEEDED/.test(message) ||
    status === 429 || status >= 500 ||
    ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'RequestTimeout', 'SlowDown', 'ServiceUnavailable', 'InternalError', 'Throttling'].includes(code) ||
    ['TimeoutError', 'NetworkingError'].includes(name)
  ) return 'STORAGE_TEMPORARY_FAILURE';
  return 'UPLOAD_PIPELINE_FAILED';
}

function evidenceUploadErrorMessageV1(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function persistEvidenceUploadStateV1(
  executor: EvidenceUploadStateExecutor,
  evidenceId: string,
  jobId: string,
  state: EvidenceUploadState,
  details: Record<string, unknown> = {}
): Promise<void> {
  const updated = await executor.execute(sql`
    UPDATE evidence
    SET status = CASE
      WHEN ${state !== 'complete'} AND (status IN ('complete', 'completed') OR ai_analysis->>'extractionStatus' = 'complete')
        THEN status
      ELSE ${state}
    END,
    ai_analysis = CASE
      WHEN ${state !== 'complete'} AND (status IN ('complete', 'completed') OR ai_analysis->>'extractionStatus' = 'complete')
        THEN ai_analysis
      ELSE COALESCE(ai_analysis, '{}'::jsonb) || ${JSON.stringify({
        extractionStatus: state,
        processingJobId: state === 'processing' ? jobId : null,
        ...details,
      })}::jsonb
    END
    WHERE id = ${evidenceId}::uuid
    RETURNING id
  `);
  if (pgRows(updated).length !== 1) {
    throw new Error('EVIDENCE_UPLOAD_STATE_ROW_MISSING');
  }
}

/** Mark an upload as processing after the durable worker has claimed its job. */
export async function markEvidenceUploadProcessingV1(
  evidenceId: string,
  jobId: string,
  executor: EvidenceUploadStateExecutor = db
): Promise<number> {
  const updated = await executor.execute(sql`
    UPDATE evidence
    SET status = CASE
      WHEN status IN ('complete', 'completed') OR ai_analysis->>'extractionStatus' = 'complete' THEN status
      ELSE 'processing'
    END,
    ai_analysis = CASE
      WHEN status IN ('complete', 'completed') OR ai_analysis->>'extractionStatus' = 'complete' THEN ai_analysis
      ELSE COALESCE(ai_analysis, '{}'::jsonb) || jsonb_build_object(
        'extractionStatus', 'processing',
        'processingJobId', ${jobId}::text,
        'processingAttemptCount', CASE
          WHEN ai_analysis->>'processingJobId' IS DISTINCT FROM ${jobId} THEN 1
          WHEN COALESCE(ai_analysis->>'processingAttemptCount', '') = '' THEN 1
          WHEN ai_analysis->>'processingAttemptCount' ~ '^[0-9]{1,8}$'
            THEN LEAST((ai_analysis->>'processingAttemptCount')::integer + 1, ${MAX_EVIDENCE_UPLOAD_ATTEMPTS_V1 + 1})
          ELSE ${MAX_EVIDENCE_UPLOAD_ATTEMPTS_V1 + 1}
        END,
        'processingStartedAt', NOW()::text
      )
    END
    WHERE id = ${evidenceId}::uuid
      AND EXISTS (
        SELECT 1 FROM analysis_jobs
        WHERE id = ${jobId}::uuid
          AND evidence_id = ${evidenceId}::uuid
          AND job_type = 'upload_pipeline'
      )
    RETURNING
      COALESCE((ai_analysis->>'processingAttemptCount')::integer, 0) AS attempt_count,
      (status IN ('complete', 'completed') OR ai_analysis->>'extractionStatus' = 'complete') AS already_complete
  `);
  const rows = pgRows(updated) as Array<{ attempt_count: number | string; already_complete: boolean }>;
  if (rows.length !== 1) throw new Error('EVIDENCE_UPLOAD_STATE_ROW_MISSING');
  if (rows[0].already_complete) throw new Error('EVIDENCE_UPLOAD_ALREADY_COMPLETE');
  return Number(rows[0].attempt_count);
}

/** Requeue a transient object-store failure without marking the source terminally failed. */
export async function requeueEvidenceUploadJobV1(
  jobId: string,
  evidenceId: string,
  attemptCount: number,
  error: unknown,
  executor: typeof db = db
): Promise<boolean> {
  if (!shouldRetryEvidenceUploadFailureV1('STORAGE_TEMPORARY_FAILURE', attemptCount)) return false;

  return executor.transaction(async (tx) => {
    await assertEvidenceUploadJobLinkV1(tx, jobId, evidenceId);
    const evidenceRows = await tx.execute(sql`
      SELECT status, ai_analysis->>'extractionStatus' AS extraction_status
      FROM evidence WHERE id = ${evidenceId}::uuid FOR UPDATE
    `);
    const evidence = pgRows(evidenceRows) as Array<{ status: string; extraction_status: string | null }>;
    if (evidence.length !== 1) throw new Error('EVIDENCE_UPLOAD_STATE_ROW_MISSING');
    if (evidence[0].status === 'complete' || evidence[0].status === 'completed' || evidence[0].extraction_status === 'complete') {
      return false;
    }

    const updatedJob = await tx.execute(sql`
      UPDATE analysis_jobs
      SET status = 'queued', error = ${evidenceUploadErrorMessageV1(error)}, progress = '0',
          completed_at = NULL, updated_at = NOW()
      WHERE id = ${jobId}::uuid AND evidence_id = ${evidenceId}::uuid AND status = 'running'
      RETURNING id
    `);
    if (pgRows(updatedJob).length !== 1) throw new Error('ANALYSIS_JOB_REQUEUE_ROW_MISSING');

    const updatedEvidence = await tx.execute(sql`
      UPDATE evidence
      SET ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || ${JSON.stringify({
        processingLastRetryCode: 'STORAGE_TEMPORARY_FAILURE',
        processingLastRetryAt: new Date().toISOString(),
      })}::jsonb
      WHERE id = ${evidenceId}::uuid
        AND COALESCE(ai_analysis->>'extractionStatus', '') <> 'complete'
      RETURNING id
    `);
    if (pgRows(updatedEvidence).length !== 1) throw new Error('EVIDENCE_UPLOAD_STATE_ROW_MISSING');
    return true;
  });
}

/** Atomically persist canonical completion and the terminal job receipt. */
export async function completeEvidenceUploadJobV1(
  jobId: string,
  evidenceId: string,
  result: AnalysisJobPayload,
  executor: typeof db = db
): Promise<void> {
  const receipt = result as Record<string, unknown>;
  if (
    receipt.status !== 'processed' ||
    !Number.isSafeInteger(receipt.chunkCount) ||
    (receipt.chunkCount as number) <= 0 ||
    receipt.persistedCount !== receipt.chunkCount ||
    typeof receipt.sourceRevision !== 'string'
  ) {
    throw new Error('ANALYSIS_UPLOAD_CANONICAL_RECEIPT_INVALID');
  }

  await executor.transaction(async (tx) => {
    await assertEvidenceUploadJobLinkV1(tx, jobId, evidenceId);
    await persistEvidenceUploadStateV1(tx, evidenceId, jobId, 'complete', {
      totalChunks: receipt.chunkCount,
      chunkCount: receipt.chunkCount,
      embeddingFailures: 0,
      sourceRevision: receipt.sourceRevision,
      processingCompletedAt: new Date().toISOString(),
    });
    await completeAnalysisJob(jobId, result, tx);
  });
}

/** Atomically persist failure state and the failed durable job. */
export async function failEvidenceUploadJobV1(
  jobId: string,
  evidenceId: string,
  error: unknown,
  executor: typeof db = db
): Promise<void> {
  const failureCode = classifyEvidenceUploadFailureV1(error);
  const evidenceState: EvidenceUploadState = failureCode === 'SOURCE_MISSING' ? 'source_missing' : 'failed';
  await executor.transaction(async (tx) => {
    await assertEvidenceUploadJobLinkV1(tx, jobId, evidenceId);
    await persistEvidenceUploadStateV1(tx, evidenceId, jobId, evidenceState, {
      processingFailedAt: new Date().toISOString(),
      processingFailureCode: failureCode,
    });
    await failAnalysisJob(jobId, evidenceUploadErrorMessageV1(error), tx);
  });
}

export async function failAnalysisJob(
  id: string,
  error: string,
  executor: { execute(query: SQL): Promise<unknown> } = db
): Promise<void> {
  const updated = await executor.execute(sql`
    UPDATE analysis_jobs
    SET status = 'failed', error = ${error}, completed_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id
  `);
  if (pgRows(updated).length !== 1) {
    throw new Error('ANALYSIS_JOB_FAILURE_ROW_MISSING');
  }
}

/**
 * Monitoring: count jobs by status (for admin dashboards / health checks).
 */
export async function getJobCounts(): Promise<Record<string, number>> {
  const result: Record<string, number> = { queued: 0, running: 0, completed: 0, failed: 0 };

  if (analysisJobsTableMissing) {
    throw new Error('ANALYSIS_JOBS_TABLE_UNAVAILABLE');
  }

  try {
    const rows = await db.execute(sql`
		SELECT status, COUNT(*)::int AS count
		FROM analysis_jobs
		GROUP BY status
	`);
    for (const row of pgRows(rows)) {
      result[(row as any).status] = (row as any).count;
    }
  } catch (err) {
    if (isMissingAnalysisJobsTableError(err)) {
      markAnalysisJobsUnavailable();
      throw new Error('ANALYSIS_JOBS_TABLE_UNAVAILABLE', { cause: err });
    }
    throw err;
  }

  return result;
}
