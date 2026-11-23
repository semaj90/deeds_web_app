import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import { SceneGenerationPlanV1BodySchema, type SceneGenerationPlanV1Body } from '$lib/reconstruction/scene-generation-plan-v1.js';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';

export class SceneGenerationPlanResolutionErrorV1 extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'SceneGenerationPlanResolutionErrorV1';
	}
}

export interface CanonicalSceneVideoEventV1 {
	caseId: string;
	evidenceId: string;
	sourceRevision: string;
	analysisRevision: string;
	eventId: string;
	startMs: number;
	endMs: number;
	reviewStatus: 'UNREVIEWED_PROPOSAL' | 'APPROVED' | 'REJECTED';
	sceneAdmission: 'NOT_ADMITTED' | 'APPROVED_FOR_SCENE_PROPOSAL';
}

export interface CanonicalSceneObservationReviewV1 {
	caseId: string;
	evidenceId: string;
	sourceRevision: string;
	analysisRevision: string;
	observationRevision: string;
	observationId: string;
	reviewDecisionId: string;
	decision: 'ACCEPTED' | 'REJECTED' | 'UNCERTAIN';
}

/**
 * Resolves client references against case-scoped rows returned by canonical owners.
 * This is a preparation boundary only: it queues no job and writes no data.
 */
export function resolveSceneGenerationPlanReferencesV1(input: {
	caseId: string;
	currentSceneRevision: number;
	caseIntake: SceneGenerationPlanV1Body['caseIntake'];
	candidate: unknown;
	evidenceRows: ReadonlyArray<{ id: string; caseId: string | null; deletedAt: Date | string | null; hash: string | null }>;
	observationReviews: ReadonlyArray<CanonicalSceneObservationReviewV1>;
	videoEvents: ReadonlyArray<CanonicalSceneVideoEventV1>;
}): ReturnType<typeof buildSceneGenerationPlanV1> {
	const candidate = SceneGenerationPlanV1BodySchema.parse(input.candidate);
	if (candidate.caseId !== input.caseId) throw new SceneGenerationPlanResolutionErrorV1('PLAN_CASE_SCOPE_MISMATCH');
	if (candidate.expectedSceneRevision !== input.currentSceneRevision) throw new SceneGenerationPlanResolutionErrorV1('SCENE_REVISION_STALE');

	const rows = new Map(input.evidenceRows.map((row) => [row.id, row]));
	if (rows.size !== input.evidenceRows.length || rows.size !== candidate.sources.length) {
		throw new SceneGenerationPlanResolutionErrorV1('SOURCE_MEMBERSHIP_MISMATCH');
	}
	for (const source of candidate.sources) {
		const row = rows.get(source.evidenceId);
		if (!row || row.caseId !== input.caseId || row.deletedAt !== null) throw new SceneGenerationPlanResolutionErrorV1('SOURCE_NOT_AUTHORIZED');
		let currentRevision: string;
		try {
			if (!row.hash) throw new Error('missing hash');
			currentRevision = formatEvidenceSourceRevisionV1(row.hash);
		} catch { throw new SceneGenerationPlanResolutionErrorV1('SOURCE_REVISION_UNAVAILABLE'); }
		if (source.sourceRevision !== currentRevision || source.sha256 !== currentRevision.slice('sha256:'.length)) {
			throw new SceneGenerationPlanResolutionErrorV1('SOURCE_REVISION_STALE');
		}
	}

	for (const observation of candidate.reviewedObservations) {
		const match = input.observationReviews.find((review) => review.caseId === input.caseId &&
			review.evidenceId === observation.evidenceId && review.sourceRevision === observation.sourceRevision &&
			review.analysisRevision === observation.analysisRevision && review.observationRevision === observation.observationRevision &&
			review.observationId === observation.observationId && review.reviewDecisionId === observation.reviewDecisionId &&
			review.decision === 'ACCEPTED');
		if (!match) throw new SceneGenerationPlanResolutionErrorV1('OBSERVATION_REVIEW_NOT_CURRENTLY_ACCEPTED');
	}

	for (const event of candidate.events) {
		if (event.sourceEvent) {
			const canonical = input.videoEvents.find((item) => item.caseId === input.caseId &&
				item.evidenceId === event.sourceEvent?.sourceEvidenceId && item.sourceRevision === candidate.sources.find((source) => source.evidenceId === item.evidenceId)?.sourceRevision &&
				item.eventId === event.sourceEvent?.sourceEventId && item.analysisRevision === event.sourceEvent?.analysisRevision &&
				item.startMs === event.sourceEvent?.startMs && item.endMs === event.sourceEvent?.endMs);
			if (!canonical) throw new SceneGenerationPlanResolutionErrorV1('SOURCE_EVENT_STALE_OR_MISSING');
			if ((event.status === 'measured' || event.reviewStatus === 'accepted') &&
				(canonical.reviewStatus !== 'APPROVED' || canonical.sceneAdmission !== 'APPROVED_FOR_SCENE_PROPOSAL')) {
				throw new SceneGenerationPlanResolutionErrorV1('SOURCE_EVENT_NOT_ADMITTED');
			}
			if (event.reviewStatus === 'disputed' && canonical.reviewStatus !== 'REJECTED') {
				throw new SceneGenerationPlanResolutionErrorV1('SOURCE_EVENT_DISPUTE_NOT_CURRENT');
			}
		} else if (event.status === 'measured' || event.reviewStatus !== 'unreviewed') {
			throw new SceneGenerationPlanResolutionErrorV1('EVENT_REVIEW_NOT_CANONICAL');
		}
	}

	for (const claim of [candidate.narrative.why, candidate.narrative.how]) {
		if (claim.status === 'disputed' || claim.reviewStatus !== 'unreviewed' || claim.reviewDecisionId !== null) {
			// No canonical case-level WHY/HOW claim review owner is wired yet.
			throw new SceneGenerationPlanResolutionErrorV1('NARRATIVE_REVIEW_OWNER_UNAVAILABLE');
		}
	}

	// Until a reviewed cross-source clock mapping owner exists, key every lane
	// to its evidence item. A client-supplied clockId cannot merge unrelated clocks.
	const resolvedCandidate = {
		...candidate,
		caseIntake: input.caseIntake,
		events: candidate.events.map((event) => ({
			...event,
			clock: { ...event.clock, clockId: event.clock.evidenceId === null ? `scene:${candidate.sceneId}` : `evidence:${event.clock.evidenceId}` }
		}))
	};
	return buildSceneGenerationPlanV1(resolvedCandidate);
}
