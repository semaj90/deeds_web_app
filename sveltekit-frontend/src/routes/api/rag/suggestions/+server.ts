/**
 * GET /api/rag/suggestions?q=<partial>&limit=8&caseId=<uuid>
 *
 * "Did you mean" suggestions powered by two signals:
 *   1. Redis search:freq sorted set — most-searched query hashes (raw frequency)
 *   2. pgvector ANN on rag_query_log.query_embedding — semantically nearest past queries
 *
 * Response:
 *   {
 *     suggestions: [{ query, score, frequency, source }]
 *     topEntities: { statutes: string[], cases: string[] }
 *     predictive: boolean  // true when embedding ANN was used
 *   }
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const querySchema = z.object({
  q:     z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
  caseId: z.string().uuid().optional(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = querySchema.safeParse({
    q:      url.searchParams.get('q') ?? undefined,
    limit:  url.searchParams.get('limit') ?? 8,
    caseId: url.searchParams.get('caseId') ?? undefined,
  });
  if (!parsed.success) return json({ error: 'Invalid params' }, { status: 400 });

  const { q: partialQuery, limit, caseId } = parsed.data;

  // ── 1. Top frequency queries from Redis ─────────────────────────────────
  const freqSuggestions: Array<{ query: string; score: number; frequency: number; source: string }> = [];
  try {
    const redis = getRedis();
    // Get top-N hashes by frequency (ZREVRANGE returns highest first)
    const topHashes = await redis.zrevrange('search:freq', 0, limit * 2 - 1, 'WITHSCORES');
    for (let i = 0; i < topHashes.length - 1; i += 2) {
      const qHash = topHashes[i];
      const freq  = parseFloat(topHashes[i + 1]);
      const meta  = await redis.hgetall(`search:query:${qHash}`);
      if (meta?.text) {
        // If partial query provided, filter by prefix/substring match
        const text = String(meta.text);
        if (!partialQuery || text.toLowerCase().includes(partialQuery.toLowerCase())) {
          freqSuggestions.push({
            query: text,
            score: Math.min(1, freq / 10), // normalize — 10 searches ≈ score 1.0
            frequency: freq,
            source: 'frequency',
          });
        }
      }
      if (freqSuggestions.length >= limit) break;
    }
  } catch {
    // Redis unavailable — skip frequency suggestions
  }

  // ── 2. Semantic ANN suggestions from pgvector rag_query_log ─────────────
  // Only when a partial query is provided and long enough to embed meaningfully
  const annSuggestions: Array<{ query: string; score: number; frequency: number; source: string }> = [];
  let predictive = false;
  if (partialQuery && partialQuery.length >= 6) {
    try {
      const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
      const emb = await generateEmbeddings([partialQuery]);
      if (emb.vectors[0]?.length === 768) {
        const { db } = await import('$lib/server/db/client');
        const { sql: drizzleSql } = await import('drizzle-orm');
        // Cosine ANN via halfvec operator <=>
        // Cast the JS array to halfvec literal for the WHERE clause
        const vecLiteral = `[${emb.vectors[0].join(',')}]`;
        const rows = await db.execute(drizzleSql`
          SELECT DISTINCT ON (query_hash)
            query,
            query_hash,
            1 - (query_embedding <=> ${vecLiteral}::halfvec(768)) AS similarity,
            COUNT(*) OVER (PARTITION BY query_hash) AS freq
          FROM rag_query_log
          WHERE query_embedding IS NOT NULL
            ${caseId ? drizzleSql`AND case_id = ${caseId}::uuid` : drizzleSql``}
          ORDER BY query_hash, similarity DESC
          LIMIT ${limit * 2}
        `);
        predictive = true;
        for (const row of rows.rows as Array<{ query: string; similarity: number; freq: number }>) {
          const sim = typeof row.similarity === 'number' ? row.similarity : 0;
          if (sim < 0.5) continue; // too dissimilar
          // Avoid duplicating what we already have from Redis
          const alreadyHave = freqSuggestions.some(s => s.query === row.query);
          if (!alreadyHave) {
            annSuggestions.push({
              query: row.query,
              score: sim,
              frequency: Number(row.freq ?? 1),
              source: 'semantic',
            });
          }
        }
      }
    } catch {
      // Non-fatal — DB or embedding unavailable
    }
  }

  // ── 3. Top searched entities ─────────────────────────────────────────────
  const topEntities: { statutes: string[]; cases: string[] } = { statutes: [], cases: [] };
  try {
    const redis = getRedis();
    const topStatutes = await redis.zrevrange('search:entity:statute', 0, 4);
    const topCases    = await redis.zrevrange('search:entity:case', 0, 4);
    topEntities.statutes = topStatutes.map(String);
    topEntities.cases    = topCases.map(String);
  } catch {
    // Non-fatal
  }

  // ── 4. Merge + rank ──────────────────────────────────────────────────────
  const merged = [...freqSuggestions, ...annSuggestions]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return json({
    suggestions: merged,
    topEntities,
    predictive,
    partial: partialQuery ?? null,
  });
};
