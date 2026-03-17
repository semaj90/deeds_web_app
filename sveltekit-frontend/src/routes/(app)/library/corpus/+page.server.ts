import type { PageServerLoad } from './$types';
import { pool } from '$lib/server/db/client';
import { STATE_CONSTITUTION_SOURCES } from '$lib/server/legal/constitution-registry';

export const load: PageServerLoad = async () => {
	try {
		const res = await pool.query(`
			SELECT
				s.state_code, s.state_name, s.is_official, s.source_confidence,
				s.last_fetched_at, s.last_fetch_status, s.notes, s.document_id,
				ld.processing_status, ld.word_count,
				ij.progress, ij.stage, ij.error_text,
				(SELECT COUNT(*)::int FROM legal_nodes ln WHERE ln.document_id = ld.id) AS node_count,
				(SELECT COUNT(*)::int FROM legal_chunks lc2
				   JOIN legal_nodes ln2 ON ln2.id = lc2.legal_node_id
				   WHERE ln2.document_id = ld.id) AS chunk_count
			FROM state_constitution_sources s
			LEFT JOIN library_documents ld ON ld.id = s.document_id
			LEFT JOIN LATERAL (
				SELECT progress, stage, error_text FROM ingestion_jobs
				WHERE document_id = ld.id ORDER BY created_at DESC LIMIT 1
			) ij ON true
			ORDER BY s.state_name
		`);

		const dbMap = new Map(res.rows.map((r: Record<string, unknown>) => [r.state_code, r]));

		const sources = STATE_CONSTITUTION_SOURCES.map((src) => {
			const db = dbMap.get(src.stateCode) as Record<string, unknown> | undefined;
			return {
				stateCode: src.stateCode,
				stateName: src.stateName,
				discoveryUrl: src.discoveryUrl,
				sourceUrl: src.sourceUrl,
				format: src.format,
				isOfficial: src.isOfficial,
				sourceConfidence: src.sourceConfidence as string,
				notes: src.notes ?? null,
				documentId: (db?.document_id as string) ?? null,
				processingStatus: (db?.processing_status as string) ?? 'not_started',
				lastFetchedAt: (db?.last_fetched_at as string) ?? null,
				lastFetchStatus: (db?.last_fetch_status as string) ?? null,
				progress: (db?.progress as number) ?? 0,
				stage: (db?.stage as string) ?? null,
				errorText: (db?.error_text as string) ?? null,
				wordCount: (db?.word_count as number) ?? null,
				nodeCount: (db?.node_count as number) ?? 0,
				chunkCount: (db?.chunk_count as number) ?? 0,
			};
		});

		const stats = {
			total: sources.length,
			complete: sources.filter((s) => s.processingStatus === 'complete').length,
			inProgress: sources.filter((s) => !['complete', 'failed', 'not_started'].includes(s.processingStatus) && s.processingStatus !== null).length,
			failed: sources.filter((s) => s.processingStatus === 'failed').length,
			notStarted: sources.filter((s) => s.processingStatus === 'not_started').length,
		};

		return { sources, stats, loadError: null };
	} catch {
		return { sources: [], stats: { total: 51, complete: 0, inProgress: 0, failed: 0, notStarted: 51 }, loadError: 'DB unavailable' };
	}
};
