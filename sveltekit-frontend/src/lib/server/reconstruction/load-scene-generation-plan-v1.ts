import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { readSceneDocumentRevisionV1 } from '$lib/server/scene-document-revisions-v1.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import { readLatestWholeImageAnalysisRowV1, parseWholeImageAnalysisRowV1, readStorybookImageReviewsV1 } from '$lib/server/evidence/whole-image-analysis-readback-v1.js';
import { reviewableImageObservationsV1 } from '$lib/shared/storybook-region-review-v1.js';
import { videoEventTimelineV1Schema } from '$lib/server/features/evidence/video/video-event-fusion-v1.js';
import { CaseSceneIntakeContextV1Schema } from '$lib/reconstruction/case-scene-fetch-contract-v1.js';
import { resolveSceneGenerationPlanReferencesV1, SceneGenerationPlanResolutionErrorV1, type CanonicalSceneObservationReviewV1, type CanonicalSceneVideoEventV1 } from '$lib/server/reconstruction/resolve-scene-generation-plan-v1.js';
import { SceneGenerationPlanV1Schema, type SceneGenerationPlanV1Body } from '$lib/reconstruction/scene-generation-plan-v1.js';

export class SceneGenerationPlanLoadErrorV1 extends Error {
	constructor(message: string, readonly status: number) { super(message); }
}

export async function readSceneGenerationInputStatusV1(
	input: { caseId: string; sceneId: string; expectedSceneRevision: number; createdBy: number; requestSnapshot: unknown },
	database: Pick<typeof db, 'select' | 'execute'> = db
) {
	const { planHash, ...candidate } = SceneGenerationPlanV1Schema.parse(input.requestSnapshot);
	if (candidate.caseId !== input.caseId || candidate.sceneId !== input.sceneId ||
		candidate.expectedSceneRevision !== input.expectedSceneRevision) return 'source_stale';
	try {
		const current = await loadSceneGenerationPlanV1({ caseId: input.caseId, actorId: input.createdBy, candidate }, database);
		return current.planHash === planHash ? 'current' : 'source_stale';
	} catch (error) {
		if (error instanceof SceneGenerationPlanLoadErrorV1 && error.status === 404) return 'source_missing';
		if ((error instanceof SceneGenerationPlanLoadErrorV1 && error.status === 409) ||
			error instanceof SceneGenerationPlanResolutionErrorV1) return 'source_stale';
		throw error;
	}
}

