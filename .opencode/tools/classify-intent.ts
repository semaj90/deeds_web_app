import { tool } from 'ai';
import { z } from 'zod';

/**
 * Classify a user prompt into intent + domain + safe next action.
 * Used as the first step in any Gemma4 agentic loop.
 *
 * Rule: TurboVec reranks candidates — it does NOT read files directly.
 * Rule: Every schema field has a .describe() so the model knows what to pass.
 */
export const classifyIntent = tool({
  description:
    'Classify a user prompt into intent (repair/research/planning), domain ' +
    '(retrieval/graph/agent-workflow/general), and produce a safe next shell command ' +
    'that gathers evidence without modifying any files.',
  parameters: z.object({
    prompt: z.string().describe('The raw user prompt or error message to classify.'),
    context: z
      .string()
      .optional()
      .describe(
        'Optional extra context such as a file path, error type, or current phase label.',
      ),
  }),
  execute: async ({ prompt, context }) => {
    const text = (prompt + ' ' + (context ?? '')).toLowerCase();

    const domain: string = text.includes('qdrant') || text.includes('embedding')
      ? 'retrieval'
      : text.includes('graph') || text.includes('topology') || text.includes('neo4j')
        ? 'graph'
        : text.includes('opencode') || text.includes('tool') || text.includes('skill')
          ? 'agent-workflow'
          : text.includes('ace') || text.includes('packet') || text.includes('card')
            ? 'retrieval'
            : 'general';

    const intent: string = text.includes('error') || text.includes('fix') || text.includes('fail')
      ? 'repair'
      : text.includes('search') || text.includes('find') || text.includes('why')
        ? 'research'
        : 'planning';

    const subdomain: string = text.includes('ace') || text.includes('rank')
      ? 'ace-pipeline'
      : text.includes('schema') || text.includes('zod')
        ? 'tool-schema'
        : text.includes('redis')
          ? 'cache'
          : 'unknown';

    const safeNextCommand =
      intent === 'repair'
        ? `rg -n "error|fail|undefined|null" scripts/ingest/ src/lib/server/ace/ --type ts --type mjs`
        : domain === 'retrieval'
          ? `node scripts/ingest/cache-ace-packet.mjs --audit`
          : domain === 'graph'
            ? `rg -n "BELONGS_TO_CLUSTER|IMPORTS|topology" src/lib/server/graph/ --type ts`
            : `rg -rn "${prompt.split(' ').slice(0, 3).join('|')}" scripts/ src/ --type ts --type mjs`;

    return {
      intent,
      domain,
      subdomain,
      confidence: subdomain !== 'unknown' ? 0.85 : 0.65,
      safeNextCommand,
    };
  },
});
