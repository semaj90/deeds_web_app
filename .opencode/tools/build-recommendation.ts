import { tool } from 'ai';
import { z } from 'zod';

/**
 * Produce a structured repair or research recommendation from evidence gathered
 * by classify-intent + build-agentic-rag-context.
 *
 * This is the final step in the agentic loop before the operator executes a fix.
 * Output follows the error-inference-research skill output contract exactly.
 */
export const buildRecommendation = tool({
  description:
    'Produce a structured recommendation (likely_cause, evidence, patch_targets, ' +
    'safe_next_command, do_not_do) from classified intent + RAG context. ' +
    'Use after classify_intent and build_agentic_rag_context have run. ' +
    'Output is safe to show to the operator for approval before any file is changed.',
  parameters: z.object({
    intent: z
      .enum(['repair', 'research', 'planning'])
      .describe('The intent classification from classify_intent.'),
    domain: z
      .string()
      .describe('The domain from classify_intent (e.g. "retrieval", "graph").'),
    errorSummary: z
      .string()
      .describe('One-sentence description of the error or question to resolve.'),
    evidenceLines: z
      .array(z.string())
      .describe(
        'List of evidence items: file:line refs, Redis keys, rg matches, or ACE card titles ' +
        'that confirm the root cause. At least 1 required.',
      ),
    patchTargets: z
      .array(z.string())
      .describe(
        'Exact file paths (relative to repo root) that need to change. Empty array if no patch needed.',
      ),
    proposedFix: z
      .string()
      .optional()
      .describe('Optional one-line description of the proposed code change.'),
  }),
  execute: async ({
    intent,
    domain,
    errorSummary,
    evidenceLines,
    patchTargets,
    proposedFix,
  }) => {
    const safeNextCommand =
      intent === 'repair' && patchTargets.length > 0
        ? `node --check ${patchTargets[0]}`
        : intent === 'repair'
          ? 'npm run svelte-check 2>&1 | head -30'
          : domain === 'retrieval'
            ? 'npm run ingest:pipeline'
            : 'npm run smoke:opencode';

    const doNotDo: string[] = [];
    if (intent === 'repair') {
      doNotDo.push('Do not run drizzle-kit push without operator review');
      doNotDo.push('Do not delete or archive files without checking G1-G9 import gates');
    }
    if (domain === 'retrieval') {
      doNotDo.push('Do not clear Redis ace:packet:latest without running ingest:pipeline first');
    }
    doNotDo.push('Do not assume the fix succeeded — re-run the validator after patching');

    return {
      likely_cause: errorSummary,
      evidence: evidenceLines,
      patch_targets: patchTargets,
      proposed_fix: proposedFix ?? null,
      safe_next_command: safeNextCommand,
      do_not_do: doNotDo,
      intent,
      domain,
    };
  },
});
