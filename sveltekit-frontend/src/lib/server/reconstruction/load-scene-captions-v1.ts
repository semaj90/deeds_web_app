import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { whisperSegments } from '$lib/server/db/schema-postgres.js';
import { videoEventTimelineV1Schema } from '$lib/server/features/evidence/video/video-event-fusion-v1.js';
import type { SceneCaptionScopeV1, SceneCaptionResponseV1 } from '$lib/reconstruction/scene-captions-v1.js';

/** Read transcript excerpts cited by the exact currently admitted event. */
export async function loadSceneCaptionsV1(scope: SceneCaptionScopeV1, rawTimeline: unknown, database: Pick<typeof db, 'select'> = db): Promise<SceneCaptionResponseV1 | null> {
	const parsed = videoEventTimelineV1Schema.safeParse(rawTimeline);
	if (!parsed.success) return null;
	const timeline = parsed.data;
	if (timeline.caseId !== scope.caseId || timeline.evidenceId !== scope.evidenceId ||
		timeline.sourceRevision !== scope.sourceRevision || timeline.analysisRevision !== scope.analysisRevision) return null;
	const event = timeline.events.find(({ eventId }) => eventId === scope.eventId);
	if (event?.reviewStatus !== 'APPROVED' || event.sceneAdmission !== 'APPROVED_FOR_SCENE_PROPOSAL' ||
		event.startMs !== scope.startMs || event.endMs !== scope.endMs) return null;
	const references = event.sourceReferences.filter((ref) => ref.kind === 'transcript_segment')
		.filter((ref) => ref.startMs < scope.endMs && ref.endMs > scope.startMs)
		.sort((a, b) => a.startMs - b.startMs || a.referenceId.localeCompare(b.referenceId));
	if (!references.length) return { scope, captions: [], unavailableCount: 0 };
	const requested = references.slice(0, 64);
	const rows = await database.select({
		id: whisperSegments.id, transcriptId: whisperSegments.transcriptId, segmentIndex: whisperSegments.segmentIndex,
		startMs: whisperSegments.startMs, endMs: whisperSegments.endMs, text: whisperSegments.text, metadata: whisperSegments.metadata
	}).from(whisperSegments).where(and(
		eq(whisperSegments.evidenceId, scope.evidenceId),
		sql`${whisperSegments.metadata}->>'sourceRevision' = ${scope.sourceRevision}`,
		sql`${whisperSegments.metadata}->>'analysisRevision' = ${scope.analysisRevision}`,
		or(...requested.map((ref) => and(eq(whisperSegments.transcriptId, ref.transcriptId),
			eq(whisperSegments.segmentIndex, ref.segmentIndex), eq(whisperSegments.startMs, ref.startMs), eq(whisperSegments.endMs, ref.endMs))))
	)).limit(64);
	const captions = requested.flatMap((ref) => {
		const matches = rows.filter((row) => row.transcriptId === ref.transcriptId && row.segmentIndex === ref.segmentIndex &&
			row.startMs === ref.startMs && row.endMs === ref.endMs);
		if (matches.length !== 1) return [];
		const row = matches[0]!;
		const metadata = row.metadata as { reviewStatus?: string; reviewState?: string } | null;
		if (!row.text.trim() || row.text.length > 10_000 || metadata?.reviewStatus === 'rejected' || metadata?.reviewState === 'REJECTED') return [];
		return [{ referenceId: ref.referenceId, segmentId: row.id, startMs: ref.startMs, endMs: ref.endMs, text: row.text,
			reviewed: metadata?.reviewStatus === 'approved' || (metadata?.reviewStatus === undefined && metadata?.reviewState === 'APPROVED') }];
	});
	return { scope, captions, unavailableCount: references.length - captions.length };
}
