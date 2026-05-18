/**
 * AI Token Usage Tracker — fire-and-forget persistence of LLM token counts.
 *
 * Usage:
 *   trackTokenUsage({ endpoint: '/api/chat', model: 'gemma4-legal:latest',
 *     promptTokens: 150, completionTokens: 287, durationMs: 1200 });
 *
 * All writes are non-blocking and non-fatal (errors logged, never thrown).
 */
import { db }           from '$lib/server/db/client';
import { aiUsageLog }   from '$lib/server/db/schema-postgres';
import { sql, desc, eq } from 'drizzle-orm';
import { getRedis }      from '$lib/server/redis.js';

export interface TokenUsageParams {
	userId?: string | number;
	endpoint: string;
	model: string;
	promptTokens?: number;
	completionTokens?: number;
	durationMs?: number;
	cached?: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget token usage insert. Never throws.
 */
export function trackTokenUsage(params: TokenUsageParams): void {
	const promptTokens = params.promptTokens ?? 0;
	const completionTokens = params.completionTokens ?? 0;

	const dbUserId = params.userId !== undefined && params.userId !== null ? Number(params.userId) : null;

	db.insert(aiUsageLog)
		.values({
			userId: dbUserId,
			endpoint: params.endpoint,
			model: params.model,
			promptTokens,
			completionTokens,
			totalTokens: promptTokens + completionTokens,
			durationMs: params.durationMs ?? null,
			cached: params.cached ?? false,
			metadata: params.metadata ?? null,
		})
		.then(() => {})
		.catch((err) => {
			console.warn('[TokenTracker] Failed to log usage:', (err as Error).message);
		});
}

/**
 * Extract token counts from an Ollama response object.
 * Ollama returns prompt_eval_count + eval_count on non-streaming completions.
 */
export function extractOllamaTokens(data: Record<string, unknown>): {
	promptTokens: number;
	completionTokens: number;
} {
	const promptTokens = typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : 0;
	const completionTokens = typeof data.eval_count === 'number' ? data.eval_count : 0;
	return { promptTokens, completionTokens };
}

// ── KV Cache token budget tracker ─────────────────────────────────────────────

const KV_BUDGET_KEY   = 'kv:budget:';
const KV_BUDGET_TTL   = 60 * 60; // 1h per session

export interface KVCacheTokenEvent {
  sessionId:       string;
  model:           string;
  toolRound:       number;
  prefixTokens:    number;   // system prompt + preamble (reused from KV prefix cache)
  newTokens:       number;   // tokens added this round (tool call results)
  summaryTokens:   number;   // tokens after MLA compression
  savedTokens:     number;   // newTokens - summaryTokens
  prefixCacheHit:  boolean;  // whether cache_prompt=true reused the prefix KV
  totalBudget:     number;
}

/**
 * Record a KV cache token budget event. Fire-and-forget.
 * Accumulates per-session totals in Redis for dashboard display.
 */
export function trackKVCacheEvent(ev: KVCacheTokenEvent): void {
  const key = `${KV_BUDGET_KEY}${ev.sessionId}`;
  (async () => {
    try {
      const redis = getRedis();
      await redis.hincrby(key, 'total_new_tokens',     ev.newTokens);
      await redis.hincrby(key, 'total_summary_tokens', ev.summaryTokens);
      await redis.hincrby(key, 'total_saved_tokens',   ev.savedTokens);
      await redis.hincrby(key, 'tool_rounds',          1);
      if (ev.prefixCacheHit) await redis.hincrby(key, 'prefix_cache_hits', 1);
      await redis.expire(key, KV_BUDGET_TTL);

      // Persist to Postgres ai_usage_log with extended metadata
      trackTokenUsage({
        endpoint: `agent:tool_round:${ev.toolRound}`,
        model:    ev.model,
        promptTokens:     ev.prefixTokens + ev.newTokens,
        completionTokens: 0,
        cached:           ev.prefixCacheHit,
        metadata: {
          kv_analysis: true,
          prefix_tokens:   ev.prefixTokens,
          summary_tokens:  ev.summaryTokens,
          saved_tokens:    ev.savedTokens,
          total_budget:    ev.totalBudget,
          tool_round:      ev.toolRound,
        },
      });
    } catch { /* non-fatal */ }
  })();
}

/**
 * Get KV budget summary for a session (for YorHA metadata block).
 */
export async function getKVBudgetSummary(sessionId: string): Promise<{
  totalNewTokens:    number;
  totalSavedTokens:  number;
  toolRounds:        number;
  prefixCacheHits:   number;
  compressionRatio:  number;
} | null> {
  try {
    const redis = getRedis();
    const raw   = await redis.hgetall(`${KV_BUDGET_KEY}${sessionId}`);
    if (!raw || !Object.keys(raw).length) return null;
    const newT   = parseInt(raw.total_new_tokens     ?? '0', 10);
    const savT   = parseInt(raw.total_saved_tokens   ?? '0', 10);
    const sumT   = parseInt(raw.total_summary_tokens ?? '0', 10);
    const rounds = parseInt(raw.tool_rounds          ?? '0', 10);
    const hits   = parseInt(raw.prefix_cache_hits    ?? '0', 10);
    return {
      totalNewTokens:   newT,
      totalSavedTokens: savT,
      toolRounds:       rounds,
      prefixCacheHits:  hits,
      compressionRatio: sumT > 0 ? newT / sumT : 1,
    };
  } catch { return null; }
}

/**
 * Get aggregated token usage stats for a user or globally.
 */
export async function getTokenUsageStats(options?: {
	userId?: string | number;
	sinceDaysAgo?: number;
}): Promise<{
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalTokens: number;
	requestCount: number;
	avgDurationMs: number;
	byModel: Array<{ model: string; tokens: number; count: number }>;
}> {
	const sinceDate = new Date();
	sinceDate.setDate(sinceDate.getDate() - (options?.sinceDaysAgo ?? 30));

	try {
		const conditions = [sql`${aiUsageLog.createdAt} >= ${sinceDate.toISOString()}`];
		if (options?.userId) {
			conditions.push(eq(aiUsageLog.userId, Number(options.userId)));
		}
		const whereClause = conditions.length > 1
			? sql`${conditions[0]} AND ${conditions[1]}`
			: conditions[0];

		const [totals] = await db.select({
			totalPromptTokens: sql<number>`coalesce(sum(${aiUsageLog.promptTokens}), 0)::int`,
			totalCompletionTokens: sql<number>`coalesce(sum(${aiUsageLog.completionTokens}), 0)::int`,
			totalTokens: sql<number>`coalesce(sum(${aiUsageLog.totalTokens}), 0)::int`,
			requestCount: sql<number>`count(*)::int`,
			avgDurationMs: sql<number>`coalesce(avg(${aiUsageLog.durationMs}), 0)::int`,
		}).from(aiUsageLog).where(whereClause);

		const byModel = await db.select({
			model: aiUsageLog.model,
			tokens: sql<number>`coalesce(sum(${aiUsageLog.totalTokens}), 0)::int`,
			count: sql<number>`count(*)::int`,
		}).from(aiUsageLog)
			.where(whereClause)
			.groupBy(aiUsageLog.model)
			.orderBy(desc(sql`sum(${aiUsageLog.totalTokens})`));

		return {
			totalPromptTokens: totals?.totalPromptTokens ?? 0,
			totalCompletionTokens: totals?.totalCompletionTokens ?? 0,
			totalTokens: totals?.totalTokens ?? 0,
			requestCount: totals?.requestCount ?? 0,
			avgDurationMs: totals?.avgDurationMs ?? 0,
			byModel: byModel ?? [],
		};
	} catch (err) {
		console.warn('[TokenTracker] Stats query failed:', (err as Error).message);
		return { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, requestCount: 0, avgDurationMs: 0, byModel: [] };
	}
}
