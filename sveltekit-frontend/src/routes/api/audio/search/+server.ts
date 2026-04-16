/**
 * Audio Segment Search API
 * Timestamp-aware semantic search across Whisper segments in Qdrant audio_segments collection.
 *
 * GET /api/audio/search?q=...&evidenceId=...&caseId=...&limit=10
 *
 * Returns segments with start/end timestamps so the client can seek to the exact moment.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { whisperSegments, audioTranscripts, evidence } from '$lib/server/db/schema-postgres';
import { eq, and, sql, desc } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ url, locals }) => {
	const q = url.searchParams.get('q')?.trim();
	const evidenceId = url.searchParams.get('evidenceId');
	const caseId = url.searchParams.get('caseId');
	const mode = url.searchParams.get('mode') || 'precise'; // 'precise' (segments) or 'coarse' (transcript-level)
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 50);

	if (!q) {
		return json({ segments: [], total: 0, query: '', mode });
	}

	// Validate UUIDs if provided
	if (evidenceId && !UUID_RE.test(evidenceId)) {
		return json({ segments: [], total: 0, query: q });
	}
	if (caseId && !UUID_RE.test(caseId)) {
		return json({ segments: [], total: 0, query: q });
	}

	try {
		// Coarse mode: transcript-level search (evidence_items collection)
		if (mode === 'coarse') {
			const transcripts = await searchTranscripts(q, evidenceId, caseId, limit);
			return json({ segments: transcripts, total: transcripts.length, query: q, mode, source: 'vector' });
		}

		// Precise mode: segment-level with timestamps
		const segments = await searchQdrant(q, evidenceId, caseId, limit);
		if (segments.length > 0) {
			return json({ segments, total: segments.length, query: q, mode, source: 'vector' });
		}

		// Fallback: Drizzle text search on whisper_segments
		const dbSegments = await searchDrizzle(q, evidenceId, caseId, limit);
		return json({ segments: dbSegments, total: dbSegments.length, query: q, mode, source: 'text' });
	} catch {
		return json({ segments: [], total: 0, query: q, mode });
	}
};

async function searchQdrant(
	query: string,
	evidenceId: string | null,
	caseId: string | null,
	limit: number,
): Promise<Array<{
	evidenceId: string;
	segmentIndex: number;
	startMs: number;
	endMs: number;
	text: string;
	score: number;
}>> {
	try {
		// Get embedding for query
		const embedResp = await fetch('http://localhost:11434/api/embeddings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
		});
		if (!embedResp.ok) return [];
		const { embedding } = await embedResp.json();

		// Build Qdrant filter
		const must: Array<Record<string, unknown>> = [];
		if (evidenceId) must.push({ key: 'evidenceId', match: { value: evidenceId } });
		if (caseId) must.push({ key: 'caseId', match: { value: caseId } });

		const searchBody: Record<string, unknown> = {
			vector: { name: 'content', vector: embedding },
			limit,
			with_payload: true,
			score_threshold: 0.5,
		};
		if (must.length > 0) searchBody.filter = { must };

		const resp = await fetch('http://localhost:6333/collections/audio_segments/points/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(searchBody),
		});
		if (!resp.ok) return [];

		const { result } = await resp.json();
		return (result || []).map((hit: any) => ({
			evidenceId: hit.payload?.evidenceId ?? '',
			segmentIndex: hit.payload?.segmentIndex ?? 0,
			startMs: hit.payload?.startMs ?? 0,
			endMs: hit.payload?.endMs ?? 0,
			text: hit.payload?.text ?? '',
			score: hit.score ?? 0,
		}));
	} catch {
		return [];
	}
}

async function searchDrizzle(
	query: string,
	evidenceId: string | null,
	caseId: string | null,
	limit: number,
): Promise<Array<{
	evidenceId: string;
	segmentIndex: number;
	startMs: number;
	endMs: number;
	text: string;
	score: number;
}>> {
	const conditions = [sql`${whisperSegments.text} ILIKE ${'%' + query + '%'}`];
	if (evidenceId) conditions.push(eq(whisperSegments.evidenceId, evidenceId));
	if (caseId) {
		conditions.push(
			sql`${whisperSegments.transcriptId} IN (
				SELECT id FROM audio_transcripts WHERE case_id = ${caseId}
			)`
		);
	}

	const rows = await db
		.select({
			evidenceId: whisperSegments.evidenceId,
			segmentIndex: whisperSegments.segmentIndex,
			startMs: whisperSegments.startMs,
			endMs: whisperSegments.endMs,
			text: whisperSegments.text,
		})
		.from(whisperSegments)
		.where(and(...conditions))
		.limit(limit);

	return rows.map((r) => ({ ...r, score: 1.0 }));
}

/**
 * Coarse search: transcript-level hits from evidence_items collection
 * Returns whole-transcript matches with evidence metadata
 */
async function searchTranscripts(
	query: string,
	evidenceId: string | null,
	caseId: string | null,
	limit: number,
): Promise<Array<{
	evidenceId: string;
	text: string;
	title: string;
	duration: number;
	language: string;
	score: number;
}>> {
	try {
		const embedResp = await fetch('http://localhost:11434/api/embeddings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
		});
		if (!embedResp.ok) return [];
		const { embedding } = await embedResp.json();

		const must: Array<Record<string, unknown>> = [
			{ key: 'type', match: { value: 'audio_transcription' } },
		];
		if (evidenceId) must.push({ key: 'evidenceId', match: { value: evidenceId } });
		if (caseId) must.push({ key: 'caseId', match: { value: caseId } });

		const resp = await fetch('http://localhost:6333/collections/evidence_items/points/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: embedding,
				limit,
				with_payload: true,
				score_threshold: 0.4,
				filter: { must },
			}),
		});
		if (!resp.ok) return [];

		const { result } = await resp.json();
		return (result || []).map((hit: any) => ({
			evidenceId: hit.payload?.evidenceId ?? '',
			text: (hit.payload?.text ?? '').slice(0, 500),
			title: hit.payload?.fileName ?? '',
			duration: hit.payload?.duration ?? 0,
			language: hit.payload?.language ?? 'unknown',
			score: hit.score ?? 0,
		}));
	} catch {
		return [];
	}
}
