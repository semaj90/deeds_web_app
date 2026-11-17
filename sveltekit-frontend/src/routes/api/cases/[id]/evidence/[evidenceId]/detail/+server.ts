import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { db, pgRows } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FRAMES = 50;
const MAX_TEXT = 4000;

type EvidenceRow = Record<string, unknown>;

/**
 * Read-only detail view for one evidence item: provenance, job states, derived analysis
 * (YOLO labels, VLM description, LLM entities, video frame detections). Every value here is
 * derived and unreviewed; nothing is written.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const actorId = Number(locals.user.id);
	const caseId = params.id;
	const evidenceId = params.evidenceId;
	if (!UUID_RE.test(caseId) || !UUID_RE.test(evidenceId)) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	// Case authorization first. A non-owner gets the same 404 as a missing item.
	const authorized = await getAuthorizedCase(caseId, actorId);
	if (!authorized) return json({ error: 'Not found' }, { status: 404 });

	const evidenceRows = pgRows<EvidenceRow>(
		await db.execute(sql`
			select id, file_name, file_type, mime_type, evidence_type, file_size, hash,
			       uploaded_at, created_at, updated_at, status, ai_tags, ai_summary, ai_analysis,
			       left(coalesce(extracted_text, ''), ${MAX_TEXT}) as extracted_text,
			       length(coalesce(extracted_text, '')) as text_length
			from evidence
			where id = ${evidenceId}::uuid and case_id = ${caseId}::uuid and deleted_at is null
			limit 1
		`)
	);
	const ev = evidenceRows[0];
	if (!ev) return json({ error: 'Not found' }, { status: 404 });

	const jobs = pgRows<EvidenceRow>(
		await db.execute(sql`
			select id, job_type, status, progress, created_at, updated_at
			from analysis_jobs
			where evidence_id = ${evidenceId}::uuid
			order by created_at desc
			limit 5
		`)
	);

	const vectors = pgRows<EvidenceRow>(
		await db.execute(sql`
			select modality, source_revision, analysis_revision, model, output_sha256, created_at,
			       metadata->>'analysisStatus' as analysis_status,
			       metadata->'visualAnalysis'->>'visionSummary' as vision_summary,
			       metadata->'visualAnalysis'->'objectDetections' as object_detections,
			       metadata->'visualAnalysis'->'stageErrors' as stage_errors,
			       metadata->'entities' as entities,
			       metadata->'forensics' as forensics,
			       left(metadata->>'content', ${MAX_TEXT}) as chunk_excerpt,
			       metadata->>'chunkIndex' as chunk_index
			from evidence_multimodal_vectors
			where evidence_id = ${evidenceId}::uuid
			order by created_at asc
			limit 20
		`)
	);

	const aiAnalysis = (ev.ai_analysis ?? {}) as Record<string, unknown>;
	const videoAnalysis = (aiAnalysis.videoAnalysis ?? null) as Record<string, unknown> | null;
	const rawFrames = Array.isArray(videoAnalysis?.frames) ? (videoAnalysis?.frames as unknown[]) : [];
	const frames = rawFrames.slice(0, MAX_FRAMES).map((frame, index) => {
		const f = (frame ?? {}) as { timestampMs?: number; width?: number; height?: number; modelRevision?: string; objects?: Array<{ label?: string; confidence?: number; bbox?: unknown }> };
		const width = Number.isSafeInteger(f.width) && Number(f.width) > 0 ? Number(f.width) : null;
		const height = Number.isSafeInteger(f.height) && Number(f.height) > 0 ? Number(f.height) : null;
		return {
			index,
			timestampMs: typeof f.timestampMs === 'number' ? f.timestampMs : null,
			width,
			height,
			modelRevision: typeof f.modelRevision === 'string' ? f.modelRevision : null,
			objects: (f.objects ?? []).slice(0, 20).flatMap((o) => {
				const bbox = Array.isArray(o.bbox) && o.bbox.length === 4 && o.bbox.every(Number.isFinite)
					? o.bbox.map(Number)
					: null;
				if (bbox && (!width || !height || bbox[0] < 0 || bbox[1] < 0 || bbox[2] <= bbox[0] || bbox[3] <= bbox[1] || bbox[2] > width || bbox[3] > height)) return [];
				return [{
					label: typeof o.label === 'string' ? o.label : 'unknown',
					confidence: typeof o.confidence === 'number' ? o.confidence : null,
					bbox,
				}];
			}),
		};
	});

	const hash = typeof ev.hash === 'string' ? ev.hash : null;
	return json({
		evidence: {
			id: ev.id,
			fileName: ev.file_name ?? null,
			fileType: ev.file_type ?? null,
			evidenceType: ev.evidence_type ?? null,
			fileSize: ev.file_size ?? null,
			status: ev.status ?? null,
			uploadedAt: ev.uploaded_at ?? null,
			createdAt: ev.created_at ?? null,
			updatedAt: ev.updated_at ?? null,
			tags: Array.isArray(ev.ai_tags) ? ev.ai_tags : [],
			summary: ev.ai_summary ?? null,
			text: ev.extracted_text ?? '',
			textLength: Number(ev.text_length ?? 0),
		},
		provenance: {
			sha256: hash,
			sourceRevision: hash && hash.startsWith('sha256:') ? hash : hash ? `sha256:${hash}` : null,
			note: 'Derived outputs are unreviewed proposals. Source bytes are identified by sha256.',
		},
		jobs: jobs.map((j) => ({
			id: j.id,
			jobType: j.job_type,
			status: j.status,
			progress: j.progress,
			createdAt: j.created_at,
			updatedAt: j.updated_at,
		})),
		vectors: vectors.map((v) => ({
			modality: v.modality,
			sourceRevision: v.source_revision,
			analysisRevision: v.analysis_revision,
			model: v.model,
			outputSha256: v.output_sha256,
			analysisStatus: v.analysis_status ?? null,
			visionSummary: v.vision_summary ?? null,
			objectDetections: Array.isArray(v.object_detections) ? v.object_detections.slice(0, 50) : [],
			stageErrors: Array.isArray(v.stage_errors) ? v.stage_errors : [],
			entities: Array.isArray(v.entities) ? v.entities.slice(0, 100) : [],
			forensicFlags: Array.isArray((v.forensics as { flags?: unknown })?.flags)
				? ((v.forensics as { flags: unknown[] }).flags).slice(0, 50)
				: [],
			chunkIndex: v.chunk_index ?? null,
			chunkExcerpt: v.chunk_excerpt ?? null,
		})),
		video: videoAnalysis
			? {
					status: videoAnalysis.status ?? null,
					substages: videoAnalysis.substages ?? null,
					sourceRevision: videoAnalysis.sourceRevision ?? null,
					analysisRevision: videoAnalysis.analysisRevision ?? null,
					frameCount: rawFrames.length,
					frames,
				}
			: null,
	});
};
