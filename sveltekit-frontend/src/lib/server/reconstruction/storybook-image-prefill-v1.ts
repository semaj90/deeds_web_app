import { createHash } from 'node:crypto';
import { z } from 'zod';
import { storybookImageObservationScopeV1Schema, storybookImageObservationsV1Schema } from '$lib/shared/storybook-image-observations-v1.js';
import { STORYBOARD_CLIP_SECONDS, type SceneIntent } from './crime-scene-schema.js';
import { acceptsStorybookObservationIntentV1 } from './storybook-frame-prefill-v1.js';

export type StorybookImageLocatorV1 = z.infer<typeof storybookImageObservationScopeV1Schema>;

const currentImageReadbackSchema = z.object({
	status: z.literal('CURRENT'), caseId: z.uuid(),
	evidenceId: z.uuid(), sourceRevision: z.string(), analysisRevision: z.string(),
	storybook: storybookImageObservationsV1Schema,
});

/** Take only source-bound observations from the authorized multimodal readback. */
export function buildStorybookImagePrefillV1(readback: unknown, caseId: string, input: StorybookImageLocatorV1) {
	const parsed = currentImageReadbackSchema.safeParse(readback);
	if (!parsed.success) return null;
	const { storybook, ...readbackScope } = parsed.data;
	const { evidenceId, sourceRevision, analysisRevision, observationRevision } = input;
	if (readbackScope.caseId !== caseId || readbackScope.evidenceId !== evidenceId || readbackScope.sourceRevision !== sourceRevision ||
		readbackScope.analysisRevision !== analysisRevision || storybook.evidenceId !== evidenceId || storybook.sourceRevision !== sourceRevision ||
		storybook.analysisRevision !== analysisRevision || storybook.observationRevision !== observationRevision) return null;

	const reviews = new Map(storybook.reviews?.map((review) => [review.observationId, review]));
	const isEligible = (id: string) => reviews.get(id)?.decision !== 'REJECTED';
	const detections = storybook.detectionCoverage === 'RECORDED' ?
		storybook.detections.filter(({ observationId }) => isEligible(observationId))
			.sort((a, b) => b.confidence - a.confidence || a.ordinal - b.ordinal).slice(0, 8) : [];
	const selected = new Set(detections.map((detection) => detection.observationId));
	const masks = storybook.maskCoverage === 'RECORDED' ?
		storybook.masks.filter((mask) => selected.has(mask.detectionObservationId) && isEligible(mask.observationId)).slice(0, 4) : [];
	const context = storybook.sceneContextCoverage === 'RECORDED' && storybook.sceneContext &&
		isEligible(storybook.sceneContext.observationId) ? storybook.sceneContext : undefined;
	const observations = [...detections, ...masks, ...(context ? [{ ...context, description: context.description.slice(0, 1000),
		descriptionTruncated: context.description.length > 1000 }] : []),
		...(storybook.ocrCoverage === 'COMPLETED' && storybook.ocrSpan && isEligible(storybook.ocrSpan.observationId) ? [storybook.ocrSpan] : [])];
	const packet = {
		schema: 'atlas.storybook-image-prefill.v1' as const,
		caseId, source: { ...input, width: storybook.width, height: storybook.height },
		coordinateSpace: storybook.coordinateSpace,
		coverage: {
			detection: storybook.detectionCoverage, mask: storybook.maskCoverage,
			sceneContext: storybook.sceneContextCoverage ?? 'NOT_RECORDED',
			omittedDetectionCount: storybook.detections.length - detections.length,
			omittedMaskCount: storybook.masks.length - masks.length,
			unresolvedMaskCount: storybook.unresolvedMaskCount,
			...(storybook.ocrCoverage ? { ocr: storybook.ocrCoverage } : {}),
			...(reviews.size ? { rejectedObservationCount: [...reviews.values()].filter(({ decision }) => decision === 'REJECTED').length } : {}),
		},
		...(reviews.size ? { reviewSha256: `sha256:${createHash('sha256').update(JSON.stringify(storybook.reviews)).digest('hex')}` } : {}),
		observations: observations.map((observation, index) => {
			const review = reviews.get(observation.observationId);
			return { ...observation, citationRef: index + 1,
				...(review ? { reviewerDecision: review.decision, reviewVersionId: review.versionId } : {}) };
		}),
	};
	return { ...packet, prefillSha256: `sha256:${createHash('sha256').update(JSON.stringify(packet)).digest('hex')}` };
}

