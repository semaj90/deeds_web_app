import { pgRows } from '$lib/server/db/client';
/**
 * Drizzle-based analysis job tracking with DB-backed queue.
 * Jobs are enqueued as 'queued', claimed via FOR UPDATE SKIP LOCKED,
 * and processed by the worker loop with p-limit concurrency gates.
 */

import { db } from '$lib/server/db/client';
import { analysisJobs } from '$lib/server/db/schema-postgres.js';
import {
  coercePersistedPayloadEnvelope,
  type PersistedEnvelope,
} from '$lib/shared/schemas/protocol.js';
import { eq, sql } from 'drizzle-orm';

export type JobType = 'upload_pipeline' | 'entity_extraction' | 'forensics' | 'summarization';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

let analysisJobsTableMissing = false;
let loggedMissingAnalysisJobsTable = false;

type AnalysisJobPayload = PersistedEnvelope | Record<string, unknown>;

function normalizeAnalysisJobPayload(
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

/**
 * Enqueue a new job with status='queued' (not running).
 * The worker loop will claim it via claimNextJob().
 */
export async function enqueueJob(params: {
  evidenceId: string;
  caseId?: string | null;
  jobType: JobType;
  result?: AnalysisJobPayload;
}): Promise<string> {
  const [row] = await db
    .insert(analysisJobs)
    .values({
      evidenceId: params.evidenceId,
      caseId: params.caseId ?? null,
      jobType: params.jobType,
      status: 'queued',
      progress: '0',
      result: normalizeAnalysisJobPayload(params.result, params.jobType),
    })
    .returning({ id: analysisJobs.id });
  return row.id;
}

/**
 * Legacy: create a job that starts immediately (bypasses queue).
 * Kept for backward compat — prefer enqueueJob() for new code.
 */
export async function createAnalysisJob(params: {
  evidenceId: string;
  caseId?: string | null;
  jobType: JobType;
}): Promise<string> {
  const [row] = await db
    .insert(analysisJobs)
    .values({
      evidenceId: params.evidenceId,
      caseId: params.caseId ?? null,
      jobType: params.jobType,
      status: 'running',
      startedAt: new Date(),
      progress: '0',
      result: normalizeAnalysisJobPayload({}, params.jobType),
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
  if (analysisJobsTableMissing) {
    return null;
  }

  try {
    const typeFilter = jobType ? sql`AND job_type = ${jobType}` : sql``;

    const rows = await db.execute(sql`
			UPDATE analysis_jobs
			SET status = 'running', started_at = NOW(), updated_at = NOW()
			WHERE id = (
				SELECT id FROM analysis_jobs
				WHERE status = 'queued' ${typeFilter}
				ORDER BY created_at ASC
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id, evidence_id, case_id, job_type, result
		`);

    type JobRow = {
      id: string;
      evidence_id: string;
      case_id: string | null;
      job_type: string;
      result: Record<string, unknown> | null;
    };
    const row = pgRows<JobRow>(rows)?.[0];
    if (!row) return null;

    return {
      id: row.id,
      evidenceId: row.evidence_id,
      caseId: row.case_id,
      jobType: row.job_type,
      result: normalizeAnalysisJobPayload(row.result ?? {}, row.job_type),
    };
  } catch (err: any) {
    // Throw specific errors for backoff logic in worker.ts
    if (
      err.code === 'ECONNREFUSED' ||
      err.message?.includes('57P03') ||
      err.message?.includes('starting up')
    ) {
      throw err; // Let caller handle backoff
    }

    if (isMissingAnalysisJobsTableError(err)) {
      markAnalysisJobsUnavailable();
      return null;
    }

    // Other errors: log once and return empty
    console.error('[AnalysisJobs] Unexpected DB error:', err.message);
    return null;
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

/**
 * Get all jobs for an evidence item (for status page).
 */
export async function getJobsForEvidence(evidenceId: string) {
  if (analysisJobsTableMissing) {
    return [];
  }

  try {
    return await db.select().from(analysisJobs).where(eq(analysisJobs.evidenceId, evidenceId));
  } catch (err) {
    if (isMissingAnalysisJobsTableError(err)) {
      markAnalysisJobsUnavailable();
      return [];
    }
    throw err;
  }
}

/**
 * Reset stale 'running' jobs back to 'queued' (crash recovery).
 * Jobs stuck in 'running' for more than `staleMinutes` are re-queued.
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
		  AND started_at < NOW() - make_interval(mins => ${staleMinutes})
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

export async function completeAnalysisJob(id: string, result: AnalysisJobPayload): Promise<void> {
  await updateAnalysisJob(id, {
    status: 'completed',
    progress: '100',
    result: normalizeAnalysisJobPayload(result, 'analysis', true),
    completedAt: new Date(),
  });
}

export async function failAnalysisJob(id: string, error: string): Promise<void> {
  await updateAnalysisJob(id, {
    status: 'failed',
    error,
    completedAt: new Date(),
  });
}

/**
 * Monitoring: count jobs by status (for admin dashboards / health checks).
 */
export async function getJobCounts(): Promise<Record<string, number>> {
  const result: Record<string, number> = { queued: 0, running: 0, completed: 0, failed: 0 };

  if (analysisJobsTableMissing) {
    return result;
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
      return result;
    }
    throw err;
  }

  return result;
}
