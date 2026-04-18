/**
 * POST /api/ingest/legal
 *
 * Kick off legal corpus ingestion for constitutions, statutes, and uploaded PDFs.
 * Wraps the existing constitution-pipeline and ingestion-worker pipelines.
 *
 * Actions:
 *   constitution   — fetch + ingest a state/federal constitution by stateCode
 *                    stateCode 'all' queues all 53 sources (background, fire-and-forget)
 *   document       — ingest an already-uploaded MinIO document by documentId
 *   status         — check ingestion job status for a documentId or jobId
 *
 * GET /api/ingest/legal?stateCode=ca  — check constitution ingestion status
 * GET /api/ingest/legal?type=corpus   — summary of all library_documents
 *
 * Auth: requires locals.user (admin role not enforced here — caller UI guards)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { pool } from '$lib/server/db/client';

// ── Schemas ────────────────────────────────────────────────────────────────

const constitutionSchema = z.object({
	action:    z.literal('constitution'),
	stateCode: z.string().min(2).max(4),   // 'ca', 'us', 'all'
	force:     z.boolean().default(false), // re-ingest even if already complete
});

const documentSchema = z.object({
	action:     z.literal('document'),
	documentId: z.string().uuid(),
});

const statusSchema = z.object({
	action:     z.literal('status'),
	documentId: z.string().uuid().optional(),
	jobId:      z.string().uuid().optional(),
});

const bodySchema = z.discriminatedUnion('action', [
	constitutionSchema,
	documentSchema,
	statusSchema,
]);

// ── GET — corpus summary or constitution status ────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const stateCode = url.searchParams.get('stateCode');

	// Single constitution status
	if (stateCode) {
		try {
			const r = await pool.query(
				`SELECT ld.id, ld.title, ld.processing_status, ld.updated_at,
				        ij.stage, ij.progress, ij.metrics_json, ij.error_text
				 FROM   library_documents ld
				 LEFT JOIN LATERAL (
				   SELECT stage, progress, metrics_json, error_text
				   FROM ingestion_jobs WHERE document_id = ld.id
				   ORDER BY created_at DESC LIMIT 1
				 ) ij ON true
				 WHERE  ld.corpus_type = 'constitution'
				   AND  EXISTS (
				     SELECT 1 FROM jurisdictions j
				     WHERE j.id = ld.jurisdiction_id
				       AND lower(j.code) = lower($1)
				   )
				 LIMIT 1`,
				[stateCode]
			);
			const row = r.rows[0] ?? null;
			return json({ stateCode, doc: row });
		} catch {
			return json({ stateCode, doc: null });
		}
	}

	// Full corpus summary
	try {
		const r = await pool.query(
			`SELECT corpus_type, processing_status, COUNT(*)::int AS cnt
			 FROM library_documents
			 GROUP BY corpus_type, processing_status
			 ORDER BY corpus_type, processing_status`
		);

		// Constitution coverage (how many of 53 are complete)
		const constComplete = r.rows
			.filter(row => row.corpus_type === 'constitution' && row.processing_status === 'complete')
			.reduce((sum: number, row: { cnt: number }) => sum + row.cnt, 0);

		return json({
			byCorpusType: r.rows,
			constitutionCoverage: { complete: constComplete, total: 53, pct: Math.round(constComplete / 53 * 100) },
		});
	} catch {
		return json({ byCorpusType: [], constitutionCoverage: { complete: 0, total: 53, pct: 0 } });
	}
};

// ── POST — ingest ──────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw    = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const body = parsed.data;

	// ── Constitution ingestion ────────────────────────────────────────────────
	if (body.action === 'constitution') {
		const { stateCode, force } = body;

		// Ingest all 53 sources (background — returns immediately)
		if (stateCode === 'all') {
			ingestAllConstitutions(force, locals.user.id as string).catch(() => {});
			return json({ queued: true, stateCode: 'all', message: 'All 53 constitutions queued in background' });
		}

		// Single state/federal constitution
		const result = await ingestOneConstitution(stateCode, force, locals.user.id as string);
		return json(result);
	}

	// ── Document re-ingestion ─────────────────────────────────────────────────
	if (body.action === 'document') {
		const { documentId } = body;
		try {
			const { runIngestionPipeline } = await import('$lib/server/legal/ingestion-worker.js');

			// Create a new job row
			const jobRes = await pool.query(
				`INSERT INTO ingestion_jobs (document_id, stage, progress)
				 VALUES ($1, 'queued', 0)
				 RETURNING id`,
				[documentId]
			);
			const jobId = jobRes.rows[0]?.id as string;
			if (!jobId) throw new Error('Failed to create ingestion job');

			// Run in background
			runIngestionPipeline({ documentId, jobId }).catch(() => {});
			return json({ queued: true, documentId, jobId });
		} catch (err) {
			return json({ error: String(err) }, { status: 500 });
		}
	}

	// ── Status check ──────────────────────────────────────────────────────────
	if (body.action === 'status') {
		const { documentId, jobId } = body;
		const whereClause = jobId
			? 'ij.id = $1'
			: 'ij.document_id = $1';
		const param = jobId ?? documentId;
		try {
			const r = await pool.query(
				`SELECT ij.id AS job_id, ij.stage, ij.progress, ij.metrics_json, ij.error_text,
				        ld.title, ld.corpus_type, ld.processing_status
				 FROM ingestion_jobs ij
				 JOIN library_documents ld ON ld.id = ij.document_id
				 WHERE ${whereClause}
				 ORDER BY ij.created_at DESC LIMIT 1`,
				[param]
			);
			return json({ job: r.rows[0] ?? null });
		} catch {
			return json({ job: null });
		}
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function ingestOneConstitution(
	stateCode: string,
	force:     boolean,
	userId:    string,
): Promise<Record<string, unknown>> {
	try {
		const { STATE_CONSTITUTION_SOURCES } = await import('$lib/server/legal/constitution-registry.js');
		const source = STATE_CONSTITUTION_SOURCES.find(
			s => s.stateCode.toLowerCase() === stateCode.toLowerCase()
		);
		if (!source) {
			return { error: `Unknown stateCode: ${stateCode}`, knownCodes: STATE_CONSTITUTION_SOURCES.map(s => s.stateCode) };
		}

		// Check if already complete and not force
		if (!force) {
			const existing = await pool.query(
				`SELECT ld.processing_status
				 FROM library_documents ld
				 JOIN jurisdictions j ON j.id = ld.jurisdiction_id
				 WHERE lower(j.code) = lower($1) AND ld.corpus_type = 'constitution'
				 LIMIT 1`,
				[stateCode]
			).catch(() => ({ rows: [] as Array<{ processing_status: string }> }));

			const status = existing.rows[0]?.processing_status;
			if (status === 'complete') {
				return { skipped: true, stateCode, reason: 'already complete — pass force:true to re-ingest' };
			}
		}

		const { runConstitutionPipeline } = await import('$lib/server/legal/constitution-pipeline.js');
		// Run in background — return immediately
		runConstitutionPipeline(source, userId).catch(() => {});
		return { queued: true, stateCode, stateName: source.stateName };
	} catch (err) {
		return { error: String(err) };
	}
}

async function ingestAllConstitutions(force: boolean, userId: string): Promise<void> {
	const { STATE_CONSTITUTION_SOURCES } = await import('$lib/server/legal/constitution-registry.js');
	const { runConstitutionPipeline } = await import('$lib/server/legal/constitution-pipeline.js');

	// Sequential with 3s delay between each to avoid overwhelming Ollama/MinIO
	for (const source of STATE_CONSTITUTION_SOURCES) {
		try {
			if (!force) {
				const existing = await pool.query(
					`SELECT processing_status FROM library_documents ld
					 JOIN jurisdictions j ON j.id = ld.jurisdiction_id
					 WHERE lower(j.code) = lower($1) AND ld.corpus_type = 'constitution'
					 LIMIT 1`,
					[source.stateCode]
				).catch(() => ({ rows: [] as Array<{ processing_status: string }> }));

				if (existing.rows[0]?.processing_status === 'complete') continue;
			}
			await runConstitutionPipeline(source, userId);
		} catch { /* non-fatal — continue with next */ }
		// Small delay between constitutions
		await new Promise(r => setTimeout(r, 3000));
	}
}
