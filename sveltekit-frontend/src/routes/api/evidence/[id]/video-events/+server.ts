import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { ENV } from '$lib/server/env.server.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import { isUuid } from '$lib/server/validation.js';
import { videoEventTimelineV1Schema } from '$lib/server/features/evidence/video/video-event-fusion-v1.js';

const reviewBodySchema = z.object({
	eventId: z.string().uuid(),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	analysisRevision: z.string().min(1).max(256),
	reviewStatus: z.enum(['APPROVED', 'REJECTED']),
}).strict();

function response(evidenceId: string, eventTimeline: unknown, reviewEnabled: boolean, error: string | null = null) {
	return { success: error === null, evidenceId, eventTimeline, reviewEnabled, error };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const evidenceId = params.id;
	if (!locals.user?.id) return json(response(evidenceId, null, false, 'Unauthorized'), { status: 401 });
	if (!isUuid(evidenceId)) return json(response(evidenceId, null, false, 'Invalid evidence ID'), { status: 400 });
	const userId = Number(locals.user.id);
	if (!Number.isSafeInteger(userId) || userId <= 0) return json(response(evidenceId, null, false, 'Unauthorized'), { status: 401 });

	try {
		const [item] = await db.select({ hash: evidence.hash, aiAnalysis: evidence.aiAnalysis })
			.from(evidence)
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(and(
				eq(evidence.id, evidenceId),
				or(
					eq(evidence.userId, userId),
					eq(evidence.uploadedBy, userId),
					and(isNotNull(evidence.caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))),
				),
				isNull(evidence.deletedAt),
			)).limit(1);
		if (!item) return json(response(evidenceId, null, false, 'Evidence not found or access denied'), { status: 404 });

		const root = item.aiAnalysis && typeof item.aiAnalysis === 'object' && !Array.isArray(item.aiAnalysis)
			? item.aiAnalysis as Record<string, unknown>
			: {};
		const video = root.videoAnalysis && typeof root.videoAnalysis === 'object' && !Array.isArray(root.videoAnalysis)
			? root.videoAnalysis as Record<string, unknown>
			: {};
		const parsed = videoEventTimelineV1Schema.safeParse(video.eventTimeline);
		const sourceRevision = item.hash ? formatEvidenceSourceRevisionV1(item.hash) : null;
		const timeline = parsed.success && parsed.data.evidenceId === evidenceId && parsed.data.sourceRevision === sourceRevision &&
			parsed.data.analysisRevision === video.analysisRevision ? parsed.data : null;
		return json(response(evidenceId, timeline, ENV.EVIDENCE_TRANSCRIPT_REVIEW_ENABLED), { headers: cacheControl.private });
	} catch (error) {
		console.error('[video-events] GET failed:', error);
		return json(response(evidenceId, null, false, 'Could not load video events'), { status: 500, headers: cacheControl.private });
	}
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const evidenceId = params.id;
	if (!locals.user?.id) return json(response(evidenceId, null, false, 'Unauthorized'), { status: 401 });
	if (!ENV.EVIDENCE_TRANSCRIPT_REVIEW_ENABLED) {
		return json(response(evidenceId, null, false, 'Event review is disabled'), { status: 403 });
	}
	if (!isUuid(evidenceId)) return json(response(evidenceId, null, false, 'Invalid evidence ID'), { status: 400 });
	const body = reviewBodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return json(response(evidenceId, null, true, 'Invalid review payload'), { status: 400 });
	const userId = Number(locals.user.id);
	if (!Number.isSafeInteger(userId) || userId <= 0) return json(response(evidenceId, null, true, 'Unauthorized'), { status: 401 });

	try {
		const [item] = await db.select({ hash: evidence.hash })
			.from(evidence)
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(and(
				eq(evidence.id, evidenceId),
				or(
					eq(evidence.userId, userId),
					eq(evidence.uploadedBy, userId),
					and(isNotNull(evidence.caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))),
				),
				isNull(evidence.deletedAt),
			)).limit(1);
		if (!item?.hash) return json(response(evidenceId, null, true, 'Evidence not found or access denied'), { status: 404 });
		const sourceRevision = formatEvidenceSourceRevisionV1(item.hash);
		if (sourceRevision !== body.data.sourceRevision) {
			return json(response(evidenceId, null, true, 'Source revision changed; reload events before reviewing'), { status: 409 });
		}
		const sceneAdmission = body.data.reviewStatus === 'APPROVED' ? 'APPROVED_FOR_SCENE_PROPOSAL' : 'NOT_ADMITTED';
		const updated = await db.update(evidence).set({
			aiAnalysis: sql`jsonb_set(
				COALESCE(${evidence.aiAnalysis}, '{}'::jsonb),
				'{videoAnalysis,eventTimeline,events}',
				(
					SELECT jsonb_agg(
						CASE WHEN event_row.value->>'eventId' = ${body.data.eventId}
							THEN event_row.value || jsonb_build_object(
								'reviewStatus', ${body.data.reviewStatus},
								'sceneAdmission', ${sceneAdmission},
								'reviewedBy', ${userId},
							'reviewedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
							)
							ELSE event_row.value
						END ORDER BY event_row.ordinality
					)
					FROM jsonb_array_elements(COALESCE(${evidence.aiAnalysis}->'videoAnalysis'->'eventTimeline'->'events', '[]'::jsonb))
						WITH ORDINALITY AS event_row(value, ordinality)
				),
				false
			)`,
		}).where(and(
			eq(evidence.id, evidenceId),
			eq(evidence.hash, item.hash),
			or(
				eq(evidence.userId, userId),
				eq(evidence.uploadedBy, userId),
				sql`EXISTS (
					SELECT 1 FROM public.cases authorized_case
					WHERE authorized_case.id = ${evidence.caseId}
					AND (authorized_case.user_id = ${userId} OR authorized_case.assigned_attorney = ${userId})
				)`,
			),
			isNull(evidence.deletedAt),
			sql`${evidence.aiAnalysis}->'videoAnalysis'->>'analysisRevision' = ${body.data.analysisRevision}`,
			sql`${evidence.aiAnalysis}->'videoAnalysis'->'eventTimeline'->>'sourceRevision' = ${sourceRevision}`,
			sql`EXISTS (
				SELECT 1 FROM jsonb_array_elements(COALESCE(${evidence.aiAnalysis}->'videoAnalysis'->'eventTimeline'->'events', '[]'::jsonb)) event_row
				WHERE event_row->>'eventId' = ${body.data.eventId}
			)`,
		)).returning({ id: evidence.id });
		if (!updated.length) return json(response(evidenceId, null, true, 'Event is stale or missing for this analysis revision'), { status: 409 });
		return json({ success: true, evidenceId, eventId: body.data.eventId, reviewStatus: body.data.reviewStatus, sceneAdmission }, { headers: cacheControl.private });
	} catch (error) {
		console.error('[video-events] review write failed:', error);
		return json(response(evidenceId, null, true, 'Could not save event review'), { status: 500 });
	}
};
