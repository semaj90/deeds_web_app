/**
 * AI Token Usage Tracker — fire-and-forget persistence of LLM token counts.
 *
 * Usage:
 *   trackTokenUsage({ endpoint: '/api/chat', model: 'gemma3-legal:latest',
 *     promptTokens: 150, completionTokens: 287, durationMs: 1200 });
 *
 * All writes are non-blocking and non-fatal (errors logged, never thrown).
 */
import { db } from '$lib/server/db/client';
import { aiUsageLog } from '$lib/server/db/schema-postgres';
import { sql, desc, eq } from 'drizzle-orm';

export interface TokenUsageParams {
	userId?: string;
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

	db.insert(aiUsageLog)
		.values({
			userId: params.userId ?? null,
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

/**
 * Get aggregated token usage stats for a user or globally.
 */
export async function getTokenUsageStats(options?: {
	userId?: string;
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
			conditions.push(eq(aiUsageLog.userId, options.userId));
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