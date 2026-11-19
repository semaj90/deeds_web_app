import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '$lib/server/db/client.js';
import { Sam2SegmentationMaskSchemaV1 } from './evidence-image-analysis-contract-v1.js';
import { buildStorybookImageObservationReadModelV1 } from './storybook-image-observation-read-model-v1.js';
import { formatEvidenceSourceRevisionV1 } from '../evidence-source-revision-v1.js';
import { imageOcrStageV1Schema, storybookImageDecisionV1Schema, type StorybookImageObservationsV1 } from '$lib/shared/storybook-image-observations-v1.js';
import { reviewableImageObservationsV1, storybookRegionReviewV1Schema } from '$lib/shared/storybook-region-review-v1.js';
import { storybookRelativeDepthV1Schema } from '$lib/shared/storybook-image-chapter-v1.js';

const storedVisualAnalysisSchema = z.object({
	schema: z.literal('atlas.evidence-visual-analysis.v1'),
	authority: z.literal('OBSERVATION_ONLY'),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	status: z.enum(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']),
	detectionExecuted: z.boolean().optional(),
	silhouetteStageStatus: z.enum(['NOT_RUN', 'EXECUTED', 'FAILED', 'MODEL_UNAVAILABLE_SKIPPED']).optional(),
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
	visionModelId: z.string().min(1).max(256).optional(),
	visionFindings: z.array(z.string().max(2000)).max(100),
	visionTags: z.array(z.string().max(100)).max(100),
	depthMap: z.object({
		objectKey: z.string().min(1).max(1024),
		bucket: z.string().min(1).max(63).optional(),
		artifactSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
		status: z.literal('ESTIMATED').optional(),
		width: z.number().int().min(1).max(8192),
		height: z.number().int().min(1).max(8192),
		processingTimeMs: z.number().finite().nonnegative().nullable(),
		depthType: z.literal('relative_monocular').optional(),
		modelId: z.string().max(256).nullable().optional(),
		modelRevision: z.string().max(256).nullable().optional(),
		modelRevisionStatus: z.enum(['VERIFIED', 'UNVERIFIED']).optional(),
		modelLicense: z.string().max(64).optional(),
		weightsSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/i).nullable().optional(),
		device: z.enum(['cpu', 'cuda']).nullable().optional(),
	}).nullable(),
	stageErrors: z.array(z.string().max(300)).max(30),
	silhouettes: z.array(Sam2SegmentationMaskSchemaV1).max(8).optional(),
}).strict();

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

export async function readLatestWholeImageAnalysisRowV1(evidenceId: string, database: Pick<typeof db, 'execute'>) {
	const result = await database.execute(sql`
		SELECT source_revision, analysis_revision, model, model_artifact_sha256,
	       preprocessing_revision, source_locator, metadata
		FROM public.evidence_multimodal_vectors
		WHERE evidence_id = ${evidenceId}::uuid
		  AND modality = 'image'
		  AND source_locator->>'kind' = 'whole_image'
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`);
	return result.rows[0] as Record<string, unknown> | undefined;
}

export function parseWholeImageAnalysisRowV1(row: Record<string, unknown>, evidenceId: string, sourceRevision: string) {
	try {
		if (typeof row.source_revision !== 'string' || formatEvidenceSourceRevisionV1(row.source_revision) !== sourceRevision) return null;
	} catch { return null; }
	const metadata = objectRecord(row.metadata);
	const locator = objectRecord(row.source_locator);
	const analysis = storedVisualAnalysisSchema.safeParse(metadata?.visualAnalysis);
	const width = locator?.kind === 'whole_image' && locator.coordinateSpace === 'original_pixels' ? Number(locator.width) : NaN;
	const height = locator?.kind === 'whole_image' && locator.coordinateSpace === 'original_pixels' ? Number(locator.height) : NaN;
	const detectionsInBounds = analysis.success && Number.isSafeInteger(width) && Number.isSafeInteger(height)
		&& width > 0 && height > 0
		&& analysis.data.objectDetections.every(({ bbox }) => bbox[0] >= 0 && bbox[1] >= 0 && bbox[2] <= width && bbox[3] <= height && bbox[2] > bbox[0] && bbox[3] > bbox[1]);
	if (!analysis.success || analysis.data.sourceRevision !== sourceRevision || !detectionsInBounds) return null;
	const analysisRevision = String(row.analysis_revision ?? '');
	const visualAnalysis = { ...analysis.data, visionSummary: analysis.data.visionSummary ?? null };
	const ocr = imageOcrStageV1Schema.safeParse(metadata?.imageOcr);
	const storybook = buildStorybookImageObservationReadModelV1({ evidenceId, sourceRevision, analysisRevision, width, height, analysis: visualAnalysis,
		imageOcr: ocr.success && ocr.data.sourceRevision === sourceRevision ? ocr.data : undefined });
	const depth = visualAnalysis.depthMap;
	// Scene cells use the original pixel grid. A rotated or mirrored source needs a reviewed mapping first.
	const qualified = depth?.status === 'ESTIMATED' && depth.depthType === 'relative_monocular' &&
		depth.modelRevisionStatus === 'VERIFIED' && depth.width === width && depth.height === height &&
		(locator?.orientation === null || locator?.orientation === 1) && depth.artifactSha256
		? storybookRelativeDepthV1Schema.safeParse({ kind: depth.depthType, artifactSha256: `sha256:${depth.artifactSha256}`,
			weightsSha256: depth.weightsSha256?.toLowerCase(), modelId: depth.modelId, modelRevision: depth.modelRevision, width, height })
		: null;
	return { metadata, imageDerivatives: objectRecord(metadata?.imageDerivatives), analysis: visualAnalysis, width, height, analysisRevision, storybook,
		relativeDepth: qualified?.success ? qualified.data : undefined };
}

/** Latest decision for each current item. The evidence lock serializes this read on chapter writes. */
export async function readStorybookImageReviewsV1(
	database: Pick<typeof db, 'execute'>, caseId: string, manifest: StorybookImageObservationsV1,
): Promise<StorybookImageObservationsV1['reviews']> {
	const observationIds = reviewableImageObservationsV1(manifest).map(({ observationId }) => observationId);
	if (!observationIds.length) return undefined;
	const { rows } = await database.execute(sql`
		SELECT DISTINCT ON (item->>'observationId') id::text AS version_id, item
		FROM public.evidence_versions
		CROSS JOIN LATERAL (SELECT metadata#>'{annotation,storybookRegionReview}' AS item) AS review
		WHERE evidence_id = ${manifest.evidenceId}::uuid
		  AND metadata->>'schema' = 'atlas.evidence-annotation-revision.v1'
		  AND metadata->>'caseId' = ${caseId}
		  AND metadata->>'parentSha256' = ${manifest.sourceRevision}
		  AND item->>'analysisRevision' = ${manifest.analysisRevision}
		  AND item->>'observationRevision' = ${manifest.observationRevision}
		  AND item->>'observationId' IN (SELECT jsonb_array_elements_text(${JSON.stringify(observationIds)}::jsonb))
		ORDER BY item->>'observationId', version DESC, id DESC
	`);
	const reviews = rows.map(({ version_id, item }) => {
		const review = storybookRegionReviewV1Schema.parse(item);
		if (!('observationId' in review) || review.width !== manifest.width || review.height !== manifest.height) {
			throw new Error('STORYBOOK_IMAGE_REVIEW_READBACK_INVALID');
		}
		return storybookImageDecisionV1Schema.parse({ observationId: review.observationId, decision: review.decision, versionId: version_id });
	});
	return reviews.length ? reviews : undefined;
}
