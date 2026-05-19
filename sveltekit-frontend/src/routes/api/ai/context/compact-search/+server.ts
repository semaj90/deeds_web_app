import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { callTraceMcp } from '$lib/server/mcp/trace-http.js';

const compactSearchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(8).optional().default(3),
  tokenBudget: z.number().int().min(200).max(3000).optional().default(1200),
  includeFullText: z.boolean().optional().default(false),
  useCache: z.boolean().optional().default(true),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const parsed = compactSearchSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 }
    );
  }

  const { query, limit, tokenBudget, includeFullText, useCache } = parsed.data;
  const toolResult = await callTraceMcp('ace.compact_search', {
    query,
    limit,
    tokenBudget,
    includeFullText,
    useCache,
  });

  if (!toolResult.ok) {
    console.error('[/api/ai/context/compact-search] TRACE MCP error:', toolResult.error);
    return json(
      { error: toolResult.error ?? 'TRACE MCP unavailable' },
      { status: 503 }
    );
  }

  return json({
    ok: true,
    elapsedMs: toolResult.ms,
    result: toolResult.data,
  });
};
