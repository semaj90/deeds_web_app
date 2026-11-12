import { sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';

export const ANALYSIS_JOB_PROGRESS_STAGES_V1 = [
	'processing',
	'source_fetch',
	'text_extraction',
	'content_analysis',
	'canonical_indexing',
] as const;

export type AnalysisJobProgressStageV1 = typeof ANALYSIS_JOB_PROGRESS_STAGES_V1[number];

type QueryExecutor = { execute(query: SQL): Promise<unknown> };
type AvailabilityResult = { available?: boolean | string };

function resultRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
		return (result as { rows: T[] }).rows;
	}
	return [];
}

function isMissingEventTable(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const details = error as { code?: unknown; message?: unknown };
	return details.code === '42P01' ||
		(typeof details.message === 'string' && details.message.includes('analysis_job_events'));
}

/**
 * Builds an optional writer for named progress stages. Until the proposal-only
 * event-history table exists, this is a no-op so durable job processing keeps
 * working on pre-migration databases.
 */
export function createAnalysisJobProgressEventWriterV1(
	executor: QueryExecutor,
	now: () => number = Date.now,
) {
	let tableAvailable: boolean | undefined;
	let checkedAt = 0;
	const probeTtlMs = 30_000;

	async function hasEventTable(): Promise<boolean> {
		const timestamp = now();
		if (tableAvailable !== undefined && timestamp - checkedAt < probeTtlMs) return tableAvailable;
		try {
			const rows = resultRows<AvailabilityResult>(await executor.execute(sql`
				SELECT to_regclass('public.analysis_job_events') IS NOT NULL AS available
			`));
			tableAvailable = rows[0]?.available === true || rows[0]?.available === 't';
		} catch {
			// Progress telemetry must not block the canonical analysis worker.
			tableAvailable = false;
		}
		checkedAt = timestamp;
		return tableAvailable;
	}

	return async (jobId: string, stage: AnalysisJobProgressStageV1): Promise<boolean> => {
		if (!(ANALYSIS_JOB_PROGRESS_STAGES_V1 as readonly string[]).includes(stage)) {
			throw new Error('ANALYSIS_JOB_PROGRESS_STAGE_INVALID');
		}
		if (!await hasEventTable()) return false;

		try {
			const rows = resultRows<{ event_id: string }>(await executor.execute(sql`
				INSERT INTO public.analysis_job_events
					(job_id, evidence_id, case_id, stage, status, progress, source_revision)
				SELECT j.id, e.id, e.case_id, ${stage}, j.status, j.progress, e.hash
				FROM public.analysis_jobs AS j
				JOIN public.evidence AS e ON e.id = j.evidence_id
				WHERE j.id = ${jobId}::uuid
				  AND e.case_id IS NOT NULL
				  AND (j.case_id IS NULL OR j.case_id = e.case_id)
				  AND j.status = 'running'
				  AND e.hash ~ '^sha256:[a-f0-9]{64}$'
				RETURNING event_id::text
			`));
			return rows.length > 0;
		} catch (error) {
			if (isMissingEventTable(error)) {
				tableAvailable = false;
				checkedAt = now();
				return false;
			}
			throw error;
		}
	};
}

export const recordAnalysisJobProgressStageV1 = createAnalysisJobProgressEventWriterV1(db);
