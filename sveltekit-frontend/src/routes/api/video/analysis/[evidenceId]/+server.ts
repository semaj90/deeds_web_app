import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { analysisJobs, audioTranscripts, evidence as canonicalEvidence, whisperSegments } from '$lib/server/db/schema-postgres.js';
import {
	cases,
	evidenceItems,
	evidenceMediaAssets,
	evidenceFrames,
	evidenceTranscriptSegments
} from '$lib/server/db/schema/index.js';
import { EvidenceCaseNotFoundError, requireOwnedEvidenceCaseV1 } from '$lib/server/evidence-case-admission-v1.js';
import { buildCanonicalVideoAnalysisReadModelV1, buildVideoAnalysisReadModelV1 } from '$lib/server/features/evidence/video/video-analysis-read-model-v1.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';

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

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Latest upload-pipeline job for this evidence, for the page's approximate ETA.
 * Advisory only: a read failure returns null and never fails the analysis read.
 */
async function loadLatestUploadJob(evidenceId: string) {
	try {
		const [job] = await db
			.select({
				status: analysisJobs.status,
				progress: analysisJobs.progress,
				startedAt: analysisJobs.startedAt,
				createdAt: analysisJobs.createdAt,
			})
			.from(analysisJobs)
			.where(and(eq(analysisJobs.evidenceId, evidenceId), eq(analysisJobs.jobType, 'upload_pipeline')))
			.orderBy(desc(analysisJobs.createdAt))
			.limit(1);
		if (!job) return null;
		const progressPct = Number(job.progress);
		return {
			status: job.status,
			progressPct: Number.isFinite(progressPct) ? progressPct : 0,
			startedAt: job.startedAt ? job.startedAt.toISOString() : null,
			createdAt: job.createdAt.toISOString(),
		};
	} catch (error) {
		console.warn('[VideoAnalysisAPI] Upload job lookup failed; omitting ETA:', error);
		return null;
	}
}

/**
 * The legacy evidence_items table is declared in Drizzle but absent from legal_ai_db.
 * A query against it means the evidence is not in the canonical table: a not-found answer,
 * not a server failure. Any other error keeps the 500 path.
 */
function isLegacyEvidenceTableMissing(error: unknown): boolean {
	const candidate = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
	const code = candidate.code ?? candidate.cause?.code;
	const message = `${candidate.message ?? ''} ${candidate.cause?.message ?? ''}`;
	return code === '42P01' && message.includes('evidence_items');
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
		const [canonical] = await db
			.select({
				id: canonicalEvidence.id,
				caseId: canonicalEvidence.caseId,
				userId: canonicalEvidence.userId,
				uploadedBy: canonicalEvidence.uploadedBy,
				evidenceType: canonicalEvidence.evidenceType,
				type: canonicalEvidence.type,
				title: canonicalEvidence.title,
				fileName: canonicalEvidence.fileName,
				mimeType: canonicalEvidence.mimeType,
				fileSize: canonicalEvidence.fileSize,
				fileUrl: canonicalEvidence.fileUrl,
				status: canonicalEvidence.status,
				createdAt: canonicalEvidence.createdAt,
				metadata: canonicalEvidence.metadata,
				aiAnalysis: canonicalEvidence.aiAnalysis,
				hash: canonicalEvidence.hash,
			})
			.from(canonicalEvidence)
			.where(and(eq(canonicalEvidence.id, evidenceId), isNull(canonicalEvidence.deletedAt)))
			.limit(1);

		if (canonical) {
			if (canonical.evidenceType !== 'video' && canonical.type !== 'video' && !canonical.mimeType?.startsWith('video/')) {
				return json(emptyAnalysis(evidenceId, 'Video evidence not found'), { status: 404 });
			}
			await requireOwnedEvidenceCaseV1(canonical.caseId ?? '', ownerId, async (caseId, userId) => {
				const [ownedCase] = await db
					.select({ id: cases.id })
					.from(cases)
					.where(and(eq(cases.id, caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))))
					.limit(1);
				return ownedCase?.id ?? null;
			});

			const analysisRoot = asRecord(canonical.aiAnalysis);
			const video = asRecord(analysisRoot.videoAnalysis);
			let currentSourceRevision: string | null = null;
			try {
				if (canonical.hash) currentSourceRevision = formatEvidenceSourceRevisionV1(canonical.hash);
			} catch {
				currentSourceRevision = null;
			}
			const currentRun = video.schema === 'atlas.video-analysis.v1' &&
				currentSourceRevision !== null && video.sourceRevision === currentSourceRevision &&
				typeof video.analysisRevision === 'string' && typeof video.analysisJobId === 'string' && UUID_RE.test(video.analysisJobId);
			const transcript = currentRun
				? await db
					.select({
						startMs: whisperSegments.startMs,
						endMs: whisperSegments.endMs,
						text: whisperSegments.text,
						language: whisperSegments.language,
						confidence: whisperSegments.confidence,
						model: sql<string | null>`${whisperSegments.metadata}->>'model'`,
					})
					.from(whisperSegments)
					.innerJoin(audioTranscripts, eq(whisperSegments.transcriptId, audioTranscripts.id))
					.where(and(
						eq(whisperSegments.evidenceId, evidenceId),
						eq(audioTranscripts.evidenceId, evidenceId),
						eq(audioTranscripts.caseId, canonical.caseId),
						eq(whisperSegments.transcriptId, video.analysisJobId as string),
						sql`${audioTranscripts.metadata}->>'sourceRevision' = ${currentSourceRevision}`,
						sql`${audioTranscripts.metadata}->>'analysisRevision' = ${video.analysisRevision as string}`,
					))
					.orderBy(asc(whisperSegments.startMs), asc(whisperSegments.segmentIndex))
					.limit(10_000)
				: [];

			const body = buildCanonicalVideoAnalysisReadModelV1({
				evidence: { ...canonical, aiAnalysis: currentRun ? canonical.aiAnalysis : null },
				transcript,
			});
			return json({ ok: true, error: null, analysisJob: await loadLatestUploadJob(evidenceId), ...body });
		}

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
			analysisJob: await loadLatestUploadJob(evidenceId),
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
		if (isLegacyEvidenceTableMissing(error)) {
			return json(emptyAnalysis(evidenceId, 'Video evidence not found'), { status: 404 });
		}
		console.error('[VideoAnalysisAPI] Read failed:', error);
		return json(emptyAnalysis(evidenceId, 'Failed to load video analysis'), { status: 500 });
	}
};
