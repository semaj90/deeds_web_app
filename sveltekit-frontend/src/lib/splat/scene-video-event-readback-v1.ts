import type { SceneDocumentV1 } from './scene-document-v1.js';
import { humanCoco17PoseSchemaV1, parsePoseObservationV1 } from '$lib/shared/pose-skeleton-schema-v1.js';

export type SceneVideoEventBindingV1 = NonNullable<SceneDocumentV1['videoEventBindings']>[number];
export type SceneEvidenceAnalysisScopeV1 = Pick<SceneVideoEventBindingV1, 'evidenceId' | 'sourceRevision' | 'analysisRevision'>;

export type ReadbackVideoEventV1 = {
	eventId: string;
	startMs: number;
	endMs: number;
	label: string;
	summary: string;
	reviewStatus: string;
	sceneAdmission: string;
};

export type ReadbackVideoTimelineV1 = {
	evidenceId: string;
	sourceRevision: string;
	analysisRevision: string;
	events: ReadbackVideoEventV1[];
};

export type SceneVideoEventReadbackV1 = {
	binding: SceneVideoEventBindingV1;
	event: ReadbackVideoEventV1 | null;
};

export type ScenePoseObservationReadbackV1 = {
	evidenceId: string;
	sourceRevision: string;
	analysisRevision: string;
	frameIndex: number;
	framePtsUs: number;
	frameWidth: number;
	frameHeight: number;
	keypoints: Array<{ index: number; x: number | null; y: number | null; visibility: 'visible' | 'occluded' | 'not_labeled' }>;
	groundContact: { imagePx: [number, number]; footSide: 'left' | 'right' | 'unknown' } | null;
	groundContactReviewed: boolean;
	groundContactDecision: string;
	groundPlanePoint: [number, number] | null;
	groundPlaneCalibrationRevisionId: string | null;
	trackId: string | null;
	trackScopeId: string | null;
	placedKeypoints: number;
	totalKeypoints: number;
	reviewState: string;
	reviewDecision: string | null;
	sceneAdmission: string;
	annotationRevision: number;
};

/** Joins scene links only to the exact authorized timeline revision and interval. */
export function joinSceneVideoEventReadbackV1(
	bindings: readonly SceneVideoEventBindingV1[],
	timelines: ReadonlyMap<string, ReadbackVideoTimelineV1>
): SceneVideoEventReadbackV1[] {
	return bindings.map((binding) => {
		const timeline = timelines.get(binding.evidenceId);
		const event = timeline
			&& timeline.evidenceId === binding.evidenceId
			&& timeline.sourceRevision === binding.sourceRevision
			&& timeline.analysisRevision === binding.analysisRevision
			? timeline.events.find((candidate) => candidate.eventId === binding.eventId
				&& candidate.startMs === binding.startMs
				&& candidate.endMs === binding.endMs
				&& candidate.reviewStatus === 'APPROVED'
				&& candidate.sceneAdmission === 'APPROVED_FOR_SCENE_PROPOSAL') ?? null
			: null;
		return { binding, event };
	});
}

export function parseReadbackVideoTimelineV1(value: unknown, expectedEvidenceId: string): ReadbackVideoTimelineV1 | null {
	if (!value || typeof value !== 'object') return null;
	const timeline = value as Partial<ReadbackVideoTimelineV1>;
	if (timeline.evidenceId !== expectedEvidenceId
		|| typeof timeline.sourceRevision !== 'string'
		|| typeof timeline.analysisRevision !== 'string'
		|| !Array.isArray(timeline.events)) return null;
	const events = timeline.events.filter((event): event is ReadbackVideoEventV1 => Boolean(event
		&& typeof event === 'object'
		&& typeof event.eventId === 'string'
		&& Number.isSafeInteger(event.startMs)
		&& Number.isSafeInteger(event.endMs)
		&& event.endMs > event.startMs
		&& typeof event.label === 'string'
		&& typeof event.summary === 'string'
		&& typeof event.reviewStatus === 'string'
		&& typeof event.sceneAdmission === 'string'));
	return { evidenceId: timeline.evidenceId, sourceRevision: timeline.sourceRevision, analysisRevision: timeline.analysisRevision, events };
}

