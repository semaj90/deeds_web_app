/**
 * Code-Path LLM-Output Index API
 *
 * GET    /api/codebase-index/llm-output?path=<p>          → single hit
 * GET    /api/codebase-index/llm-output?paths=a,b,c       → bulk hits
 * GET    /api/codebase-index/llm-output?stats=1           → aggregate stats
 * GET    /api/codebase-index/llm-output?cluster=<n>       → all paths in cluster
 * POST   /api/codebase-index/llm-output                   → record a hit
 * DELETE /api/codebase-index/llm-output?path=<p>          → invalidate a path
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  getLlmOutputHit,
  getLlmOutputHitsBulk,
  recordLlmOutputHit,
  invalidateLlmOutput,
  getLlmIndexStats,
  getCachedPathsForCluster,
  getHottestPaths,
  searchLlmOutputsBySimilarity,
  getClusterHitDensity,
} from '$lib/server/cache/code-llm-index.js';

const recordSchema = z.object({
  path:           z.string().min(1).max(500),
  llmOutput:      z.string().min(1).max(64_000),
  query:          z.string().max(4000).optional(),
  source:         z.enum(['ace', 'gemma4-summary', 'kag', 'rag', 'agent', 'other']).optional(),
  glyphClusterId: z.number().int().min(0).optional(),
  tokenCount:     z.number().int().min(0).optional(),
  isDir:          z.boolean().optional(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  if (url.searchParams.get('stats') === '1') {
    return json(await getLlmIndexStats());
  }

  const hottest = url.searchParams.get('hottest');
  if (hottest !== null) {
    const limit = Math.min(Math.max(Number(hottest) || 20, 1), 100);
    return json({ hottest: await getHottestPaths(limit) });
  }

  if (url.searchParams.get('clusterStats') === '1') {
    return json({ clusterHits: await getClusterHitDensity() });
  }

  const q = url.searchParams.get('q');
  if (q) {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 50);
    const results = await searchLlmOutputsBySimilarity(q, limit);
    return json({ q, count: results.length, results });
  }

  const cluster = url.searchParams.get('cluster');
  if (cluster !== null) {
    const id = Number(cluster);
    if (!Number.isFinite(id) || id < 0) {
      return json({ error: 'Invalid cluster' }, { status: 400 });
    }
    const entries = await getCachedPathsForCluster(id);
    return json({ clusterId: id, count: entries.length, entries });
  }

  const paths = url.searchParams.get('paths');
  if (paths) {
    const list = paths.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    const hits = await getLlmOutputHitsBulk(list);
    return json({
      requested: list.length,
      hits:      hits.filter((h) => h !== null).length,
      entries:   list.map((p, i) => ({ path: p, entry: hits[i] })),
    });
  }

  const path = url.searchParams.get('path');
  if (!path) return json({ error: 'Missing ?path or ?paths or ?stats=1' }, { status: 400 });

  const entry = await getLlmOutputHit(path);
  return json({ path, entry, hit: entry !== null });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });

  const entry = await recordLlmOutputHit(parsed.data.path, parsed.data.llmOutput, parsed.data);
  return json({ ok: true, entry });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const path = url.searchParams.get('path');
  if (!path) return json({ error: 'Missing ?path' }, { status: 400 });

  const removed = await invalidateLlmOutput(path);
  return json({ ok: true, removed });
};