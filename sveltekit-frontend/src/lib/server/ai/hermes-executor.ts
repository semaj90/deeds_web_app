/**
 * Hermes Executor — dispatches high-level Skill calls from a HermesPlan
 * via the HermesDispatcher (Layer 2).
 */

import type { HermesPlan } from './hermes-planner.js';
import { hermesDispatcher, type SkillResult } from './hermes/dispatcher.js';

// ── Result types ──────────────────────────────────────────────────────────────

export interface ToolResult {
  tool:        string;
  ok:          boolean;
  data:        unknown;
  durationMs:  number;
  error?:      string;
}

export interface ExecutionResult {
  results:        ToolResult[]; // Flattened skill results
  totalDurationMs: number;
  toolsExecuted:  number;
  toolsFailed:    number;
  skillResults:   SkillResult[];
}

interface ToolContext {
  userQuery: string;
  caseId?:   string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute all skills in a HermesPlan concurrently via the HermesDispatcher.
 * Never throws — individual skill/tool failures are captured in SkillResult.
 */
export async function executeHermesPlan(
  plan:    HermesPlan,
  context: ToolContext
): Promise<ExecutionResult> {
  const t0 = performance.now();

  // Map HermesPlan tools (which are now Skill IDs) to Dispatcher format
  const skillRequests = plan.tools.map(t => ({
    id: t.name,
    input: { 
      ...t.arguments,
      query: t.arguments.query || context.userQuery 
    }
  }));

  // Dispatch skills
  const skillResults = await hermesDispatcher.executeBatch(skillRequests, context);

  // Flatten tool results for backward compatibility with existing ACE pipeline
  const flattenedResults: ToolResult[] = [];
  let toolsExecuted = 0;
  let toolsFailed = 0;

  for (const sr of skillResults) {
    for (const tr of sr.toolResults) {
      flattenedResults.push(tr);
      toolsExecuted++;
      if (!tr.ok) toolsFailed++;
    }
  }

  return {
    results: flattenedResults,
    totalDurationMs: performance.now() - t0,
    toolsExecuted,
    toolsFailed,
    skillResults
  };
}
