/**
 * Batch Error Analysis — parallel concurrent agentic fix planning
 *
 * Reads codebase-graph.json hotspots → builds independent Gemma4 agent
 * tasks (one per directory/file) → dispatches with p-limit concurrency
 * gate so we don't OOM the GPU on parallel tool-calling rounds.
 *
 * Pipeline:
 *   getAuditHotspots(N)          ← graph-intel.ts (reads codebase-graph.json)
 *   ↓
 *   buildBatchTasks(hotspots)    ← one BatchTask per hotspot dir
 *   ↓
 *   runBatchErrorAnalysis()      ← p-limit(BATCH_CONCURRENCY) gate
 *   ↓
 *   per-task: runGemma4Agent()   ← agent uses graph_search, wiki_note_lookup,
 *                                  read_file, audit_hotspots tools to produce
 *                                  a concrete fix plan
 *   ↓
 *   yields { taskId, status, result, durationMs } via async iterator —
 *   caller can stream progress events (SSE) as each task completes.
 */

import pLimit from 'p-limit';
import { runGemma4Agent, type AgentRunResult } from '$lib/server/ai/gemma4-agent.js';
import { getAuditHotspots, type AuditHotspot }  from '$lib/server/graph/graph-intel.js';

// ── Concurrency: Gemma4 VLM is VRAM-bound; 3 parallel agent loops max ─────────
const BATCH_CONCURRENCY = Number(process.env.BATCH_FIX_CONCURRENCY ?? 3);

// ── Public types ──────────────────────────────────────────────────────────────

export interface BatchTask {
  id:       string;          // stable ID — used for SSE event correlation
  dir:      string;
  reason:   string[];        // ['low-score(45)', 'todos(7)', 'auth-gap(3/5)']
  query:    string;          // pre-built prompt for the agent
  metadata: Record<string, unknown>;
}

export type BatchTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BatchTaskResult {
  taskId:     string;
  dir:        string;
  status:     BatchTaskStatus;
  startedAt:  number;
  completedAt?: number;
  durationMs?: number;
  result?:    AgentRunResult;
  error?:     string;
}

// ── Task builder ──────────────────────────────────────────────────────────────

function buildPromptForHotspot(h: AuditHotspot): string {
  return [
    `# Codebase audit hotspot — directory \`${h.dir}\``,
    ``,
    `**Audit score:** ${h.score} (lower = more attention needed)`,
    `**Reasons flagged:** ${h.reason.join(', ')}`,
    `**File count:** ${h.fileCount}`,
    `**TODO/FIXME markers:** ${h.todos}`,
    `**API routes missing auth guard:** ${h.authGaps}`,
    `**Top tags:** ${h.tags.join(', ')}`,
    ``,
    `## Your task`,
    `Produce a concrete, actionable fix plan for this directory. Use the available tools:`,
    `  1. \`graph_search\` — find specific files in this directory and their tags`,
    `  2. \`wiki_note_lookup\` — read the AI-written summary for this dir if available`,
    `  3. \`read_file\` — inspect the files needing changes`,
    `  4. \`audit_hotspots\` — check if related directories have similar issues`,
    ``,
    `Return a numbered list of specific fixes (file path + line range + change). `,
    `Prioritize: missing auth guards > TODOs in production code > low-score issues.`,
    `Do NOT use apply_shadow_patch — this is a planning pass, not an edit pass.`,
  ].join('\n');
}

/**
 * Convert audit hotspots into independent agent tasks.
 * Each task is self-contained — they can run in parallel.
 */
export function buildBatchTasks(hotspots: AuditHotspot[]): BatchTask[] {
  return hotspots.map((h, i) => ({
    id:     `batch-fix-${i}-${h.dir.replace(/[^a-z0-9]/gi, '_')}`,
    dir:    h.dir,
    reason: h.reason,
    query:  buildPromptForHotspot(h),
    metadata: {
      source:    'batch-error-analysis',
      dir:       h.dir,
      reason:    h.reason,
      auditScore: h.score,
      fileCount:  h.fileCount,
      todos:      h.todos,
      authGaps:   h.authGaps,
    },
  }));
}

// ── Batch runner with concurrency gate ────────────────────────────────────────

export interface RunBatchOptions {
  userId?:        string;
  sessionId?:     string;
  concurrency?:   number;       // override BATCH_CONCURRENCY
  bypassCache?:   boolean;
  perTaskTimeoutMs?: number;
}

/**
 * Async generator that yields task results as they complete.
 * Tasks run in parallel up to `concurrency` at a time.
 *
 * Failure of one task does NOT abort others — each is independent.
 *
 *   for await (const result of runBatchErrorAnalysis(tasks, opts)) {
 *     // emit SSE event per result.taskId
 *   }
 */
export async function* runBatchErrorAnalysis(
  tasks:    BatchTask[],
  options:  RunBatchOptions = {},
): AsyncGenerator<BatchTaskResult, void, unknown> {
  const limit = pLimit(options.concurrency ?? BATCH_CONCURRENCY);

  // Kick off all tasks (gated) — yields ordered by completion, not submission.
  const inflight = new Map<string, Promise<BatchTaskResult>>();
  for (const task of tasks) {
    const startedAt = Date.now();
    const p = limit(async (): Promise<BatchTaskResult> => {
      try {
        const result = await runGemma4Agent(task.query, {
          systemPrompt: 'You are a codebase fix-planning assistant. Use the provided tools to gather context, then produce a concrete fix plan. Be terse.',
          pipeline:     'batch-fix',
          userId:       options.userId,
          sessionId:    options.sessionId,
          bypassCache:  options.bypassCache ?? false,
          metadata:     task.metadata,
        });
        const completedAt = Date.now();
        return {
          taskId:    task.id,
          dir:       task.dir,
          status:    'completed',
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          result,
        };
      } catch (err) {
        const completedAt = Date.now();
        return {
          taskId:    task.id,
          dir:       task.dir,
          status:    'failed',
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          error:     (err as Error).message,
        };
      }
    });
    inflight.set(task.id, p);
  }

  // Yield as each promise resolves (in completion order, not submission order).
  while (inflight.size) {
    const settled = await Promise.race(
      [...inflight.entries()].map(async ([id, p]) => {
        const r = await p;
        return [id, r] as const;
      })
    );
    inflight.delete(settled[0]);
    yield settled[1];
  }
}

/**
 * Convenience: collect all batch results into a single array.
 * Use the generator form for streaming progress.
 */
export async function runBatchErrorAnalysisAll(
  tasks:   BatchTask[],
  options: RunBatchOptions = {},
): Promise<BatchTaskResult[]> {
  const results: BatchTaskResult[] = [];
  for await (const r of runBatchErrorAnalysis(tasks, options)) {
    results.push(r);
  }
  return results;
}

/**
 * One-shot: load top-N hotspots from the graph, build tasks, run them.
 */
export async function runBatchFromGraph(
  topN:    number = 5,
  options: RunBatchOptions = {},
): Promise<{ tasks: BatchTask[]; results: BatchTaskResult[] }> {
  const hotspots = await getAuditHotspots(topN);
  const tasks    = buildBatchTasks(hotspots);
  const results  = await runBatchErrorAnalysisAll(tasks, options);
  return { tasks, results };
}
