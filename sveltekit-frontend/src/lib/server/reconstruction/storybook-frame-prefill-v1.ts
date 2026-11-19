import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { VideoStorybookCoverageV1 } from '$lib/server/features/evidence/video/video-storybook-coverage-v1.js';
import { assertEvidenceBoundSceneIntent, type SceneIntent, type SceneIntentCitationV1 } from './crime-scene-schema.js';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const storybookFrameLocatorV1Schema = z.object({
	evidenceId: z.uuid(),
	sourceRevision: digest,
	analysisRevision: z.string().min(1).max(256),
	frameIndex: z.number().int().min(0).max(59),
	artifactSha256: digest,
}).strict();

/** Assemble bounded JSON starting from a server-resolved, current analysis run. */
export function buildStorybookFramePrefillV1(coverage: VideoStorybookCoverageV1, input: z.infer<typeof storybookFrameLocatorV1Schema>) {
	if (coverage.evidenceId !== input.evidenceId || coverage.sourceRevision !== input.sourceRevision || coverage.analysisRevision !== input.analysisRevision) return null;
	const frame = coverage.frames.find((sample) => sample.frameIndex === input.frameIndex && sample.artifactSha256 === input.artifactSha256);
	if (!frame) return null;
	const observations = [...frame.detections].sort((a, b) => b.confidence - a.confidence || a.ordinal - b.ordinal).slice(0, 12)
		.map(({ observationId, label, confidence, modelRevision, bbox }) => ({ observationId, label, confidence, modelRevision, bbox }));
	const packet = {
		schema: 'atlas.storybook-frame-prefill.v1' as const,
		source: { ...input, timestampMs: frame.timestampMs, width: frame.width, height: frame.height, analysisJobId: coverage.analysisJobId },
		coverage: 'single_sampled_frame' as const,
		detectionStatus: frame.detectionStatus,
		omittedDetectionCount: frame.omittedDetectionCount + frame.detections.length - observations.length,
		observations,
		ocr: frame.ocr?.status === 'COMPLETED' ? frame.ocr.text.slice(0, 800) : null,
	};
	return { ...packet, prefillSha256: `sha256:${createHash('sha256').update(JSON.stringify(packet)).digest('hex')}` };
}

export type StorybookFramePrefillV1 = NonNullable<ReturnType<typeof buildStorybookFramePrefillV1>>;

export function acceptsStorybookObservationIntentV1(
	intent: SceneIntent, caseId: string, evidenceId: string,
	acceptsCitation: (citation: Extract<SceneIntentCitationV1, { source: 'image_observation' }>) => boolean,
) {
	try { assertEvidenceBoundSceneIntent(intent); } catch { return false; }
	return intent.case_id === caseId && intent.events.length <= 8 && intent.actors.every((actor) => actor.role === 'unknown') &&
		intent.evidence_links.every((link) => link.evidence_id === evidenceId && !link.anchor && link.status !== 'placed') &&
		intent.events.every((event) => event.kind === 'hypothesis' && event.action === 'idle' && event.path.length === 0 && !event.why_hypothesis &&
			event.who.every((actor) => actor.role === 'unknown') && event.evidence_ids.every((id) => id === evidenceId) &&
			event.citations.length <= 12 && event.citations.every((citation) => citation.source === 'image_observation' &&
				citation.evidence_id === evidenceId && citation.artifact_uri === undefined && citation.confidence === undefined && acceptsCitation(citation)));
}

/** Enforce the exact set of server-supplied observation locators on model output. */
export function acceptsStorybookFrameIntentV1(intent: SceneIntent, caseId: string, prefill: StorybookFramePrefillV1) {
	const { source } = prefill;
	const models = new Map(prefill.observations.map((observation) => [observation.observationId, observation.modelRevision]));
	return acceptsStorybookObservationIntentV1(intent, caseId, source.evidenceId, (citation) =>
		citation.source_revision === source.sourceRevision && citation.frame_index === source.frameIndex &&
		citation.frame_timestamp_s === source.timestampMs / 1000 && citation.observation_kind === 'detection' &&
		(citation.analysis_revision === undefined || citation.analysis_revision === source.analysisRevision) &&
		(citation.artifact_sha256 === undefined || citation.artifact_sha256 === source.artifactSha256) &&
		citation.observation_revision === undefined && citation.observation_id !== undefined && models.has(citation.observation_id) &&
		models.get(citation.observation_id) === citation.model_version);
}
