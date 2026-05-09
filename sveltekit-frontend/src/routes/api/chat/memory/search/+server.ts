/**
 * GET  /api/chat/memory/search — semantic recall inspector (admin-only).
 * GET  /api/chat/memory/search?stats=1 — collection stats + recent points.
 *
 * Admin debugging tool for the ACE chat-memory recall path. Lets you:
 *   - issue a natural-language query and see which past chat messages it recalls
 *   - inspect the Qdrant chat_messages collection's health (point count, vectors dim)
 *   - see the raw score distribution to tune the 0.65 threshold in chat-memory.ts
 *
 * Auth: requires locals.user.role === 'admin'.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client';
import { recallPastChats } from '$lib/server/ace/chat-memory.js';

const QDRANT_URL = ENV.QDRANT_URL;
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

const searchSchema = z.object({
  q: z.string().min(1).max(500),
  scoreThreshold: z.coerce.number().min(0).max(1).default(0.3),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  excludeSessionId: z.string().optional(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
  if (locals.user?.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  // Stats branch
  if (url.searchParams.get('stats') === '1') {
    const stats = await collectStats();
    const recentSessions = await fetchRecentSessions(locals.user.id ?? null);
    return json({ ...stats, recentSessions });
  }

  const parsed = searchSchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    scoreThreshold: url.searchParams.get('scoreThreshold') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    excludeSessionId: url.searchParams.get('excludeSessionId') ?? undefined,
  });
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }

  const { q, scoreThreshold, limit, excludeSessionId } = parsed.data;

  // Embed query
  const t0 = Date.now();
  const embedding = await embedQuery(q);
  const embedMs = Date.now() - t0;
  if (!embedding) {
    return json({ error: 'Embedding service unavailable' }, { status: 503 });
  }

  // Recall
  const t1 = Date.now();
  const hits = await recallPastChats(embedding, {
    excludeSessionId,
    scoreThreshold,
    limit,
  });
  const recallMs = Date.now() - t1;

  return json({
    query: q,
    hits,
    timings: { embedMs, recallMs, totalMs: Date.now() - t0 },
    params: { scoreThreshold, limit, excludeSessionId: excludeSessionId ?? null },
  });
};

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding?.length ? data.embedding : null;
  } catch {
    return null;
  }
}

interface CollectionStats {
  pointsCount: number;
  indexedVectorsCount: number;
  status: string;
  vectorDim: number | null;
  vectorName: string | null;
  sampleRecent: Array<{
    sessionId: string;
    role: string;
    content: string;
    timestamp: number;
  }>;
}

interface RecentSession {
  chatId: string;
  title: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

/** Fetch the admin's 5 most recent chat sessions for the "exclude session" dropdown. */
async function fetchRecentSessions(userId: string | null): Promise<RecentSession[]> {
  if (!userId) return [];
  try {
    const result = await db.execute(sql`
      SELECT chat_id, title, last_message_at, message_count
      FROM chat_metadata
      WHERE user_id = ${userId}::uuid
        AND (is_archived IS NULL OR is_archived <> 'true')
      ORDER BY COALESCE(last_message_at, updated_at) DESC
      LIMIT 5
    `);
    const rows = (result as unknown as { rows?: Array<{
      chat_id: string;
      title: string | null;
      last_message_at: Date | string | null;
      message_count: string | null;
    }> }).rows ?? [];
    return rows.map((r) => ({
      chatId: r.chat_id,
      title: r.title,
      lastMessageAt:
        r.last_message_at instanceof Date
          ? r.last_message_at.toISOString()
          : r.last_message_at,
      messageCount: Number(r.message_count ?? 0),
    }));
  } catch {
    return [];
  }
}

async function collectStats(): Promise<CollectionStats | { error: string }> {
  try {
    const metaRes = await fetch(`${QDRANT_URL}/collections/chat_messages`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!metaRes.ok) return { error: `Qdrant returned ${metaRes.status}` };
    const meta = (await metaRes.json()) as {
      result?: {
        points_count?: number;
        indexed_vectors_count?: number;
        status?: string;
        config?: { params?: { vectors?: Record<string, { size?: number }> } };
      };
    };

    const vectors = meta.result?.config?.params?.vectors ?? {};
    const vectorName = Object.keys(vectors)[0] ?? null;
    const vectorDim = vectorName ? (vectors[vectorName]?.size ?? null) : null;

    // Scroll a few recent points for a visual sanity check
    const scrollRes = await fetch(
      `${QDRANT_URL}/collections/chat_messages/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5, with_payload: true, with_vector: false }),
        signal: AbortSignal.timeout(3000),
      },
    );
    const scrollData = (await scrollRes.json()) as {
      result?: { points?: Array<{ payload?: Record<string, unknown> }> };
    };

    const sampleRecent = (scrollData.result?.points ?? [])
      .map((p) => p.payload ?? {})
      .map((p) => ({
        sessionId: String(p.sessionId ?? ''),
        role: String(p.role ?? ''),
        content: String(p.content ?? '').slice(0, 120),
        timestamp: Number(p.timestamp ?? 0),
      }));

    return {
      pointsCount: Number(meta.result?.points_count ?? 0),
      indexedVectorsCount: Number(meta.result?.indexed_vectors_count ?? 0),
      status: String(meta.result?.status ?? 'unknown'),
      vectorDim,
      vectorName,
      sampleRecent,
    };
  } catch (err) {
    return { error: (err as Error)?.message ?? 'stats fetch failed' };
  }
}
