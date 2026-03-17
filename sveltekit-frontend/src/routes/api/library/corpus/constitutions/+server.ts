/**
 * GET  /api/library/corpus/constitutions
 *   Returns all 51 entries from state_constitution_sources with ingestion status
 *
 * POST /api/library/corpus/constitutions
 *   Triggers ingestion for one or all states
 *   Body: { stateCode?: string; all?: boolean }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { STATE_CONSTITUTION_SOURCES, getSource } from '$lib/server/legal/constitution-registry';

function buildFallbackSources() {
	const sources = STATE_CONSTITUTION_SOURCES.map((src) => ({
		stateCode: src.stateCode,
		stateName: src.stateName,
		discoveryUrl: src.discoveryUrl,
		sourceUrl: src.sourceUrl,
		format: src.format,
		isOfficial: src.isOfficial,
		sourceConfidence: src.sourceConfidence,
		notes: src.notes ?? null,
		documentId: null,
		processingStatus: 'not_started',
		lastFetchedAt: null,
		lastFetchStatus: null,
		progress: 0,
		stage: null,
		wordCount: null,
		nodeCount: 0,
		chunkCount: 0,
	}));

	return {
		sources,
		stats: {
			total: sources.length,
			ingested: 0,
			inProgress: 0,
			failed: 0,
			notStarted: sources.length,
		},
	};
}

export const GET: RequestHandler = async () => {
	try {
		// Join registry rows with ingestion status
		const res = await pool.query(`
			SELECT
				s.state_code, s.state_name, s.discovery_url, s.source_url,
				s.format, s.is_official, s.source_confidence,
				s.last_fetched_at, s.last_hash, s.last_fetch_status,
				s.notes, s.document_id,
				ld.processing_status, ld.word_count, ld.title AS doc_title,
				ij.progress, ij.stage,
				(SELECT COUNT(*)::int FROM legal_nodes ln WHERE ln.document_id = ld.id) AS node_count,
				(SELECT COUNT(*)::int FROM legal_chunks lc2
				   JOIN legal_nodes ln2 ON ln2.id = lc2.legal_node_id
				   WHERE ln2.document_id = ld.id) AS chunk_count
			FROM state_constitution_sources s
			LEFT JOIN library_documents ld ON ld.id = s.document_id
			LEFT JOIN LATERAL (
				SELECT progress, stage FROM ingestion_jobs
				WHERE document_id = ld.id
				ORDER BY created_at DESC LIMIT 1
			) ij ON true
			ORDER BY s.state_name
		`);

		// Merge with static registry entries (for any states not yet in DB)
		const dbMap = new Map(res.rows.map((r) => [r.state_code, r]));
		const merged = STATE_CONSTITUTION_SOURCES.map((src) => {
			const db = dbMap.get(src.stateCode);
			return {
				stateCode: src.stateCode,
				stateName: src.stateName,
				discoveryUrl: src.discoveryUrl,
				sourceUrl: src.sourceUrl,
				format: src.format,
				isOfficial: src.isOfficial,
				sourceConfidence: src.sourceConfidence,
				notes: src.notes ?? db?.notes ?? null,
				// DB fields
				documentId: db?.document_id ?? null,
				processingStatus: db?.processing_status ?? 'not_started',
				lastFetchedAt: db?.last_fetched_at ?? null,
				lastFetchStatus: db?.last_fetch_status ?? null,
				progress: db?.progress ?? 0,
				stage: db?.stage ?? null,
				wordCount: db?.word_count ?? null,
				nodeCount: db?.node_count ?? 0,
				chunkCount: db?.chunk_count ?? 0,
			};
		});

		const stats = {
			total: merged.length,
			ingested: merged.filter((s) => s.processingStatus === 'complete').length,
			inProgress: merged.filter((s) => s.processingStatus && !['complete', 'failed', 'not_started'].includes(s.processingStatus)).length,
			failed: merged.filter((s) => s.processingStatus === 'failed').length,
			notStarted: merged.filter((s) => s.processingStatus === 'not_started').length,
		};

		return json({ sources: merged, stats });
	} catch (err) {
		console.warn('[api/corpus/constitutions] GET fallback:', err);
		return json(buildFallbackSources());
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { stateCode, all = false } = body as { stateCode?: string; all?: boolean };

		if (!stateCode && !all) {
			return json({ error: 'Provide stateCode or all=true' }, { status: 400 });
		}

		const targets = all
			? STATE_CONSTITUTION_SOURCES
			: stateCode
				? [getSource(stateCode)].filter(Boolean) as typeof STATE_CONSTITUTION_SOURCES
				: [];

		if (targets.length === 0) {
			return json({ error: `Unknown state code: ${stateCode}` }, { status: 400 });
		}

		// Fire-and-forget — the pipeline runs in background
		// We return job IDs immediately; client polls SSE for progress
		const { runConstitutionPipeline } = await import('$lib/server/legal/constitution-pipeline');

		const started: Array<{ stateCode: string; stateName: string }> = [];

		if (all) {
			// Run sequentially in background (1 state at a time to be polite)
			(async () => {
				for (const src of targets) {
					try {
						await runConstitutionPipeline(src, 'system-bulk');
					} catch {
						// Continue to next state on failure
					}
				}
			})();
			started.push(...targets.map((t) => ({ stateCode: t.stateCode, stateName: t.stateName })));
		} else {
			// Single state — run in background
			const src = targets[0];
			runConstitutionPipeline(src, 'system').catch((err) =>
				console.error(`[corpus] Pipeline failed for ${src.stateCode}:`, err)
			);
			started.push({ stateCode: src.stateCode, stateName: src.stateName });
		}

		return json({ started, count: started.length }, { status: 202 });
	} catch (err) {
		console.error('[api/corpus/constitutions] POST error:', err);
		return json({ error: 'Failed to start ingestion' }, { status: 500 });
	}
};
