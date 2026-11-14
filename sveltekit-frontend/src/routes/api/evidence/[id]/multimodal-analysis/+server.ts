import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';

const storedVisualAnalysisSchema = z.object({
	schema: z.literal('atlas.evidence-visual-analysis.v1'),
	authority: z.literal('OBSERVATION_ONLY'),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	status: z.enum(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']),
	objectDetections: z.array(z.object({
		class: z.string().min(1).max(100),
		confidence: z.number().finite().min(0).max(1),
		bbox: z.array(z.number().finite()).length(4),
	})).max(500),
	layoutRegions: z.array(z.object({
		type: z.string().min(1).max(100),
		confidence: z.number().finite().min(0).max(1),
		bbox: z.array(z.number().finite()).length(4),
	})).max(500),
	visionSummary: z.string().max(5000).nullable(),
	visionFindings: z.array(z.string().max(2000)).max(100),
	visionTags: z.array(z.string().max(100)).max(100),
	depthMap: z.object({
		objectKey: z.string().min(1).max(1024),
		width: z.number().int().min(1).max(8192),
		height: z.number().int().min(1).max(8192),
		processingTimeMs: z.number().finite().nonnegative().nullable(),
	}).nullable(),
	stageErrors: z.array(z.string().max(300)).max(30),
}).strict();

type ResponseShape = {
	success: boolean;
	status: 'CURRENT' | 'NOT_ANALYZED' | 'STALE' | 'STORE_UNAVAILABLE' | 'ERROR';
	evidenceId: string;
	caseId: string | null;
	sourceRevision: string | null;
	sourceDimensions: { width: number; height: number } | null;
	analysisRevision: string | null;
	model: string | null;
	modelArtifactSha256: string | null;
	preprocessingRevision: string | null;
	reviewState: string | null;
	analysis: Record<string, unknown> | null;
	error: string | null;
};

function response(status: ResponseShape['status'], evidenceId: string, fields: Partial<ResponseShape> = {}, httpStatus = 200) {
	const body: ResponseShape = {
		success: status === 'CURRENT' || status === 'NOT_ANALYZED' || status === 'STALE',
		status,
		evidenceId,
		caseId: null,
		sourceRevision: null,
		sourceDimensions: null,
		analysisRevision: null,
		model: null,
		modelArtifactSha256: null,
		preprocessingRevision: null,
		reviewState: null,
		analysis: null,
		error: null,
		...fields,
	};
	return json(body, { status: httpStatus, headers: { 'Cache-Control': 'private, no-store' } });
}

function sha256Revision(value: unknown): string | null {
	const normalized = String(value ?? '').replace(/^sha256:/i, '').toLowerCase();
	return /^[a-f0-9]{64}$/.test(normalized) ? `sha256:${normalized}` : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const evidenceId = params.id;
	if (!locals.user?.id) return response('ERROR', evidenceId, { error: 'UNAUTHORIZED' }, 401);
	if (!isUuid(evidenceId)) return response('ERROR', evidenceId, { error: 'INVALID_EVIDENCE_ID' }, 400);

	try {
		const userId = Number(locals.user.id);
		const [source] = await db
			.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash, deletedAt: evidence.deletedAt })
			.from(evidence)
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(and(
				eq(evidence.id, evidenceId),
					isNull(evidence.deletedAt),
				or(
					eq(evidence.userId, userId),
					eq(evidence.uploadedBy, userId),
					and(isNotNull(evidence.caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))),
				),
			))
			.limit(1);

		// Keep the not-found response identical for absent and unauthorized evidence.
		if (!source) return response('ERROR', evidenceId, { error: 'EVIDENCE_NOT_FOUND' }, 404);
		const sourceRevision = sha256Revision(source.hash);
		if (!sourceRevision) return response('ERROR', evidenceId, { error: 'SOURCE_REVISION_INVALID' }, 409);

		let rows: Array<Record<string, unknown>>;
		try {
			const result = await db.execute(sql`
				SELECT source_revision, analysis_revision, model, model_artifact_sha256,
			       preprocessing_revision, source_locator, metadata
				FROM public.evidence_multimodal_vectors
				WHERE evidence_id = ${evidenceId}::uuid AND modality = 'image'
				ORDER BY created_at DESC, id DESC
				LIMIT 1
			`);
			rows = result.rows as Array<Record<string, unknown>>;
		} catch {
			return response('STORE_UNAVAILABLE', evidenceId, {
				caseId: source.caseId ?? null,
				sourceRevision,
				error: 'CANONICAL_IMAGE_ANALYSIS_STORE_UNAVAILABLE',
			}, 503);
		}

		const row = rows[0];
		if (!row) return response('NOT_ANALYZED', evidenceId, { caseId: source.caseId ?? null, sourceRevision });
		const storedRevision = sha256Revision(row.source_revision);
		if (storedRevision !== sourceRevision) {
			return response('STALE', evidenceId, {
				caseId: source.caseId ?? null,
				sourceRevision,
				analysisRevision: String(row.analysis_revision ?? '') || null,
				model: String(row.model ?? '') || null,
				error: 'ANALYSIS_SOURCE_REVISION_STALE',
			});
		}

		const metadata = objectRecord(row.metadata);
		const locator = objectRecord(row.source_locator);
		const analysis = storedVisualAnalysisSchema.safeParse(metadata?.visualAnalysis);
		const width = locator?.kind === 'whole_image' && locator.coordinateSpace === 'original_pixels' ? Number(locator.width) : NaN;
		const height = locator?.kind === 'whole_image' && locator.coordinateSpace === 'original_pixels' ? Number(locator.height) : NaN;
		const detectionsInBounds = analysis.success && Number.isSafeInteger(width) && Number.isSafeInteger(height)
			&& width > 0 && height > 0
			&& analysis.data.objectDetections.every(({ bbox }) => bbox[0] >= 0 && bbox[1] >= 0 && bbox[2] <= width && bbox[3] <= height && bbox[2] > bbox[0] && bbox[3] > bbox[1]);
		if (!analysis.success || analysis.data.sourceRevision !== sourceRevision || !detectionsInBounds) {
			return response('ERROR', evidenceId, {
				caseId: source.caseId ?? null,
				sourceRevision,
				analysisRevision: String(row.analysis_revision ?? '') || null,
				error: 'CANONICAL_IMAGE_ANALYSIS_RECORD_INVALID',
			}, 500);
		}

		return response('CURRENT', evidenceId, {
			caseId: source.caseId ?? null,
			sourceRevision,
			sourceDimensions: { width, height },
			analysisRevision: String(row.analysis_revision ?? '') || null,
			model: String(row.model ?? '') || null,
			modelArtifactSha256: String(row.model_artifact_sha256 ?? '') || null,
			preprocessingRevision: String(row.preprocessing_revision ?? '') || null,
			reviewState: String(metadata?.modelOutputReviewState ?? 'UNREVIEWED_PROPOSAL'),
			analysis: analysis.data,
		});
	} catch {
		return response('ERROR', evidenceId, { error: 'IMAGE_ANALYSIS_READ_FAILED' }, 500);
	}
};
