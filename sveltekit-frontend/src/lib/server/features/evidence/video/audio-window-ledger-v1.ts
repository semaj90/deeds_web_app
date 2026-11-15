import { sql } from 'drizzle-orm';
import type { AudioWindowLedgerV1 } from './durable-video-analysis-v1.js';

/** Minimal database surface: raw SQL execution returning rows, as used by the vector writer. */
export interface AudioWindowLedgerDatabaseV1 {
	execute(query: ReturnType<typeof sql>): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const LEDGER_TABLE = 'public.evidence_audio_window_ledger';

/**
 * Returns a PostgreSQL-backed window ledger only when the migration has been applied.
 * When the table is absent it returns undefined, so the worker keeps its existing behaviour.
 * This never creates the table.
 */
export async function createAudioWindowLedgerIfAvailableV1(
	database: AudioWindowLedgerDatabaseV1,
): Promise<AudioWindowLedgerV1 | undefined> {
	const probe = await database.execute(sql`SELECT to_regclass(${LEDGER_TABLE})::text AS name`);
	if (!probe.rows[0]?.name) return undefined;
	return createAudioWindowLedgerV1(database);
}

export function createAudioWindowLedgerV1(database: AudioWindowLedgerDatabaseV1): AudioWindowLedgerV1 {
	return {
		async completedWindowIndexes({ evidenceId, sourceRevision, analysisRevision }) {
			const result = await database.execute(sql`
				SELECT window_index
				FROM public.evidence_audio_window_ledger
				WHERE evidence_id = ${evidenceId}::uuid
				  AND source_revision = ${sourceRevision}
				  AND analysis_revision = ${analysisRevision}
				  AND status = 'COMPLETED'
			`);
			return new Set(result.rows.map((row) => Number(row.window_index)));
		},
		async recordWindow(record) {
			// Idempotent per window key. A retry increments attempt_count; a later COMPLETED keeps its locator.
			await database.execute(sql`
				INSERT INTO public.evidence_audio_window_ledger (
					evidence_id, source_revision, analysis_revision, analysis_job_id, window_index,
					start_sample, sample_count, status, attempt_count, last_error, vector_locator_sha256
				) VALUES (
					${record.evidenceId}::uuid, ${record.sourceRevision}, ${record.analysisRevision},
					${record.analysisJobId}::uuid, ${record.windowIndex}, ${record.startSample},
					${record.sampleCount}, ${record.status}, 1, ${record.error ?? null}, ${record.vectorLocatorSha256 ?? null}
				)
				ON CONFLICT (evidence_id, source_revision, analysis_revision, window_index) DO UPDATE SET
					analysis_job_id = EXCLUDED.analysis_job_id,
					status = EXCLUDED.status,
					attempt_count = public.evidence_audio_window_ledger.attempt_count + 1,
					last_error = EXCLUDED.last_error,
					vector_locator_sha256 = COALESCE(EXCLUDED.vector_locator_sha256, public.evidence_audio_window_ledger.vector_locator_sha256),
					updated_at = clock_timestamp()
			`);
		},
	};
}
