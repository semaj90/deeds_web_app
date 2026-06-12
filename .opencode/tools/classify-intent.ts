import { z } from 'zod';

/**
 * STUB: Classify intent from user prompt.
 *
 * Note: This is a development-time stub in .opencode/ (gitignored).
 * Not currently wired to the active MCP server.
 * To activate: add to src/mcp/server.ts tool definitions and handlers.
 */

export async function classifyIntent(input: {
  prompt: string;
  context?: string;
}) {
  const text = `${input.prompt} ${input.context ?? ''}`.toLowerCase();

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

  return {
    intent,
    domain,
    subdomain,
    confidence: 0.65,
    safeNextCommand: `rg -n "error|fail" src/lib/server/ace/ --type ts`,
  };
}
