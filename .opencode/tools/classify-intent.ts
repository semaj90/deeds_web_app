import { tool } from 'ai';
import { z } from 'zod';

const intentEnum = z.enum(['repair', 'research', 'planning']);
const domainEnum = z.enum(['retrieval', 'graph', 'agent-workflow', 'general']);
const subdomainEnum = z.enum(['ace-pipeline', 'tool-schema', 'cache', 'unknown']);

function safePattern(input: string) {
  return (
    input
      .split(/\s+/)
      .slice(0, 5)
      .map((s) => s.replace(/[^\w.-]/g, ''))
      .filter(Boolean)
      .join('|') || 'TODO|FIXME|error'
  );
}

import { tool } from 'ai';
import { z } from 'zod';

const intentEnum = z.enum(['repair', 'research', 'planning']);
const domainEnum = z.enum(['retrieval', 'graph', 'agent-workflow', 'general']);
const subdomainEnum = z.enum(['ace-pipeline', 'tool-schema', 'cache', 'unknown']);

function safePattern(input: string) {
  return (
    input
      .split(/\s+/)
      .slice(0, 5)
      .map((s) => s.replace(/[^\w.-]/g, ''))
      .filter(Boolean)
      .join('|') || 'TODO|FIXME|error'
  );
}

export const classifyIntent = tool({
  description:
    'Classify a user prompt into intent, domain, subdomain, confidence, and a read-only evidence-gathering command. TurboVec reranks candidates only; it does not read files directly.',

  inputSchema: z.object({
    prompt: z.string().min(1).describe('Raw user prompt or error message to classify.'),
    context: z
      .string()
      .optional()
      .describe('Optional context such as file path, error type, route, or phase label.'),
  }),

  outputSchema: z.object({
    intent: intentEnum.describe('Primary workflow intent.'),
    domain: domainEnum.describe('Primary technical domain.'),
    subdomain: subdomainEnum.describe('More specific subsystem label.'),
    confidence: z.number().min(0).max(1).describe('Classifier confidence.'),
    safeNextCommand: z.string().describe('Read-only command for evidence gathering.'),
    command: z.object({
      bin: z.literal('rg').or(z.literal('node')).describe('Executable name.'),
      args: z.array(z.string()).describe('Command arguments, no shell interpolation.'),
      readOnly: z.literal(true).describe('Whether this command modifies files.'),
    }),
  }),

  execute: async ({ prompt, context }) => {
    const text = `${prompt} ${context ?? ''}`.toLowerCase();

    const domain = /qdrant|embedding|ace|packet|card/.test(text)
      ? 'retrieval'
      : /graph|topology|neo4j/.test(text)
        ? 'graph'
        : /opencode|tool|skill|function/.test(text)
          ? 'agent-workflow'
          : 'general';

    const intent = /error|fix|fail|broken|undefined|null/.test(text)
      ? 'repair'
      : /search|find|why|audit|trace/.test(text)
        ? 'research'
        : 'planning';

    const subdomain = /ace|rank|rerank/.test(text)
      ? 'ace-pipeline'
      : /schema|zod|tool/.test(text)
        ? 'tool-schema'
        : /redis|valkey|cache/.test(text)
          ? 'cache'
          : 'unknown';

    const command =
      intent === 'repair'
        ? {
            bin: 'rg' as const,
            args: [
              '-n',
              'error|fail|undefined|null',
              'scripts/ingest/',
              'src/lib/server/ace/',
              '--type',
              'ts',
              '--type',
              'mjs',
            ],
            readOnly: true as const,
          }
        : domain === 'retrieval'
          ? {
              bin: 'node' as const,
              args: ['scripts/ingest/cache-ace-packet.mjs', '--audit'],
              readOnly: true as const,
            }
          : domain === 'graph'
            ? {
                bin: 'rg' as const,
                args: [
                  '-n',
                  'BELONGS_TO_CLUSTER|IMPORTS|topology',
                  'src/lib/server/graph/',
                  '--type',
                  'ts',
                  '--type',
                  'mjs',
                ],
                readOnly: true as const,
              }
            : {
                bin: 'rg' as const,
                args: [
                  '-n',
                  safePattern(prompt),
                  'scripts/',
                  'src/',
                  '--type',
                  'ts',
                  '--type',
                  'mjs',
                ],
                readOnly: true as const,
              };

    return {
      intent,
      domain,
      subdomain,
      confidence: subdomain !== 'unknown' ? 0.85 : 0.65,
      safeNextCommand: `${command.bin} ${command.args.map((a) => JSON.stringify(a)).join(' ')}`,
      command,
    };
  },
});
