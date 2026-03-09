/**
 * Phase49 – Agentic Tool Bindings for Code Graph Search & Autofix
 * ---------------------------------------------------------------
 * Enables Gemma3-Legal or any RAG agent to query / rank / suggest fixes
 * using the Phase47 GPU Graph Analyzer.
 */

export const agentTools = {
  /** Search similar TypeScript errors via Qdrant/Neo4j graph */
  'code.error.graph.search': async ({ query }: { query: string }) => {
    const res = await fetch('http://127.0.0.1:8093/query_similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Search failed ${res.status}`);
    return await res.json();
  },

  /** Rank most frequent / impactful error codes */
  'code.error.rank': async ({ code }: { code: string }) => {
    const res = await fetch('http://127.0.0.1:8093/rank_errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(`Rank failed ${res.status}`);
    return await res.json();
  },

  /** Request model-generated autofix for a given graph node */
  'code.error.autofix': async ({ nodeId }: { nodeId: string }) => {
    const res = await fetch('http://127.0.0.1:8093/suggest_fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId }),
    });
    if (!res.ok) throw new Error(`Autofix failed ${res.status}`);
    return await res.json();
  },
};
