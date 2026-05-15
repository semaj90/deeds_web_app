/**
 * GET /api/rag/todo-suggestions?userId=<uuid>&caseId=<uuid>&limit=5
 *
 * Predictive to-do list based on search patterns.
 *
 * Strategy:
 *   1. Pull the user's last 50 searches from rag_query_log (last 7 days)
 *   2. Group by extracted entity (statute / case citation)
 *   3. For each entity searched ≥ 3 times, generate a "you've been researching X"
 *      suggestion with a linked action (add to case, create note, run synthesis)
 *   4. Also surface top global entities from Redis for context
 *
 * Response:
 *   {
 *     todos: [{
 *       id: string,
 *       title: string,
 *       reason: string,          // "You searched this 5 times recently"
 *       entity: string,          // the statute/case text
 *       entityType: 'statute'|'case'|'query',
 *       searchCount: number,
 *       suggestedAction: 'synthesize'|'add_to_case'|'create_note'|'review_evidence',
 *       actionUrl: string,       // deep-link into the app
 *       priority: 'high'|'medium'|'low',
 *     }],
 *     searchVolume: number,      // total searches in last 7 days
 *     uniqueEntities: number,
 *   }
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const querySchema = z.object({
  caseId: z.string().uuid().optional(),
  limit:  z.coerce.number().int().min(1).max(20).optional().default(5),
  days:   z.coerce.number().int().min(1).max(30).optional().default(7),
});

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = querySchema.safeParse({
    caseId: url.searchParams.get('caseId') ?? undefined,
    limit:  url.searchParams.get('limit') ?? 5,
    days:   url.searchParams.get('days') ?? 7,
  });
  if (!parsed.success) return json({ error: 'Invalid params' }, { status: 400 });

  const { caseId, limit, days } = parsed.data;
  const userId = locals.user.id;

  // ── 1. Recent queries from rag_query_log ────────────────────────────────
  const entityCountMap = new Map<string, { type: 'statute' | 'case'; count: number; queries: string[] }>();
  const queryCountMap  = new Map<string, { count: number; lastQuery: string }>();
  let searchVolume = 0;

  try {
    const { db } = await import('$lib/server/db/client');
    const { sql: drizzleSql, gte, and, eq } = await import('drizzle-orm');
    const { ragQueryLog } = await import('$lib/server/db/schema.js');

    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await db
      .select({
        query:           ragQueryLog.query,
        queryHash:       ragQueryLog.queryHash,
        entityStatutes:  ragQueryLog.entityStatutes,
        entityCases:     ragQueryLog.entityCases,
        totalFound:      ragQueryLog.totalFound,
        createdAt:       ragQueryLog.createdAt,
      })
      .from(ragQueryLog)
      .where(
        and(
          eq(ragQueryLog.userId, userId),
          gte(ragQueryLog.createdAt, since),
        )
      )
      .orderBy(drizzleSql`created_at DESC`)
      .limit(100);

    searchVolume = rows.length;

    for (const row of rows) {
      // Aggregate entity frequencies
      for (const s of (row.entityStatutes as string[] | null) ?? []) {
        const key = `statute:${s}`;
        const existing = entityCountMap.get(key) ?? { type: 'statute' as const, count: 0, queries: [] };
        existing.count++;
        if (!existing.queries.includes(row.query)) existing.queries.push(row.query);
        entityCountMap.set(key, existing);
      }
      for (const c of (row.entityCases as string[] | null) ?? []) {
        const key = `case:${c}`;
        const existing = entityCountMap.get(key) ?? { type: 'case' as const, count: 0, queries: [] };
        existing.count++;
        if (!existing.queries.includes(row.query)) existing.queries.push(row.query);
        entityCountMap.set(key, existing);
      }
      // Aggregate query hash frequencies (for repeat-query detection)
      const qh = row.queryHash ?? '';
      if (qh) {
        const existing = queryCountMap.get(qh) ?? { count: 0, lastQuery: row.query };
        existing.count++;
        queryCountMap.set(qh, existing);
      }
    }
  } catch {
    // DB unavailable — degrade gracefully
  }

  // ── 2. Also pull global trending entities from Redis ─────────────────────
  const globalTrending: Array<{ entity: string; type: 'statute' | 'case'; globalFreq: number }> = [];
  try {
    const redis = getRedis();
    const statutes = await redis.zrevrange('search:entity:statute', 0, 4, 'WITHSCORES');
    const cases    = await redis.zrevrange('search:entity:case', 0, 4, 'WITHSCORES');
    for (let i = 0; i < statutes.length - 1; i += 2) {
      globalTrending.push({ entity: statutes[i], type: 'statute', globalFreq: parseFloat(statutes[i + 1]) });
    }
    for (let i = 0; i < cases.length - 1; i += 2) {
      globalTrending.push({ entity: cases[i], type: 'case', globalFreq: parseFloat(cases[i + 1]) });
    }
  } catch {
    // Non-fatal
  }

  // ── 3. Generate to-do items ──────────────────────────────────────────────

  interface TodoItem {
    id: string;
    title: string;
    reason: string;
    entity: string;
    entityType: 'statute' | 'case' | 'query';
    searchCount: number;
    suggestedAction: 'synthesize' | 'add_to_case' | 'create_note' | 'review_evidence';
    actionUrl: string;
    priority: 'high' | 'medium' | 'low';
  }

  const todos: TodoItem[] = [];

  // High-frequency entity searches → suggest synthesis or case note
  for (const [key, data] of entityCountMap.entries()) {
    if (data.count < 2) continue; // skip one-offs
    const entityText = key.replace(/^(statute|case):/, '');
    const priority: 'high' | 'medium' | 'low' = data.count >= 5 ? 'high' : data.count >= 3 ? 'medium' : 'low';
    const action: 'synthesize' | 'add_to_case' | 'create_note' = data.type === 'statute' ? 'synthesize' : 'add_to_case';
    const actionUrl = caseId
      ? data.type === 'statute'
        ? `/cases/${caseId}?tab=synthesis&query=${encodeURIComponent(entityText)}`
        : `/cases/${caseId}?tab=notes&mention=${encodeURIComponent(entityText)}`
      : `/global-search?q=${encodeURIComponent(entityText)}`;

    todos.push({
      id: `entity-${key.replace(/[^a-z0-9]/gi, '-')}`,
      title: data.type === 'statute'
        ? `Research ${entityText}`
        : `Review case authority: ${entityText.slice(0, 60)}`,
      reason: `You searched for this ${data.count} time${data.count !== 1 ? 's' : ''} in the last ${days} days`,
      entity: entityText,
      entityType: data.type,
      searchCount: data.count,
      suggestedAction: action,
      actionUrl,
      priority,
    });
  }

  // Repeat exact queries → suggest creating a standing note
  for (const [, data] of queryCountMap.entries()) {
    if (data.count < 3) continue;
    todos.push({
      id: `query-${data.lastQuery.slice(0, 20).replace(/\W/g, '-')}`,
      title: `Save search: "${data.lastQuery.slice(0, 50)}"`,
      reason: `You've run this exact search ${data.count} times — consider saving as a case note`,
      entity: data.lastQuery,
      entityType: 'query',
      searchCount: data.count,
      suggestedAction: 'create_note',
      actionUrl: caseId
        ? `/cases/${caseId}?tab=notes&content=${encodeURIComponent(data.lastQuery)}`
        : `/command-center?q=${encodeURIComponent(data.lastQuery)}`,
      priority: 'medium',
    });
  }

  // Sort: high first, then by searchCount desc
  todos.sort((a, b) => {
    const pRank = { high: 3, medium: 2, low: 1 };
    const pr = pRank[b.priority] - pRank[a.priority];
    return pr !== 0 ? pr : b.searchCount - a.searchCount;
  });

  return json({
    todos: todos.slice(0, limit),
    searchVolume,
    uniqueEntities: entityCountMap.size,
    globalTrending: globalTrending.slice(0, 5),
    periodDays: days,
  });
};
