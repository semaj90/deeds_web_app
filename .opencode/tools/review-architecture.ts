/**
 * STUB: Review architecture notes and plans.
 *
 * Note: This is a development-time stub in .opencode/ (gitignored).
 * Not currently wired to the active MCP server.
 * To activate: add to src/mcp/server.ts tool definitions and handlers.
 */

export async function reviewArchitecture(input: {
  prompt: string;
  document: string;
  context?: string;
}) {
  const text = `${input.prompt}\n${input.context ?? ''}\n${input.document}`.toLowerCase();

  const mentions = {
    postgres: /postgres|pgvector|drizzle/.test(text),
    qdrant: /qdrant|hnsw|embedding|vector/.test(text),
    neo4j: /neo4j|graph|relationship|topology/.test(text),
    redis: /redis|cache|valkey/.test(text),
  };

  const risks = [
    mentions.postgres && 'Schema migrations must be reversible',
    mentions.qdrant && 'Vector collections must have durable backups',
    mentions.neo4j && 'Graph projections must be validated before use',
  ].filter(Boolean);

  return {
    verdict: 'Stub implementation — requires detailed review',
    domain: Object.entries(mentions).filter(([, v]) => v)[0]?.[0] ?? 'general',
    confidence: 0.3,
    summary: `Document mentions: ${Object.entries(mentions).filter(([, v]) => v).map(([k]) => k).join(', ') || 'general topics'}`,
    risks,
    safeNextCommand: 'npm run audit:architecture',
    recommendation: 'Review this plan with the team before applying to production',
  };
}
