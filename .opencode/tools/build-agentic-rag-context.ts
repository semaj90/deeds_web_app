/**
 * STUB: Build a compact RAG context packet from the ACE cache.
 *
 * Note: This is a development-time stub in .opencode/ (gitignored).
 * Not currently wired to the active MCP server.
 * To activate: add to src/mcp/server.ts tool definitions and handlers.
 */

export async function buildAgenticRagContext(input: {
  query: string;
  maxCards?: number;
  domainFilter?: string;
}) {
  const maxCards = input.maxCards ?? 20;
  const query = input.query;

  // Stub: return empty context packet
  return {
    ok: true,
    query,
    cards: [],
    promptPacket: `[ACE CONTEXT — 0 cards for query: "${query}"]`,
    sourceRefs: [],
    totalCards: 0,
  };
}
