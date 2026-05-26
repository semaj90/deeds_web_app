/**
 * ldr_research Tool Handler
 *
 * Fully-wired ToolResult handler for Local Deep Research (LDR).
 * Integrates with ldr-client.ts for Redis caching + polling.
 *
 * Strategy:
 *   1. Check Redis for cached result (ldr:result:{hash})
 *   2. If miss — start new research task and poll up to 3 minutes
 *   3. Return LdrResearchResult formatted as ToolResult<LdrResearchResult>
 *
 * Registered as `ldr_research` in toolRegistry.
 */

import { z } from 'zod';
import {
  toolRegistry,
  type ToolResult,
} from '../registry.js';
import {
  startLdrResearch,
  pollLdrTask,
  searchLdrHistory,
  ldrQuickSummary,
  type LdrResearchResult,
} from '$lib/server/analytics/ldr-client.js';

// ── Zod Schema ────────────────────────────────────────────────────────────────

export const LdrResearchRequestSchema = z.object({
  run_id: z.string().min(8),
  query: z.string().min(3).max(2000).describe('Research question or topic'),
  mode: z.enum(['async', 'quick', 'cache_only']).default('async').optional()
    .describe('async: start+poll (up to 3min); quick: synchronous 15s summary; cache_only: return cached result or null'),
  max_iterations: z.number().int().min(1).max(10).default(3).optional()
    .describe('Number of research rounds (async mode only)'),
  search_engines: z.array(z.string()).default(['searxng', 'wikipedia']).optional(),
  poll_timeout_ms: z.number().int().min(5000).max(180_000).default(120_000).optional()
    .describe('Max ms to poll for async result before returning partial'),
});

export type LdrResearchRequest = z.infer<typeof LdrResearchRequestSchema>;

// ── Handler ───────────────────────────────────────────────────────────────────

async function ldrResearchHandler(
  request: LdrResearchRequest,
): Promise<ToolResult<LdrResearchResult | { partial: true; taskId: string | null; message: string }>> {
  const startTime = Date.now();
  const mode = request.mode ?? 'async';

  // ── Mode: cache_only ────────────────────────────────────────────────────────
  if (mode === 'cache_only') {
    const cached = await searchLdrHistory(request.query);
    if (cached) {
      return {
        success: true,
        run_id: request.run_id,
        tool: 'ldr_research',
        data: cached,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      success: false,
      run_id: request.run_id,
      tool: 'ldr_research',
      error: 'No cached result found for this query',
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Mode: quick ─────────────────────────────────────────────────────────────
  if (mode === 'quick') {
    // Check cache first
    const cached = await searchLdrHistory(request.query);
    if (cached) {
      return {
        success: true,
        run_id: request.run_id,
        tool: 'ldr_research',
        data: cached,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    const summary = await ldrQuickSummary(request.query);
    if (!summary) {
      return {
        success: false,
        run_id: request.run_id,
        tool: 'ldr_research',
        error: 'Quick summary failed — LDR may be unavailable',
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    const result: LdrResearchResult = {
      taskId: 'quick',
      query: request.query,
      queryHash: '',
      status: 'completed',
      summary,
      sources: [],
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    return {
      success: true,
      run_id: request.run_id,
      tool: 'ldr_research',
      data: result,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Mode: async (default) ───────────────────────────────────────────────────

  // 1. Check cache
  const cached = await searchLdrHistory(request.query);
  if (cached && cached.status === 'cached') {
    return {
      success: true,
      run_id: request.run_id,
      tool: 'ldr_research',
      data: cached,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Start new research task
  const taskRef = await startLdrResearch(request.query, {
    maxIterations: request.max_iterations ?? 3,
    searchEngines: request.search_engines ?? ['searxng', 'wikipedia'],
  });

  if (!taskRef) {
    return {
      success: false,
      run_id: request.run_id,
      tool: 'ldr_research',
      error: 'Failed to start LDR research task — is the LDR container running on port 5000?',
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // 3. Poll until completed or timeout
  const pollTimeout = request.poll_timeout_ms ?? 120_000;
  const pollInterval = 4_000; // 4s intervals
  const maxAttempts = Math.ceil(pollTimeout / pollInterval);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval));

    const result = await pollLdrTask(taskRef.taskId);
    if (result) {
      return {
        success: true,
        run_id: request.run_id,
        tool: 'ldr_research',
        data: result,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // 4. Timeout — return partial
  return {
    success: false,
    run_id: request.run_id,
    tool: 'ldr_research',
    data: {
      partial: true,
      taskId: taskRef.taskId,
      message: `Research task started but did not complete within ${pollTimeout}ms. Poll taskId "${taskRef.taskId}" manually.`,
    },
    error: `Polling timeout after ${pollTimeout}ms`,
    duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// ── Register ──────────────────────────────────────────────────────────────────

toolRegistry.register({
  name: 'ldr_research',
  description: 'Run Local Deep Research using Gemma4 + SearXNG + Wikipedia. Supports async polling, quick one-shot, and cache-only modes. Returns summary, sources, and structured sections.',
  schema: LdrResearchRequestSchema,
  permissions: ['network'],
  handler: ldrResearchHandler,
});

export { ldrResearchHandler };
