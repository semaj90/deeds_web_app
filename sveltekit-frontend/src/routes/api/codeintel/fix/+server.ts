/**
 * POST /api/codeintel/fix
 *
 * Body (JSON):
 *   error         string  — error message / compiler diagnostic (required)
 *   filePath      string  — file where error occurred (optional)
 *   line          number  — line number (optional)
 *   codeSnippet   string  — surrounding code (optional, max 800 chars)
 *   framework     string  — "svelte5" | "sveltekit" | "drizzle" | etc. (optional)
 *   topK          number  — max recommendations, 1-6 (default 3)
 *   includeClusterSummary boolean (default true)
 *
 * Response shape:
 *   { ok, recommendations[], clusterContext?, diagnostics, error? }
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getFixRecommendations } from '$lib/server/codeintel/fix-recommender.js';

const bodySchema = z.object({
  error: z.string().min(1).max(2000),
  filePath: z.string().max(500).optional(),
  line: z.number().int().positive().optional(),
  codeSnippet: z.string().max(2000).optional(),
  framework: z.string().max(50).optional(),
  topK: z.number().int().min(1).max(6).default(3),
  includeClusterSummary: z.boolean().default(true),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized', recommendations: [] }, { status: 401 });

  const raw = await request.json().catch(() => null);
  if (!raw) return json({ ok: false, error: 'Invalid JSON body', recommendations: [] }, { status: 400 });

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation error', recommendations: [] },
      { status: 400 }
    );
  }

  const result = await getFixRecommendations(parsed.data);
  return json(result, { status: result.ok ? 200 : 207 });
};
