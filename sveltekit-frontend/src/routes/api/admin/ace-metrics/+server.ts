import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getKVBudgetSummary, getTokenUsageStats } from '$lib/server/ai/token-tracker.js';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sinceDaysParam = url.searchParams.get('since_days');
  const sinceDays = sinceDaysParam ? Number(sinceDaysParam) : 1;
  const sessionId = url.searchParams.get('session_id') ?? undefined;

  try {
    const tokenUsage = await getTokenUsageStats({
      userId: locals.user?.id,
      sinceDaysAgo: Number.isFinite(sinceDays) && sinceDays > 0 ? sinceDays : 1,
    });

    const kvBudget = sessionId ? await getKVBudgetSummary(sessionId) : null;

    return json({
      success: true,
      sinceDays: Number.isFinite(sinceDays) && sinceDays > 0 ? sinceDays : 1,
      tokenUsage,
      kvBudget,
      advisory: {
        acePacketMaxTokens: 4000,
        acePacketShrinkTarget: 3500,
        reservedCompletionTokens: 1024,
      },
    });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};
