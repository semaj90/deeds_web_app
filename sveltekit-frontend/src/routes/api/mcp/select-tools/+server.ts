/**
 * POST /api/mcp/select-tools
 *
 * Dynamic MCP tool selection via a bounded selector helper.
 * The selector keeps:
 * - an always-include core set
 * - a small recent-tool LRU
 * - optional bootstrap expansion for the first turns
 * - Qdrant-backed discovery when embeddings are available
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { selectToolsForQuery } from '$lib/server/ai/tool-selection.js';

const SelectToolsSchema = z.object({
  query: z.string().min(1).max(4000),
  top_k: z.number().int().min(1).max(30).optional().default(12),
  domain: z.string().optional(),
  bootstrap: z.boolean().optional().default(false),
});

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = SelectToolsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const selection = await selectToolsForQuery(parsed.data);

  return json({
    ...selection,
  });
};