/** Resolve canonical inputs through the caller's database snapshot. */
export async function loadSceneGenerationPlanV1(
	{ caseId, actorId, candidate }: { caseId: string; actorId: number; candidate: SceneGenerationPlanV1Body },
	database: Pick<typeof db, 'select' | 'execute'> = db
) {
	const authorized = await getAuthorizedCase(caseId, actorId, database);
	if (!authorized) throw new SceneGenerationPlanLoadErrorV1('Case not found', 404);
	if (candidate.caseId !== caseId) throw new SceneGenerationPlanLoadErrorV1('Plan case scope mismatch', 404);
	const currentScene = await readSceneDocumentRevisionV1({ caseId, sceneId: candidate.sceneId }, database);
	const currentSceneRevision = currentScene?.revision ?? 0;

	const evidenceIds = candidate.sources.map((source) => source.evidenceId);
	const evidenceRows = evidenceIds.length
		? await database.select({ id: evidence.id, caseId: evidence.caseId, deletedAt: evidence.deletedAt, hash: evidence.hash, aiAnalysis: evidence.aiAnalysis })
			.from(evidence).where(and(eq(evidence.caseId, caseId), isNull(evidence.deletedAt), inArray(evidence.id, evidenceIds)))
		: [];
	type EvidencePlanRow = { id: string; caseId: string | null; deletedAt: Date | null; hash: string | null; aiAnalysis: unknown };
	const typedEvidenceRows = evidenceRows as EvidencePlanRow[];
	const rowsById = new Map<string, EvidencePlanRow>(typedEvidenceRows.map((row) => [row.id, row] as const));
	if (rowsById.size !== evidenceIds.length) throw new SceneGenerationPlanLoadErrorV1('Selected evidence is missing or outside this case', 404);

	const observationReviews: CanonicalSceneObservationReviewV1[] = [];
	for (const requestObservation of candidate.reviewedObservations) {
		const row = rowsById.get(requestObservation.evidenceId);
		if (!row?.hash) throw new SceneGenerationPlanLoadErrorV1('Observation source has no current revision hash', 409);
		let sourceRevision: string;
		try { sourceRevision = formatEvidenceSourceRevisionV1(row.hash); } catch { throw new SceneGenerationPlanLoadErrorV1('Observation source revision is invalid', 409); }
		const analysisRow = await readLatestWholeImageAnalysisRowV1(requestObservation.evidenceId, database);
		const parsedAnalysis = analysisRow ? parseWholeImageAnalysisRowV1(analysisRow, requestObservation.evidenceId, sourceRevision) : null;
		const manifest = parsedAnalysis?.storybook?.manifest;
		if (!manifest || manifest.analysisRevision !== requestObservation.analysisRevision || manifest.observationRevision !== requestObservation.observationRevision ||
			!reviewableImageObservationsV1(manifest).some((item) => item.observationId === requestObservation.observationId)) {
			throw new SceneGenerationPlanLoadErrorV1('Reviewed observation revision is stale or unavailable', 409);
		}
		const reviews = await readStorybookImageReviewsV1(database, caseId, manifest);
		const review = reviews?.find((item) => item.observationId === requestObservation.observationId);
		if (!review || review.decision !== 'ACCEPTED') throw new SceneGenerationPlanLoadErrorV1('Observation has no current accepted review', 409);
		observationReviews.push({ caseId, evidenceId: requestObservation.evidenceId, sourceRevision,
			analysisRevision: manifest.analysisRevision, observationRevision: manifest.observationRevision,
			observationId: requestObservation.observationId, reviewDecisionId: review.versionId, decision: review.decision });
	}

	const videoEvents: CanonicalSceneVideoEventV1[] = [];
	for (const requestedEvent of candidate.events) {
		const sourceEvent = requestedEvent.sourceEvent;
		if (!sourceEvent) continue;
		const row = rowsById.get(sourceEvent.sourceEvidenceId);
		if (!row?.hash) throw new SceneGenerationPlanLoadErrorV1('Event source has no current revision hash', 409);
		let sourceRevision: string;
		try { sourceRevision = formatEvidenceSourceRevisionV1(row.hash); } catch { throw new SceneGenerationPlanLoadErrorV1('Event source revision is invalid', 409); }
		const aiAnalysis = row.aiAnalysis && typeof row.aiAnalysis === 'object' && !Array.isArray(row.aiAnalysis) ? row.aiAnalysis as Record<string, unknown> : {};
		const videoAnalysis = aiAnalysis.videoAnalysis && typeof aiAnalysis.videoAnalysis === 'object' && !Array.isArray(aiAnalysis.videoAnalysis) ? aiAnalysis.videoAnalysis as Record<string, unknown> : {};
		const timeline = videoEventTimelineV1Schema.safeParse(videoAnalysis.eventTimeline);
		if (!timeline.success || timeline.data.caseId !== caseId || timeline.data.evidenceId !== sourceEvent.sourceEvidenceId || timeline.data.sourceRevision !== sourceRevision || timeline.data.analysisRevision !== sourceEvent.analysisRevision || timeline.data.analysisRevision !== videoAnalysis.analysisRevision) {
			throw new SceneGenerationPlanLoadErrorV1('Source event revision is stale or unavailable', 409);
		}
		const timelineEvent = timeline.data.events.find((item) => item.eventId === sourceEvent.sourceEventId);
		if (!timelineEvent || timelineEvent.startMs !== sourceEvent.startMs || timelineEvent.endMs !== sourceEvent.endMs) throw new SceneGenerationPlanLoadErrorV1('Source event interval changed', 409);
		videoEvents.push({ caseId, evidenceId: sourceEvent.sourceEvidenceId, sourceRevision, analysisRevision: timeline.data.analysisRevision,
			eventId: timelineEvent.eventId, startMs: timelineEvent.startMs, endMs: timelineEvent.endMs,
			reviewStatus: timelineEvent.reviewStatus, sceneAdmission: timelineEvent.sceneAdmission });
	}

	const metadata = authorized.metadata && typeof authorized.metadata === 'object' && !Array.isArray(authorized.metadata) ? authorized.metadata as Record<string, unknown> : {};
	const intake = CaseSceneIntakeContextV1Schema.safeParse(metadata.caseSceneIntakeV1);
	return resolveSceneGenerationPlanReferencesV1({ caseId, currentSceneRevision,
		caseIntake: intake.success ? intake.data : null, candidate,
		evidenceRows: typedEvidenceRows.map(({ id, caseId: rowCaseId, deletedAt, hash }) => ({ id, caseId: rowCaseId, deletedAt, hash })),
		observationReviews, videoEvents });
}
