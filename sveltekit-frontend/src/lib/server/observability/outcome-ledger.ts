import { promises as fs } from 'fs';
import path from 'path';

const LEDGER_REL = '.opencode/outcome-ledger.ndjson';

function ledgerPath(): string {
  return path.join(process.cwd(), LEDGER_REL);
}

/**
 * Compute a reward score [0..1] for a gemma4-agent run.
 *
 * Scoring rubric:
 *   +0.25  used at least one tool (meaningful retrieval)
 *   +0.20  no tool error (clean execution)
 *   +0.20  hasSideEffect === false (read-only = safe, auditable)
 *   +0.15  completed in ≤3 rounds (efficient)
 *   +0.20  final answer / recommendation exists
 *   cap [0..1]
 */
export function computeAgentReward(opts: {
  finalAnswerFound: boolean;
  rounds: number;
  maxRounds: number;
  toolsUsed: string[];
  hasSideEffect: boolean;
  cacheHit: boolean;
  toolError?: boolean;
}): { reward: number; reward_reason: string } {
  let r = 0;
  const parts: string[] = [];

  if (opts.toolsUsed.length > 0) { r += 0.25; parts.push(`tools=${opts.toolsUsed.length}`); }
  if (!opts.toolError) { r += 0.20; parts.push('no_tool_error'); }
  if (!opts.hasSideEffect) { r += 0.20; parts.push('read_only'); }
  if (opts.rounds <= 3) { r += 0.15; parts.push(`rounds=${opts.rounds}`); }
  if (opts.finalAnswerFound) { r += 0.20; parts.push('final_answer'); }

  return {
    reward: Math.max(0, Math.min(1, r)),
    reward_reason: parts.join(',') || 'no_signal',
  };
}

/**
 * Compute a reward score [0..1] for a context-assembler retrieval run.
 *
 * Scoring rubric:
 *   +0.30  has source_refs (grounded in codebase)
 *   +0.20  totalFound > 0 (non-empty retrieval)
 *   +0.15  cacheHit (prior answer reused = high-confidence path)
 *   +0.15  budgetTier != 'empty' (not degraded)
 *   +0.20  selected/context payloads exist (chunks delivered to LLM)
 *   cap [0..1]
 */
export function computeRetrievalReward(opts: {
  totalFound: number;
  sourceRefs: string[];
  featureId?: string | null;
  budgetTier?: string | null;
  cacheHit?: boolean;
  hasContext?: boolean;
}): { reward: number; reward_reason: string } {
  let r = 0;
  const parts: string[] = [];

  if (opts.sourceRefs.length > 0) { r += 0.30; parts.push(`sourceRefs=${opts.sourceRefs.length}`); }
  if (opts.totalFound > 0) { r += 0.20; parts.push(`totalFound=${opts.totalFound}`); }
  if (opts.cacheHit) { r += 0.15; parts.push('cacheHit'); }
  if (opts.budgetTier && opts.budgetTier !== 'empty') { r += 0.15; parts.push(`budgetTier=${opts.budgetTier}`); }
  if (opts.hasContext) { r += 0.20; parts.push('has_context'); }

  return {
    reward: Math.max(0, Math.min(1, r)),
    reward_reason: parts.join(',') || 'no_signal',
  };
}

export async function appendOutcomeLedger(event: Record<string, unknown>): Promise<void> {
  try {
    const p = ledgerPath();
    await fs.mkdir(path.dirname(p), { recursive: true });

    // Map outcome string to reward scores if reward not already set
    let reward = event.reward;
    if (reward === undefined || reward === null) {
      if (typeof event.outcome === 'string') {
        const outcome = event.outcome.toLowerCase();
        if (outcome === 'success') {
          reward = 1.0;
        } else if (outcome === 'partial') {
          reward = 0.5;
        } else if (outcome === 'failure') {
          reward = 0.0;
        } else if (outcome === 'pending') {
          reward = null;
        }
      }
    }

    const out = JSON.stringify({ ...event, reward, ts: new Date().toISOString() }) + '\n';
    await fs.appendFile(p, out, { encoding: 'utf8' });
  } catch (err) {
    // Non-fatal observability helper — swallow errors
    console.warn('[OutcomeLedger] append failed:', (err as Error)?.message ?? err);
  }
}
