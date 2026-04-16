// @vitest-environment node
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { synthesisRuns } from '$lib/server/db/schema-postgres.js';
import { desc, gte, and, isNotNull, sql } from 'drizzle-orm';

interface Citation {
  index: number;
  title: string;
  source: string;
  section?: string;
  text: string;
}

function buildContext(citations: Citation[]): string {
  if (!citations?.length) return '';
  return citations
    .map(
      (c) =>
        `[${c.index}] ${c.title} (${c.source}${c.section ? ', ' + c.section : ''})\n${c.text}`
    )
    .join('\n\n');
}

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ pairs: [], total: 0, format: 'alpaca' }, { status: 401 });
  }

  const rawLimit = parseInt(url.searchParams.get('limit') ?? '200', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 200;

  const rawConfidence = parseFloat(url.searchParams.get('minConfidence') ?? '0.7');
  const minConfidence = Number.isFinite(rawConfidence)
    ? Math.min(Math.max(rawConfidence, 0), 1)
    : 0.7;

  const rawFormat = url.searchParams.get('format') ?? 'alpaca';
  const format: 'alpaca' | 'sharegpt' = rawFormat === 'sharegpt' ? 'sharegpt' : 'alpaca';

  const sinceParam = url.searchParams.get('since');
  const sinceDate = sinceParam ? new Date(sinceParam) : null;

  try {
    const filters = [
      gte(sql`coalesce(${synthesisRuns.confidence}, 0)`, minConfidence),
      isNotNull(synthesisRuns.answer),
    ];

    if (sinceDate && !isNaN(sinceDate.getTime())) {
      filters.push(gte(synthesisRuns.createdAt, sinceDate));
    }

    const rows = await db
      .select()
      .from(synthesisRuns)
      .where(and(...filters))
      .orderBy(desc(synthesisRuns.createdAt))
      .limit(limit);

    const pairs =
      format === 'sharegpt'
        ? rows.map((row) => {
            const context = buildContext(row.citations as Citation[]);
            const humanValue = context
              ? `${row.query}\n\n### Context:\n${context}`
              : (row.query ?? '');
            return {
              conversations: [
                { from: 'human', value: humanValue },
                { from: 'gpt', value: row.answer ?? '' },
              ],
              metadata: {
                id: row.id,
                confidence: row.confidence,
                grpo_reward_score: row.grpoRewardScore,
                model: row.model,
                policy_tier: row.policyTier,
                cache_hit: row.cacheHit,
                latency_ms: row.latencyMs,
                created_at: row.createdAt,
              },
            };
          })
        : rows.map((row) => ({
            instruction: row.query ?? '',
            input: buildContext(row.citations as Citation[]),
            output: row.answer ?? '',
            metadata: {
              id: row.id,
              confidence: row.confidence,
              grpo_reward_score: row.grpoRewardScore,
              model: row.model,
              policy_tier: row.policyTier,
              cache_hit: row.cacheHit,
              latency_ms: row.latencyMs,
              created_at: row.createdAt,
            },
          }));

    return json({
      pairs,
      total: pairs.length,
      format,
      exported_at: new Date().toISOString(),
    });
  } catch (err) {
    return json({
      pairs: [],
      total: 0,
      format,
      error: String(err),
    });
  }
};
