import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { audioTranscripts, cases, evidence, whisperSegments } from '$lib/server/db/schema-postgres.js';
import { evidenceTranscriptSegments } from '$lib/server/db/schema/evidence-multi-modal.js';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';

function formatTimestampVtt(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const milliseconds = Math.max(0, ms % 1000);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function formatTimestampSrt(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const milliseconds = Math.max(0, ms % 1000);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user && !process.env.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const evidenceId = params.id;
	if (!isUuid(evidenceId)) {
		return json({ error: 'Invalid evidence ID format' }, { status: 400 });
	}

	const userId = Number(locals.user?.id ?? 1);

	// Verify ownership & case access
	const [item] = await db
		.select({
			id: evidence.id,
			caseId: evidence.caseId,
			title: evidence.title,
			hash: evidence.hash,
			tags: evidence.tags,
			aiSummary: evidence.aiSummary,
			aiAnalysis: evidence.aiAnalysis,
		})
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
						or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId)),
					),
				),
			),
		)
		.limit(1);

	if (!item) {
		return json({ error: 'Evidence not found or unauthorized' }, { status: 404 });
	}

	const sourceRevision = item.hash ? formatEvidenceSourceRevisionV1(item.hash) : `urn:evidence:${item.id}`;
	const videoAnalysis = typeof item.aiAnalysis === 'object' && item.aiAnalysis !== null
		? (item.aiAnalysis as Record<string, unknown>).videoAnalysis as Record<string, unknown> | undefined
		: undefined;
	const isSilentVideo = (Array.isArray(item.tags) && item.tags.includes('NO_AUDIO_STREAM')) ||
		videoAnalysis?.transcriptionStatus === 'SKIPPED_NO_AUDIO';

	// Query segments from canonical PostgreSQL store
	let segmentsRaw: Array<{
		id: string;
		startMs: number;
		endMs: number;
		text: string;
		language: string | null;
		translatedText: string | null;
		confidence: string | number | null;
		model: string | null;
		metadataJson: unknown;
	}> = [];

	try {
		segmentsRaw = await db
			.select({
				id: evidenceTranscriptSegments.id,
				startMs: evidenceTranscriptSegments.startMs,
				endMs: evidenceTranscriptSegments.endMs,
				text: evidenceTranscriptSegments.text,
				language: evidenceTranscriptSegments.language,
				translatedText: evidenceTranscriptSegments.translatedText,
				confidence: evidenceTranscriptSegments.confidence,
				model: evidenceTranscriptSegments.model,
				metadataJson: evidenceTranscriptSegments.metadataJson,
			})
			.from(evidenceTranscriptSegments)
			.where(and(
				eq(evidenceTranscriptSegments.evidenceId, evidenceId),
				sql`${evidenceTranscriptSegments.metadataJson}->>'source_revision' = ${sourceRevision}`,
			))
			.orderBy(evidenceTranscriptSegments.startMs);
	} catch (err) {
		// Table may be empty or awaiting schema sync
		segmentsRaw = [];
	}

	if (segmentsRaw.length === 0) {
		try {
			const canonicalSegments = await db
				.select({
					id: whisperSegments.id,
					startMs: whisperSegments.startMs,
					endMs: whisperSegments.endMs,
					text: whisperSegments.text,
					language: whisperSegments.language,
					translatedText: sql<string | null>`NULL`,
					confidence: whisperSegments.confidence,
					model: audioTranscripts.whisperModel,
					metadataJson: whisperSegments.metadata,
				})
				.from(whisperSegments)
				.innerJoin(audioTranscripts, eq(whisperSegments.transcriptId, audioTranscripts.id))
				.where(and(
					eq(whisperSegments.evidenceId, evidenceId),
					eq(audioTranscripts.evidenceId, evidenceId),
					sql`${whisperSegments.metadata}->>'sourceRevision' = ${sourceRevision}`,
				))
				.orderBy(whisperSegments.startMs);
			segmentsRaw = canonicalSegments;
		} catch {
			// Canonical transcript tables may not be installed in older deployments.
		}
	}

	// Filter query/speaker if requested
	const query = url.searchParams.get('query')?.trim().toLowerCase();
	const speakerFilter = url.searchParams.get('speaker')?.trim();
	const exportFormat = url.searchParams.get('export')?.toLowerCase();

	const segments = segmentsRaw
		.map((s) => {
			const meta = (typeof s.metadataJson === 'object' && s.metadataJson !== null) ? s.metadataJson as Record<string, unknown> : {};
			return {
				id: s.id,
				startMs: s.startMs,
				endMs: s.endMs,
				text: s.text,
				language: s.language ?? 'en',
				confidence: s.confidence === null ? 0.85 : Number(s.confidence),
				model: s.model ?? 'whisper-base',
				sourceRevision: typeof meta.sourceRevision === 'string' ? meta.sourceRevision : sourceRevision,
				analysisRevision: typeof meta.analysisRevision === 'string' ? meta.analysisRevision : null,
				speakerId: (typeof meta.speakerId === 'string' ? meta.speakerId : null),
				reviewStatus: (meta.reviewStatus === 'approved' || meta.reviewState === 'APPROVED' ? 'approved' : 'unreviewed_proposal') as 'approved' | 'unreviewed_proposal',
			};
		})
		.filter((s) => {
			if (speakerFilter && s.speakerId !== speakerFilter) return false;
			if (query && !s.text.toLowerCase().includes(query)) return false;
			return true;
		});

	// Status resolution
	let status: 'completed' | 'no_audio' | 'processing' | 'failed' | 'empty' = 'completed';
	if (isSilentVideo) {
		status = 'no_audio';
	} else if (videoAnalysis?.transcriptionStatus === 'FAILED') {
		status = 'failed';
	} else if (segmentsRaw.length === 0) {
		status = 'empty';
	}

	// Handle file exports
	const safeTitle = sanitizeFilename(item.title || 'evidence_video');
	const exportBaseName = `${safeTitle}_${sanitizeFilename(evidenceId)}_transcript`;

	if (exportFormat === 'vtt') {
		let vtt = `WEBVTT - Transcript: ${item.title}\nSource-Revision: ${sourceRevision}\n\n`;
		segments.forEach((seg, idx) => {
			vtt += `${idx + 1}\n`;
			vtt += `${formatTimestampVtt(seg.startMs)} --> ${formatTimestampVtt(seg.endMs)}\n`;
			const speakerTag = seg.speakerId ? `<v ${seg.speakerId}>` : '';
			vtt += `${speakerTag}${seg.text}\n\n`;
		});
		return new Response(vtt, {
			headers: {
				'Content-Type': 'text/vtt; charset=utf-8',
				'Content-Disposition': `attachment; filename="${exportBaseName}.vtt"`,
			},
		});
	}

	if (exportFormat === 'srt') {
		let srt = '';
		segments.forEach((seg, idx) => {
			srt += `${idx + 1}\n`;
			srt += `${formatTimestampSrt(seg.startMs)} --> ${formatTimestampSrt(seg.endMs)}\n`;
			const speakerPrefix = seg.speakerId ? `[${seg.speakerId}] ` : '';
			srt += `${speakerPrefix}${seg.text}\n\n`;
		});
		return new Response(srt, {
			headers: {
				'Content-Type': 'application/x-subrip; charset=utf-8',
				'Content-Disposition': `attachment; filename="${exportBaseName}.srt"`,
			},
		});
	}

	if (exportFormat === 'txt') {
		let txt = `Transcript: ${item.title}\nSource: ${sourceRevision}\n----------------------------------------\n\n`;
		segments.forEach((seg) => {
			const time = formatTimestampVtt(seg.startMs).slice(0, 8);
			const speaker = seg.speakerId ? `[${seg.speakerId}] ` : '';
			txt += `[${time}] ${speaker}${seg.text}\n`;
		});
		return new Response(txt, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Disposition': `attachment; filename="${exportBaseName}.txt"`,
			},
		});
	}

	// Default JSON response (supports pagination)
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
	const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
	const startIndex = (page - 1) * limit;
	const paginatedSegments = exportFormat === 'json' ? segments : segments.slice(startIndex, startIndex + limit);

	const payload = {
		ok: true,
		videoTitle: item.title,
		evidenceId,
		caseId: item.caseId,
		sourceRevision,
		analysisRevision: typeof videoAnalysis?.analysisRevision === 'string' ? videoAnalysis.analysisRevision : null,
		status,
		totalSegments: segments.length,
		page,
		limit,
		totalPages: Math.ceil(segments.length / limit) || 1,
		segments: paginatedSegments,
	};
	if (exportFormat === 'json') {
		return new Response(JSON.stringify(payload, null, 2), {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Content-Disposition': `attachment; filename="${exportBaseName}.json"`,
			},
		});
	}
	return json(payload);
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user && !process.env.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const evidenceId = params.id;
	if (!isUuid(evidenceId)) {
		return json({ error: 'Invalid evidence ID format' }, { status: 400 });
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body.segmentId !== 'string' || !['approved', 'rejected', 'unreviewed_proposal'].includes(body.reviewStatus)) {
		return json({ error: 'Invalid review payload. Required: segmentId and reviewStatus.' }, { status: 400 });
	}

	try {
		await db
			.update(evidenceTranscriptSegments)
			.set({
				metadataJson: sql`jsonb_set(COALESCE(metadata_json, '{}'::jsonb), '{reviewStatus}', to_jsonb(${body.reviewStatus}::text))`,
			})
			.where(
				and(
					eq(evidenceTranscriptSegments.id, body.segmentId),
					eq(evidenceTranscriptSegments.evidenceId, evidenceId),
				),
			);

		return json({ ok: true, segmentId: body.segmentId, reviewStatus: body.reviewStatus });
	} catch (error) {
		return json({ ok: false, error: 'Failed to update segment review status' }, { status: 500 });
	}
};