/** Reads revision history into source-frame pose summaries, scoped to scene-bound runs. */
export function parseScenePoseReadbackV1(
	value: unknown,
	bindings: readonly SceneEvidenceAnalysisScopeV1[]
): ScenePoseObservationReadbackV1[] {
	if (!value || typeof value !== 'object' || !Array.isArray((value as { versions?: unknown }).versions)) return [];
	const revisions = (value as { versions: unknown[] }).versions;
	const latestBySample = new Map<string, ScenePoseObservationReadbackV1>();
	const reviewByPoseRevision = new Map<string, { decision: string; sceneAdmission: string; groundContactReviewed: boolean; groundContactDecision: string }>();
	for (const revision of revisions) {
		if (!revision || typeof revision !== 'object') continue;
		const row = revision as { metadata?: Record<string, unknown> };
		const decision = row.metadata;
		if (decision?.schema !== 'atlas.pose-review-decision.v1'
			|| typeof decision.evidenceId !== 'string' || typeof decision.sourceSha256 !== 'string'
			|| typeof decision.analysisRevision !== 'string' || typeof decision.annotationRevisionId !== 'string'
			|| !Number.isSafeInteger(decision.framePtsUs) || typeof decision.skeletonSchemaId !== 'string'
			|| decision.canonicalAuthority !== false
			|| (decision.decision !== 'ACCEPTED_FOR_SCENE_PROPOSAL' && decision.decision !== 'REJECTED')) continue;
		const matchingBinding = bindings.some((binding) => binding.evidenceId === decision.evidenceId
			&& binding.sourceRevision === decision.sourceSha256
			&& binding.analysisRevision === decision.analysisRevision);
		if (!matchingBinding || decision.skeletonSchemaId !== humanCoco17PoseSchemaV1.schemaId) continue;
		const key = `${decision.annotationRevisionId}:${decision.framePtsUs}:${decision.trackId ?? ''}:${decision.trackScopeId ?? ''}`;
		if (!reviewByPoseRevision.has(key)) reviewByPoseRevision.set(key, {
			decision: String(decision.decision), sceneAdmission: String(decision.sceneAdmission ?? 'NOT_ADMITTED'),
			groundContactReviewed: decision.groundContactReviewed === true,
			groundContactDecision: typeof decision.groundContactDecision === 'string' ? decision.groundContactDecision : 'NOT_PRESENT',
		});
	}
	for (const revision of revisions) {
		if (!revision || typeof revision !== 'object') continue;
		const version = revision as { id?: unknown; version?: unknown; metadata?: { annotation?: { poseObservations?: unknown } } };
		if (!Number.isSafeInteger(version.version) || !Array.isArray(version.metadata?.annotation?.poseObservations)) continue;
		for (const candidate of version.metadata.annotation.poseObservations) {
			if (!candidate || typeof candidate !== 'object') continue;
			const raw = candidate as Record<string, unknown>;
			const matchingBinding = bindings.find((binding) => binding.evidenceId === raw.evidenceId
				&& binding.sourceRevision === raw.sourceRevision
				&& binding.sourceRevision === raw.sourceSha256
				&& binding.analysisRevision === raw.analysisRevision);
			if (!matchingBinding) continue;
			let pose;
			try { pose = parsePoseObservationV1(raw, humanCoco17PoseSchemaV1); } catch { continue; }
			const key = `${pose.evidenceId}:${pose.sourceRevision}:${pose.analysisRevision}:${pose.framePtsUs}:${pose.trackId ?? ''}:${pose.trackScopeId ?? ''}`;
			const current = latestBySample.get(key);
			if (current && current.annotationRevision >= Number(version.version)) continue;
			latestBySample.set(key, {
				evidenceId: pose.evidenceId,
				sourceRevision: pose.sourceRevision,
				analysisRevision: pose.analysisRevision,
				frameIndex: pose.frameIndex,
				framePtsUs: pose.framePtsUs,
				frameWidth: pose.frameWidth,
				frameHeight: pose.frameHeight,
				keypoints: pose.keypoints.map(({ index, x, y, visibility }) => ({ index, x, y, visibility })),
				groundContact: pose.groundContact ? {
					imagePx: [pose.groundContact.imagePx[0], pose.groundContact.imagePx[1]],
					footSide: pose.groundContact.footSide,
				} : null,
				trackId: pose.trackId,
				trackScopeId: pose.trackScopeId,
				placedKeypoints: pose.keypoints.filter((point) => point.x !== null && point.y !== null && point.visibility !== 'not_labeled').length,
				totalKeypoints: pose.keypoints.length,
				reviewState: pose.reviewState,
				reviewDecision: reviewByPoseRevision.get(`${String(version.id ?? '')}:${pose.framePtsUs}:${pose.trackId ?? ''}:${pose.trackScopeId ?? ''}`)?.decision ?? null,
				sceneAdmission: reviewByPoseRevision.get(`${String(version.id ?? '')}:${pose.framePtsUs}:${pose.trackId ?? ''}:${pose.trackScopeId ?? ''}`)?.sceneAdmission ?? 'NOT_ADMITTED',
				groundContactReviewed: reviewByPoseRevision.get(`${String(version.id ?? '')}:${pose.framePtsUs}:${pose.trackId ?? ''}:${pose.trackScopeId ?? ''}`)?.groundContactReviewed ?? false,
				groundContactDecision: reviewByPoseRevision.get(`${String(version.id ?? '')}:${pose.framePtsUs}:${pose.trackId ?? ''}:${pose.trackScopeId ?? ''}`)?.groundContactDecision ?? 'NOT_PRESENT',
				groundPlanePoint: null,
				groundPlaneCalibrationRevisionId: null,
				annotationRevision: Number(version.version)
			});
		}
	}
	return [...latestBySample.values()].sort((a, b) => a.framePtsUs - b.framePtsUs || (a.trackId ?? '').localeCompare(b.trackId ?? ''));
}

