import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, asc, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	cases,
	evidenceItems,
	evidenceMediaAssets,
	evidenceFrames,
	evidenceTranscriptSegments
} from '$lib/server/db/schema/index.js';
import { EvidenceCaseNotFoundError, requireOwnedEvidenceCaseV1 } from '$lib/server/evidence-case-admission-v1.js';
import { buildVideoAnalysisReadModelV1 } from '$lib/server/features/evidence/video/video-analysis-read-model-v1.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emptyAnalysis(evidenceId: string, error: string) {
	return {
		ok: false,
		error,
		evidenceId,
		title: '',
		fileName: '',
		filePath: '',
		fileSize: 0,
		mimeType: '',
		processingStatus: 'unavailable',
		transcription: null,
		transcriptSegments: [],
		transcriptSummary: null,
		summaryRevision: null,
		keyFacts: [],
		vlmAnalysis: null,
		frameAnalysis: [],
		sceneDetection: [],
		entities: [],
		aceAnalysis: null,
		videoMetadata: {},
		createdAt: null
	};
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const { evidenceId } = params;
	if (!locals.user && process.env.DEV_BYPASS_AUTH !== 'true') {
		return json(emptyAnalysis(evidenceId, 'Unauthorized'), { status: 401 });
	}
	if (!UUID_RE.test(evidenceId)) {
		return json(emptyAnalysis(evidenceId, 'Invalid evidence ID'), { status: 400 });
	}

	const ownerId = Number(locals.user?.id);
	if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
		return json(emptyAnalysis(evidenceId, 'Authenticated user has no valid evidence-owner identity'), { status: 403 });
	}

	try {
		const [evidence] = await db
			.select({
				id: evidenceItems.id,
				caseId: evidenceItems.caseId,
				modality: evidenceItems.modality,
				status: evidenceItems.status,
				storageUri: evidenceItems.storageUri,
				metadataJson: evidenceItems.metadataJson,
				createdAt: evidenceItems.createdAt
			})
			.from(evidenceItems)
			.where(eq(evidenceItems.id, evidenceId))
			.limit(1);

		if (!evidence || evidence.modality !== 'video') {
			return json(emptyAnalysis(evidenceId, 'Video evidence not found'), { status: 404 });
		}

		await requireOwnedEvidenceCaseV1(evidence.caseId, ownerId, async (caseId, userId) => {
			const [ownedCase] = await db
				.select({ id: cases.id })
				.from(cases)
				.where(and(eq(cases.id, caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))))
				.limit(1);
			return ownedCase?.id ?? null;
		});

		const [transcript, frames, originalAsset] = await Promise.all([
			db
				.select({
					startMs: evidenceTranscriptSegments.startMs,
					endMs: evidenceTranscriptSegments.endMs,
					text: evidenceTranscriptSegments.text,
					language: evidenceTranscriptSegments.language,
					confidence: evidenceTranscriptSegments.confidence,
					model: evidenceTranscriptSegments.model
				})
				.from(evidenceTranscriptSegments)
				.where(eq(evidenceTranscriptSegments.evidenceId, evidenceId))
				.orderBy(asc(evidenceTranscriptSegments.startMs), asc(evidenceTranscriptSegments.id)),
			db
				.select({
					timestampMs: evidenceFrames.timestampMs,
					storageUri: evidenceFrames.storageUri,
					caption: evidenceFrames.caption,
					objectsJson: evidenceFrames.objectsJson,
					tagsJson: evidenceFrames.tagsJson,
					confidence: evidenceFrames.confidence
				})
				.from(evidenceFrames)
				.where(eq(evidenceFrames.evidenceId, evidenceId))
				.orderBy(asc(evidenceFrames.timestampMs)),
			db
				.select({ mimeType: evidenceMediaAssets.mimeType })
				.from(evidenceMediaAssets)
				.where(and(eq(evidenceMediaAssets.evidenceId, evidenceId), eq(evidenceMediaAssets.assetType, 'original')))
				.limit(1)
		]);

		return json({
			ok: true,
			error: null,
			...buildVideoAnalysisReadModelV1({
				evidence,
				transcript,
				frames,
				originalMimeType: originalAsset[0]?.mimeType ?? null
			})
		});
	} catch (error) {
		if (error instanceof EvidenceCaseNotFoundError) {
			return json(emptyAnalysis(evidenceId, 'Video evidence not found'), { status: 404 });
		}
		console.error('[VideoAnalysisAPI] Read failed:', error);
		return json(emptyAnalysis(evidenceId, 'Failed to load video analysis'), { status: 500 });
	}
};
