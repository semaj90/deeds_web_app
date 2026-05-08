/**
 * GET /api/ace/recommendations
 *
 * HTTP wrapper around `contextForFile()`. Same data the MCP tool
 * `codebase.context_for_file` returns — accessible to UI components and
 * non-MCP clients (curl, browser, /admin pages).
 *
 * Auth: requires locals.user (degraded GET contract — error path returns
 * empty defaults with the same top-level keys as success).
 *
 * Query params (one required):
 *   filePath  string  full path of a single file
 *   dirPath   string  directory to summarise (returns directory atlas only)
 *   cluster   string  cluster_key (e.g. "gpu:50")
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { contextForFile, type CodebaseContextForFile } from '$lib/server/atlas/context-for-file.js';
import { buildPromptCards }                              from '$lib/server/atlas/prompt-mapper.js';
import { loadAtlasSummary }                               from '$lib/server/atlas/atlas-loader.js';

const querySchema = z.object({
  filePath:  z.string().min(1).max(500).optional(),
  dirPath:   z.string().min(1).max(500).optional(),
  cluster:   z.string().min(1).max(200).optional(),
  topoClass: z.string().min(1).max(100).optional(),
  maxCards:  z.coerce.number().int().min(1).max(30).optional().default(8),
}).refine(
  q => !!(q.filePath || q.dirPath || q.cluster || q.topoClass),
  { message: 'one of filePath / dirPath / cluster / topoClass required' },
);

// Empty-defaults shape for the degraded path (matches the real interface)
const EMPTY: CodebaseContextForFile = {
  filePath: '',
  normalizedPath: '',
  directory: {
    path: '', rank: 0, topo: [], clusters: [], tools: [], tags: [],
    constraints: [],
  },
  file: { rank: 0, reasons: [] },
  promptCards: [],
  recommendedActions: [],
  provenance: { atlas: 'empty', sources: [] },
};

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) {
    return json({ ...EMPTY, error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json({
      ...EMPTY,
      error: 'invalid_params',
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    }, { status: 400 });
  }

  const { filePath, dirPath, cluster, topoClass, maxCards } = parsed.data;

  try {
    // File-scoped — full context_for_file response
    if (filePath) {
      const ctx = await contextForFile(filePath, { peerLimit: maxCards });
      return json(ctx);
    }

    // Directory / cluster / topoClass scope — return only the prompt-card slice
    // (no per-file context, since the caller didn't name a file).
    const promptCards = await buildPromptCards({
      topN: maxCards,
      filter: {
        agentsDir: dirPath,
        cluster,
        topoClass,
      },
    });
    const summary = await loadAtlasSummary().catch(() => null);

    return json({
      ...EMPTY,
      filePath: '',
      directory: {
        ...EMPTY.directory,
        path: dirPath ?? '',
        rank: 0,
        clusters: cluster ? [cluster] : [],
        topo:     topoClass ? [topoClass] : [],
      },
      promptCards,
      provenance: {
        atlas:       'redis',
        generatedAt: summary?.generated_at,
        files:       summary?.files,
        clusters:    summary?.clusters,
        sources:     ['atlas:redis', 'prompt:filtered'],
      },
    });
  } catch (err) {
    return json({
      ...EMPTY,
      error: String(err instanceof Error ? err.message : err).slice(0, 300),
    });
  }
};