export type PoseImageTrajectoryPointV1 = { frameIndex: number; framePtsUs: number; x: number; y: number; current: boolean };

export type GroundPlanePlotInputPointV1 = { frameIndex: number; framePtsUs: number; planeM: readonly [number, number] };
export type GroundPlanePlotPointV1 = GroundPlanePlotInputPointV1 & { x: number; y: number; index: number; paletteSlot: number };

/** Compact, equal-scale top-down plot coordinates for a reviewed measured-plane track. */
export function layoutGroundPlaneTrackPlotV1(
	points: readonly GroundPlanePlotInputPointV1[],
	width = 240,
	height = 150,
	padding = 18
): GroundPlanePlotPointV1[] {
	if (points.length < 2 || points.length > 4096 || !Number.isFinite(width) || !Number.isFinite(height)
		|| !Number.isFinite(padding) || width <= padding * 2 || height <= padding * 2) return [];
	if (points.some((point) => !Number.isSafeInteger(point.frameIndex) || point.frameIndex < 0
		|| !Number.isSafeInteger(point.framePtsUs) || point.framePtsUs < 0
		|| point.planeM.length !== 2 || point.planeM.some((value) => !Number.isFinite(value)))) return [];
	const xs = points.map((point) => point.planeM[0]);
	const ys = points.map((point) => point.planeM[1]);
	const minX = Math.min(...xs); const maxX = Math.max(...xs);
	const minY = Math.min(...ys); const maxY = Math.max(...ys);
	const spanX = maxX - minX; const spanY = maxY - minY;
	const usableWidth = width - padding * 2; const usableHeight = height - padding * 2;
	const scale = Math.min(usableWidth / (spanX || 1), usableHeight / (spanY || 1));
	const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
	return points.map((point, index) => ({
		...point, index,
		x: width / 2 + (point.planeM[0] - centerX) * scale,
		y: height / 2 - (point.planeM[1] - centerY) * scale,
		paletteSlot: Math.round(index * 15 / (points.length - 1))
	}));
}

/** Time-order display LUT only; this is not a class vocabulary or evidence classification. */
export const GROUND_PLANE_TRACK_TIME_PALETTE_V1 = Object.freeze([
	'#183b56', '#1d5268', '#216a77', '#27827f', '#369985', '#50ad85', '#72bd7f', '#98c875',
	'#b9cf6b', '#d3d061', '#e5c557', '#efb74c', '#f2a444', '#eb8d3e', '#dc733c', '#c9593e'
] as const);

/** Builds a display-only COCO hip-center path for one exact clip-scoped track. */
export function poseHipImageTrajectoryV1(
	observations: readonly ScenePoseObservationReadbackV1[],
	current: ScenePoseObservationReadbackV1,
	maxSamples = 24
): PoseImageTrajectoryPointV1[] {
	if (!current.trackId || !current.trackScopeId || !Number.isInteger(maxSamples) || maxSamples < 2) return [];
	const matching = observations.filter((pose) => pose.evidenceId === current.evidenceId
		&& pose.sourceRevision === current.sourceRevision
		&& pose.analysisRevision === current.analysisRevision
		&& pose.trackId === current.trackId
		&& pose.trackScopeId === current.trackScopeId
		&& pose.frameWidth === current.frameWidth
		&& pose.frameHeight === current.frameHeight
		&& Number.isSafeInteger(pose.framePtsUs))
		.sort((a, b) => a.framePtsUs - b.framePtsUs || a.frameIndex - b.frameIndex);
	const points = matching.flatMap((pose): PoseImageTrajectoryPointV1[] => {
		const left = pose.keypoints.find((point) => point.index === 11);
		const right = pose.keypoints.find((point) => point.index === 12);
		if (!left || !right || left.x === null || left.y === null || right.x === null || right.y === null
			|| left.visibility === 'not_labeled' || right.visibility === 'not_labeled') return [];
		return [{ frameIndex: pose.frameIndex, framePtsUs: pose.framePtsUs, x: (left.x + right.x) / 2, y: (left.y + right.y) / 2,
			current: pose.framePtsUs === current.framePtsUs && pose.frameIndex === current.frameIndex }];
	});
	if (points.length <= maxSamples) return points;
	const currentIndex = Math.max(0, points.findIndex((point) => point.current));
	const start = Math.max(0, Math.min(points.length - maxSamples, currentIndex - Math.floor(maxSamples / 2)));
	return points.slice(start, start + maxSamples);
}
