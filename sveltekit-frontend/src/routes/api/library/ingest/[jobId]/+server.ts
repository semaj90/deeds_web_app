/**
 * GET /api/library/ingest/[jobId]
 * Returns current ingestion job status as plain JSON.
 * Clients poll this endpoint every ~2.5s; no SSE needed since polling is client-driven.
 *
 * Response: { stage, stageLabel, status, progress, errorText, metrics, document, stageIndex, totalStages }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { isUuid } from '$lib/server/validation.js';

const STAGES = ['queued', 'extracting', 'ocr', 'structuring', 'chunking', 'embedding', 'graphing', 'complete'];

function stageLabel(stage: string): string {
	const labels: Record<string, string> = {
		queued:      'Queued',
		extracting:  'Extracting text…',
		ocr:         'Running OCR…',
		structuring: 'Detecting legal structure…',
		chunking:    'Chunking sections…',
		embedding:   'Generating embeddings…',
		graphing:    'Building citation graph…',
		complete:    'Complete',
		failed:      'Failed',
	};
	return labels[stage] ?? stage;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { jobId } = params;
	if (!isUuid(jobId)) {
		return json({ error: 'Invalid ID format' }, { status: 400 });
	}

	try {
		const res = await pool.query(
			`SELECT ij.stage, ij.status, ij.progress, ij.error_text, ij.metrics_json,
			        ld.title, ld.corpus_type, ld.page_count, ld.id AS document_id
			 FROM ingestion_jobs ij
			 JOIN library_documents ld ON ld.id = ij.document_id
			 WHERE ij.id = $1`,
			[jobId]
		);

		const row = res.rows[0];
		if (!row) {
			return json({ error: 'Job not found' }, { status: 404 });
		}

		return json({
			stage:      row.stage,
			stageLabel: stageLabel(row.stage),
			status:     row.status,
			progress:   Number(row.progress),
			errorText:  row.error_text ?? null,
			metrics:    row.metrics_json ?? {},
			document: {
				id:         row.document_id,
				title:      row.title,
				corpusType: row.corpus_type,
				pageCount:  row.page_count,
			},
			stageIndex:  STAGES.indexOf(row.stage),
			totalStages: STAGES.length,
		});
	} catch (err) {
		console.error('[ingest/status] query failed:', err);
		return json({ error: 'Status query failed' }, { status: 500 });
	}
};