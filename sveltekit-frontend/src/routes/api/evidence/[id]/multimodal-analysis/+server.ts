import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parseWholeImageAnalysisRowV1, readLatestWholeImageAnalysisRowV1, readStorybookImageReviewsV1 } from '$lib/server/evidence/whole-image-analysis-readback-v1.js';
import type { StorybookRelativeDepthV1 } from '$lib/shared/storybook-image-chapter-v1.js';
import type { StorybookImageObservationsV1 } from '$lib/shared/storybook-image-observations-v1.js';

const storedImageDerivativeSchema = z.object({
	kind: z.literal('thumbnail'),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	objectKey: z.string().min(1).max(1024),
	bucket: z.string().min(1).max(63),
	mimeType: z.literal('image/jpeg'),
	outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
	width: z.number().int().min(1).max(256),
	height: z.number().int().min(1).max(256),
	preprocessingRevision: z.string().min(1).max(200),
}).strict();

type ResponseShape = {
	relativeDepth?: StorybookRelativeDepthV1;
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
	derivatives: { thumbnail: z.infer<typeof storedImageDerivativeSchema> } | null;
	storybook?: StorybookImageObservationsV1;
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
		derivatives: null,
		error: null,
		...fields,
	};
	return json(body, { status: httpStatus, headers: { 'Cache-Control': 'private, no-store' } });
}

function sha256Revision(value: unknown): string | null {
	const normalized = String(value ?? '').replace(/^sha256:/i, '').toLowerCase();
	return /^[a-f0-9]{64}$/.test(normalized) ? `sha256:${normalized}` : null;
}

