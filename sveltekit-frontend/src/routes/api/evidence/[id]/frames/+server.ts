/**
 * GET /api/evidence/[id]/frames
 * Returns canonical timestamped keyframes and VLM/YOLO detections for an evidence item.
 *
 * Guarantees:
 * - Stable JSON shape even on failure ({ success, evidenceId, frames: [], total: 0 }).
 * - Authorized case/owner checks against canonical `evidence` table.
 * - Graceful fallback to `evidence.metadata.frameAnalysis` when `evidence_frames` is unmigrated.
 * - Ordered by timestampMs ascending.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { evidenceFrames } from '$lib/server/db/schema/index.js';
import { and, asc, eq, isNotNull, or } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';

function parseMetadata(value: unknown): Record<string, unknown> {
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: {};
		} catch {
			return {};
		}
	}
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const evidenceId = params.id;

	if (!locals.user?.id) {
		return json({ success: false, error: 'Unauthorized', evidenceId, frames: [], total: 0 }, { status: 401 });
	}

	if (!isUuid(evidenceId)) {
		return json({ success: false, error: 'Invalid ID format', evidenceId, frames: [], total: 0 }, { status: 400 });
	}

	try {
		// 1. Check authorization against the primary evidence & cases table
		const userId = Number(locals.user.id);
		const [item] = await db
			.select({ id: evidence.id, hash: evidence.hash, metadata: evidence.metadata, aiAnalysis: evidence.aiAnalysis })
			.from(evidence)
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(
				and(
					eq(evidence.id, evidenceId),
					or(
						eq(evidence.userId, userId),
						eq(evidence.uploadedBy, userId),
						and(
							isNotNull(evidence.caseId),
							or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))
						)
					)
				)
			)
			.limit(1);

		if (!item) {
			return json(
				{ success: false, error: 'Evidence not found or access denied', evidenceId, frames: [], total: 0 },
				{ status: 404 }
			);
		}

		const analysisRoot = parseMetadata(item.aiAnalysis);
		const canonicalVideoAnalysis = parseMetadata(analysisRoot.videoAnalysis);
		const currentSourceRevision = item.hash ? formatEvidenceSourceRevisionV1(item.hash) : null;
		if (
			canonicalVideoAnalysis.schema === 'atlas.video-analysis.v1' &&
			canonicalVideoAnalysis.sourceRevision === currentSourceRevision &&
			Array.isArray(canonicalVideoAnalysis.frames)
		) {
			const frames = canonicalVideoAnalysis.frames.map((candidate, index) => {
				const frame = parseMetadata(candidate);
				const objects = Array.isArray(frame.objects) ? frame.objects : [];
				const detections = objects.map(parseMetadata).filter((detection) =>
				typeof detection.label === 'string' && Array.isArray(detection.bbox) &&
				detection.bbox.length === 4 && detection.bbox.every((coordinate) => Number.isFinite(coordinate)),
			);
				return {
					id: `${String(canonicalVideoAnalysis.analysisRevision ?? 'video')}:${index}`,
					timestamp: Number(frame.timestampMs ?? 0) / 1000,
					timestampMs: Number(frame.timestampMs ?? 0),
					framePath: null,
					description: detections.length
						? `Model observations: ${detections.map((detection) => String(detection.label)).join(', ')}`
						: 'Sampled video frame; no reviewed finding is recorded.',
					objects: detections.map((detection) => String(detection.label)),
					detections,
					tags: ['UNREVIEWED_PROPOSAL'],
					confidence: detections.length ? Math.max(...detections.map((detection) => Number(detection.confidence ?? 0))) : 0,
					width: frame.width,
					height: frame.height,
					modelRevision: frame.modelRevision ?? null,
					analysisRevision: canonicalVideoAnalysis.analysisRevision,
					sourceRevision: canonicalVideoAnalysis.sourceRevision,
					reviewState: frame.reviewState ?? 'UNREVIEWED_PROPOSAL',
				};
			});
			return json({ success: true, evidenceId, frames, total: frames.length }, { headers: cacheControl.private });
		}

		// 2. Attempt query against canonical evidence_frames table (if migrated)
		try {
			const rows = await db
				.select()
				.from(evidenceFrames)
				.where(eq(evidenceFrames.evidenceId, evidenceId))
				.orderBy(asc(evidenceFrames.timestampMs));

			if (rows.length > 0) {
				const frames = rows.map((r) => ({
					id: r.id,
					timestamp: r.timestampMs / 1000,
					timestampMs: r.timestampMs,
					framePath: r.storageUri,
					description: r.caption ?? '',
					objects: Array.isArray(r.objectsJson) ? r.objectsJson : [],
					tags: Array.isArray(r.tagsJson) ? r.tagsJson : [],
					ocrText: r.ocrText ?? null,
					vlmModel: r.vlmModel ?? null,
					confidence: r.confidence ? Number(r.confidence) : 1.0,
				}));

				return json(
					{ success: true, evidenceId, frames, total: frames.length },
					{ headers: cacheControl.private }
				);
			}
		} catch {
			// Fall through to metadata fallback if evidence_frames table is not present
		}

		// 3. Fallback: extract frameAnalysis from evidence.metadata
		const meta = parseMetadata(item.metadata);
		const fallbackFrames = Array.isArray(meta.frameAnalysis)
			? meta.frameAnalysis
			: Array.isArray(meta.frames)
				? meta.frames
				: [];

		return json(
			{ success: true, evidenceId, frames: fallbackFrames, total: fallbackFrames.length },
			{ headers: cacheControl.private }
		);
	} catch (error) {
		console.error('[frames] GET error:', error);
		// Return stable JSON shape even on failure as required by AGENTS.md
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				evidenceId,
				frames: [],
				total: 0
			},
			{ status: 200, headers: cacheControl.private }
		);
	}
};
