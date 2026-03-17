/**
 * GET /api/library/ingest/[jobId]
 * SSE stream of ingestion progress. Clients poll every ~2s.
 * Emits: { stage, progress, status, metrics }
 * Closes when status = 'complete' or 'failed'.
 */
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';

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
	if (!locals.user?.id) return new Response('Unauthorized', { status: 401 });

	const { jobId } = params;
	if (!jobId) return new Response('Missing jobId', { status: 400 });

	const encoder = new TextEncoder();
	let closed = false;

	const stream = new ReadableStream({
		async start(controller) {
			const send = (data: object) => {
				if (closed) return;
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			const poll = async () => {
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
						send({ error: 'Job not found' });
						controller.close();
						closed = true;
						return;
					}

					send({
						stage:      row.stage,
						stageLabel: stageLabel(row.stage),
						status:     row.status,
						progress:   Number(row.progress),
						errorText:  row.error_text ?? null,
						metrics:    row.metrics_json ?? {},
						document: {
							id:        row.document_id,
							title:     row.title,
							corpusType: row.corpus_type,
							pageCount: row.page_count,
						},
						stageIndex:  STAGES.indexOf(row.stage),
						totalStages: STAGES.length,
					});

					if (row.status === 'complete' || row.status === 'failed') {
						controller.close();
						closed = true;
						return;
					}

					// Poll again after 1.5s
					if (!closed) setTimeout(poll, 1500);
				} catch {
					send({ error: 'Poll error' });
					controller.close();
					closed = true;
				}
			};

			await poll();
		},
		cancel() {
			closed = true;
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type':  'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection:      'keep-alive',
		},
	});
};
