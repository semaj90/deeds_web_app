/**
 * Produce a structured repair or research recommendation from evidence gathered
 * by classify-intent + build-agentic-rag-context.
 */
import { tool } from 'ai';
import { z } from 'zod';

const intentEnum = z.enum(['repair', 'research', 'planning']);
const domainEnum = z.enum(['retrieval', 'graph', 'agent-workflow', 'general']);
const subdomainEnum = z.enum(['ace-pipeline', 'tool-schema', 'cache', 'unknown']);

const inputSchema = z.object({
  intent: intentEnum.describe('The intent classification from classify_intent.'),
  domain: domainEnum.describe('The domain from classify_intent.'),
  subdomain: subdomainEnum.optional().describe('Optional subdomain from classify_intent.'),
  errorSummary: z.string().describe('One-sentence description of the error or question to resolve.'),
  evidenceLines: z.array(z.string()).min(1).describe('Evidence items confirming the root cause.'),
  patchTargets: z.array(z.string()).describe('Exact file paths relative to repo root.'),
  proposedFix: z.string().optional().describe('Optional one-line proposed code change.'),
});

type BuildRecommendationInput = z.infer<typeof inputSchema>;

export const buildRecommendation = tool({
  description:
    'Produce a structured recommendation from classified intent and RAG context. Output is safe to show before any file is changed.',

  parameters: inputSchema,

  execute: async ({
    intent,
    domain,
    subdomain,
    errorSummary,
    evidenceLines,
    patchTargets,
    proposedFix,
  }: BuildRecommendationInput) => {
    const safeNextCommand =
      intent === 'repair' && patchTargets.length > 0
        ? `node --check ${JSON.stringify(patchTargets[0])}`
        : intent === 'repair'
          ? 'npm run check'
          : domain === 'retrieval'
            ? 'npm run ingest:pipeline'
            : 'npm run smoke:opencode';

    const doNotDo = [
      'Do not assume the fix succeeded — re-run the validator after patching',
    ];

    if (intent === 'repair') {
      doNotDo.push('Do not run drizzle-kit push without operator review');
      doNotDo.push('Do not delete or archive files without checking G1-G9 import gates');
    }

    if (domain === 'retrieval') {
      doNotDo.push('Do not clear Redis ace:packet:latest without running ingest:pipeline first');
    }

    return {
      likely_cause: errorSummary,
      evidence: evidenceLines,
      patch_targets: patchTargets,
      proposed_fix: proposedFix ?? null,
      safe_next_command: safeNextCommand,
      do_not_do: doNotDo,
      intent,
      domain,
      subdomain: subdomain ?? 'unknown',
    };
  },
});