export type StorybookImagePrefillV1 = NonNullable<ReturnType<typeof buildStorybookImagePrefillV1>>;

const imageDraftRefsSchema = z.object({
	title: z.string().trim().min(1).max(120),
	events: z.array(z.object({
		what: z.string().trim().min(1).max(480),
		how: z.string().trim().min(1).max(480),
		citation_refs: z.array(z.number().int().min(1).max(14)).min(1).max(4).refine((refs) => new Set(refs).size === refs.length),
	}).strict()).min(1).max(2),
}).strict();

/** Resolve model-selected refs and derive the scene contract from the authorized packet. */
export function buildStorybookImageIntentV1(draft: unknown, prefill: StorybookImagePrefillV1, aestheticHint?: SceneIntent['aesthetic']) {
	const parsed = imageDraftRefsSchema.safeParse(draft);
	if (!parsed.success) return null;
	const { source } = prefill;
	const actor = { actor_id: 'source-review', label: 'Source review', role: 'unknown' };
	const duration = STORYBOARD_CLIP_SECONDS / parsed.data.events.length;
	const events = [];
	for (const [index, { citation_refs, what, how }] of parsed.data.events.entries()) {
		const citations = [];
		for (const ref of citation_refs) {
			const observation = prefill.observations[ref - 1];
			if (observation?.citationRef !== ref) return null;
			citations.push({ source: 'image_observation', evidence_id: source.evidenceId, source_revision: source.sourceRevision,
				analysis_revision: source.analysisRevision, observation_revision: source.observationRevision,
				observation_id: observation.observationId, observation_kind: observation.kind,
				...(observation.kind === 'segmentation_mask' ? { artifact_sha256: observation.artifactSha256 } : {}),
				...(observation.kind !== 'scene_context' && observation.modelRevision ? { model_version: observation.modelRevision } : {}),
			});
		}
		events.push({ id: `beat-${index + 1}`, time_s: duration * index, duration_s: duration, who: [actor],
			what, how, citations, action: 'idle', kind: 'hypothesis', confidence: 'low', evidence_ids: [source.evidenceId] });
	}
	const draftSha = createHash('sha256').update(JSON.stringify([prefill.prefillSha256, parsed.data, aestheticHint])).digest('hex');
	return { scene_id: `storybook-${draftSha}`, case_id: prefill.caseId, title: parsed.data.title, duration_s: STORYBOARD_CLIP_SECONDS,
		aesthetic: aestheticHint, environment: { city: 'unspecified' }, actors: [actor], events,
		evidence_links: [{ evidence_id: source.evidenceId, status: 'cited' }] };
}

export function acceptsStorybookImageIntentV1(intent: SceneIntent, prefill: StorybookImagePrefillV1) {
	const { source } = prefill;
	const observations = new Map(prefill.observations.map((observation) => [observation.observationId, observation]));
	return intent.environment.city === 'unspecified' && intent.environment.location === undefined &&
		intent.environment.time_of_day === undefined && intent.environment.weather === undefined &&
		intent.annotations.length === 0 && intent.events.every((event) => event.location === undefined && event.annotations.length === 0) &&
		acceptsStorybookObservationIntentV1(intent, prefill.caseId, source.evidenceId, (citation) => {
			const observation = citation.observation_id && observations.get(citation.observation_id);
			return Boolean(observation && citation.observation_kind === observation.kind &&
				citation.source_revision === source.sourceRevision && citation.analysis_revision === source.analysisRevision &&
				citation.observation_revision === source.observationRevision && citation.frame_timestamp_s === undefined && citation.frame_index === undefined &&
				citation.artifact_sha256 === (observation.kind === 'segmentation_mask' ? observation.artifactSha256 : undefined) &&
				citation.model_version === (observation.kind === 'scene_context' ? undefined : observation.modelRevision ?? undefined));
		});
}
