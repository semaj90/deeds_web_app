/**
 * POST /api/chat/memory/backfill — embed existing Postgres chat_messages → Qdrant.
 *
 * One-shot repair for chat sessions that were written to Postgres BEFORE the
 * recall pipeline was wired. Walks chat_messages in chat_id + created_at order,
 * embeds each via Ollama, and upserts to the Qdrant chat_messages collection.
 *
 * Skips messages that are:
 *   - role = 'system' (no retrieval value)
 *   - content shorter than 8 chars
 *   - already indexed (checked by deterministic id hash)
 *
 * Streams SSE progress events: `{ processed, skipped, failed, total }`.
 *
 * Query params:
 *   limit   — max messages to process (default 500, max 5000)
 *   dryRun  — preview only, no writes (default false)
 *   since   — ISO timestamp, only messages created_at >= since
 *
 * Auth: requires locals.user.role === 'admin'.
 */

import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import { indexChatMessage, hashToQdrantId } from '$lib/server/ace/chat-memory.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBED_MODEL = 'embeddinggemma:latest';
const QDRANT_URL = ENV.QDRANT_URL;

interface ChatRow {
	id: string;
	chat_id: string;
	role: string;
	content: string;
	created_at: Date | string;
}

export const POST: RequestHandler = async ({ url, locals }) => {
	if (locals.user?.role !== 'admin') {
		return new Response(JSON.stringify({ error: 'Forbidden' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit') ?? 500)));
	const dryRun = url.searchParams.get('dryRun') === '1';
	const since = url.searchParams.get('since');

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: string, data: unknown) => {
				try {
					controller.enqueue(new TextEncoder().encode(sseFormat(event, data)));
				} catch {
					/* stream closed */
				}
			};

			try {
				// 1. Query candidates
				const rows = await fetchCandidates(limit, since);
				send('start', {
					candidates: rows.length,
					dryRun,
					limit,
					since: since ?? null,
				});

				if (rows.length === 0) {
					send('complete', { processed: 0, skipped: 0, failed: 0 });
					controller.close();
					return;
				}

				// 2. Pre-check which IDs already exist in Qdrant (batch lookup)
				const qdrantIds = rows.map((r) => hashToQdrantId(r.id));
				const alreadyIndexed = await checkExistingIds(qdrantIds);

				let processed = 0;
				let skipped = 0;
				let failed = 0;

				for (const row of rows) {
					const qid = hashToQdrantId(row.id);
					const content = (row.content ?? '').toString();

					if (row.role === 'system' || content.trim().length < 8) {
						skipped++;
						continue;
					}

					if (alreadyIndexed.has(qid)) {
						skipped++;
						continue;
					}

					if (dryRun) {
						processed++;
						if (processed % 20 === 0) {
							send('progress', { processed, skipped, failed, total: rows.length });
						}
						continue;
					}

					const ok = await embedAndUpsert(qid, row, content);
					if (ok) processed++;
					else failed++;

					if ((processed + failed) % 10 === 0) {
						send('progress', { processed, skipped, failed, total: rows.length });
					}
				}

				send('complete', { processed, skipped, failed, total: rows.length, dryRun });
				controller.close();
			} catch (err) {
				send('error', { message: (err as Error)?.message ?? 'backfill failed' });
				controller.close();
			}
		},
	});

	return new Response(stream, { headers: sseHeaders() });
};

async function fetchCandidates(limit: number, since: string | null): Promise<ChatRow[]> {
	try {
		const whereClause = since
			? sql`WHERE role <> 'system' AND LENGTH(content) >= 8 AND created_at >= ${since}::timestamptz`
			: sql`WHERE role <> 'system' AND LENGTH(content) >= 8`;

		const result = await db.execute(sql`
			SELECT id, chat_id, role::text AS role, content, created_at
			FROM chat_messages
			${whereClause}
			ORDER BY created_at ASC
			LIMIT ${limit}
		`);

		const rows = (result as unknown as { rows?: ChatRow[] }).rows ?? [];
		return rows;
	} catch (err) {
		console.warn('[backfill] fetch candidates failed:', (err as Error)?.message);
		return [];
	}
}

/** Batch-check which Qdrant IDs already exist. Returns a Set for O(1) lookup. */
async function checkExistingIds(ids: number[]): Promise<Set<number>> {
	const found = new Set<number>();
	if (ids.length === 0) return found;

	try {
		// Qdrant limits batch size; chunk into 500s
		for (let i = 0; i < ids.length; i += 500) {
			const batch = ids.slice(i, i + 500);
			const res = await fetch(`${QDRANT_URL}/collections/chat_messages/points`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: batch, with_payload: false, with_vector: false }),
				signal: AbortSignal.timeout(10000),
			});
			if (!res.ok) continue;
			const data = (await res.json()) as { result?: Array<{ id: string | number }> };
			for (const pt of data.result ?? []) {
				const n = typeof pt.id === 'number' ? pt.id : Number(pt.id);
				if (!Number.isNaN(n)) found.add(n);
			}
		}
	} catch {
		/* non-fatal — on error assume none indexed */
	}
	return found;
}

async function embedAndUpsert(
	qdrantId: number,
	row: ChatRow,
	content: string,
): Promise<boolean> {
	try {
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBED_MODEL, prompt: content.slice(0, 2000) }),
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) return false;
		const data = (await res.json()) as { embedding?: number[] };
		if (!data.embedding?.length) return false;

		const ts =
			row.created_at instanceof Date
				? row.created_at.getTime()
				: Date.parse(String(row.created_at)) || Date.now();

		return await indexChatMessage(
			{
				id: qdrantId,
				sessionId: row.chat_id,
				role: row.role,
				content: content.slice(0, 2000),
				timestamp: ts,
			},
			data.embedding,
		);
	} catch {
		return false;
	}
}