const maskRequestSchema = z.object({
	maskObservation: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	analysisRevision: z.string().min(1).max(512),
	observationRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const evidenceId = params.id;
	if (!locals.user?.id) return response('ERROR', evidenceId, { error: 'UNAUTHORIZED' }, 401);
	if (!isUuid(evidenceId)) return response('ERROR', evidenceId, { error: 'INVALID_EVIDENCE_ID' }, 400);
	const query = url?.searchParams;
	const maskRequest = query?.has('maskObservation') ? maskRequestSchema.safeParse({
		maskObservation: query.get('maskObservation'), sourceRevision: query.get('sourceRevision'),
		analysisRevision: query.get('analysisRevision'), observationRevision: query.get('observationRevision'),
	}) : null;
	if (maskRequest && !maskRequest.success) return response('ERROR', evidenceId, { error: 'MASK_OBSERVATION_LOCATOR_INVALID' }, 400);

	try {
		const userId = Number(locals.user.id);
		if (!Number.isSafeInteger(userId) || userId <= 0) return response('ERROR', evidenceId, { error: 'UNAUTHORIZED' }, 401);
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
		if (maskRequest?.success && maskRequest.data.sourceRevision !== sourceRevision) {
			return response('STALE', evidenceId, { error: 'MASK_SOURCE_REVISION_CHANGED' }, 409);
		}

		let row: Awaited<ReturnType<typeof readLatestWholeImageAnalysisRowV1>>;
		try {
			row = await readLatestWholeImageAnalysisRowV1(evidenceId, db);
		} catch {
			return response('STORE_UNAVAILABLE', evidenceId, {
				caseId: source.caseId ?? null,
				sourceRevision,
				error: 'CANONICAL_IMAGE_ANALYSIS_STORE_UNAVAILABLE',
			}, 503);
		}

		if (!row) return response('NOT_ANALYZED', evidenceId, { caseId: source.caseId ?? null, sourceRevision }, maskRequest ? 404 : 200);
		const storedRevision = sha256Revision(row.source_revision);
		if (storedRevision !== sourceRevision) {
			return response('STALE', evidenceId, {
				caseId: source.caseId ?? null,
				sourceRevision,
				analysisRevision: String(row.analysis_revision ?? '') || null,
				model: String(row.model ?? '') || null,
				error: 'ANALYSIS_SOURCE_REVISION_STALE',
			}, maskRequest ? 409 : 200);
		}

		const parsed = parseWholeImageAnalysisRowV1(row, evidenceId, sourceRevision);
		if (!parsed) return response('ERROR', evidenceId, { caseId: source.caseId ?? null, sourceRevision,
			analysisRevision: String(row.analysis_revision ?? '') || null, error: 'CANONICAL_IMAGE_ANALYSIS_RECORD_INVALID' }, 500);
		const { metadata, imageDerivatives, analysis, width, height, analysisRevision, storybook } = parsed;
		if (maskRequest?.success) {
			const requested = maskRequest.data;
			if (!storybook || requested.analysisRevision !== analysisRevision || requested.observationRevision !== storybook.manifest.observationRevision) {
				return response('STALE', evidenceId, { error: 'MASK_OBSERVATION_REVISION_CHANGED' }, 409);
			}
			const mask = storybook.manifest.masks.find((item) => item.observationId === requested.maskObservation);
			const objectKey = storybook.maskKeys.get(requested.maskObservation);
			if (!mask || !objectKey) return response('ERROR', evidenceId, { error: 'MASK_OBSERVATION_NOT_FOUND' }, 404);
			const [{ getFileFromSeaweed }, { assertArtifactBucket, storageBuckets }, { default: sharp }] = await Promise.all([
				import('$lib/server/storage/seaweed.js'), import('$lib/server/storage/storage-buckets.js'), import('sharp'),
			]);
			const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET ?? storageBuckets.artifacts;
			assertArtifactBucket(bucket);
			const bytes = await getFileFromSeaweed({ bucket, objectKey, maximumBytes: 12 * 1024 * 1024 });
			if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== mask.artifactSha256) {
				return response('ERROR', evidenceId, { error: 'MASK_ARTIFACT_CHECKSUM_MISMATCH' }, 409);
			}
			const image = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			const dimensions = await sharp(image, { limitInputPixels: 40_000_000, failOn: 'error' }).metadata().catch(() => null);
			if (dimensions?.format !== 'png' || dimensions.width !== width || dimensions.height !== height) {
				return response('ERROR', evidenceId, { error: 'MASK_ARTIFACT_DIMENSIONS_MISMATCH' }, 409);
			}
			const body = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(body).set(bytes);
			return new Response(body, { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff',
				'Cache-Control': 'private, no-store', 'X-Source-Revision': sourceRevision,
				'X-Analysis-Revision': analysisRevision, 'X-Observation-Revision': storybook.manifest.observationRevision,
				'X-Artifact-Sha256': mask.artifactSha256 } });
		}
		const rawThumbnail = storedImageDerivativeSchema.safeParse(imageDerivatives?.thumbnail);
		let derivatives: ResponseShape['derivatives'] = null;
		if (rawThumbnail.success) {
			const thumbnail = rawThumbnail.data;
			const sourceHash = sourceRevision.slice('sha256:'.length);
			const expectedKey = `evidence/${source.caseId ?? 'default'}/${evidenceId}/${sourceHash}/thumbnail-${thumbnail.outputSha256}.jpg`;
			if (thumbnail.sourceRevision === sourceRevision && thumbnail.bucket === ENV.SEAWEED_ARTIFACTS_BUCKET && thumbnail.objectKey === expectedKey) {
				derivatives = { thumbnail };
			}
		}

		const reviews = storybook && source.caseId ? await readStorybookImageReviewsV1(db, source.caseId, storybook.manifest) : undefined;
		return response('CURRENT', evidenceId, {
			caseId: source.caseId ?? null,
			sourceRevision,
			sourceDimensions: { width, height },
			analysisRevision: String(row.analysis_revision ?? '') || null,
			model: String(row.model ?? '') || null,
			modelArtifactSha256: String(row.model_artifact_sha256 ?? '') || null,
			preprocessingRevision: String(row.preprocessing_revision ?? '') || null,
			reviewState: String(metadata?.modelOutputReviewState ?? 'UNREVIEWED_PROPOSAL'),
			analysis,
			derivatives,
			...(parsed.relativeDepth ? { relativeDepth: parsed.relativeDepth } : {}),
			...(storybook ? { storybook: reviews ? { ...storybook.manifest, reviews } : storybook.manifest } : {}),
		});
	} catch {
		return response('ERROR', evidenceId, { error: 'IMAGE_ANALYSIS_READ_FAILED' }, 500);
	}
};
