/**
 * POST /api/mcp/select-tools
 *
 * Dynamic MCP tool selection via Qdrant semantic search over tool_manifest packets.
 *
 * Given a natural-language query, embeds it and searches codebase_chunks_768
 * filtered to packet_kind='tool_manifest', returns the top-K tool definitions
 * ready to pass as tools[] to llama-server.exe.
 *
 * Response shape:
 *   {
 *     mcp_names:   string[]        — dot-separated MCP tool names
 *     llama_names: string[]        — __-separated llama-server names
 *     tool_defs:   ToolDefinition[] — OpenAI-format function definitions for tools[]
 *     signals:     string[]        — detected ontology signals
 *     embed_ok:    boolean
 *     source:      'qdrant' | 'fallback'
 *   }
 */

import { json }    from '@sveltejs/kit';
import { z }       from 'zod';
import { ENV }     from '$lib/server/env.server.js';
import type { RequestHandler } from './$types';

// ── Request schema ────────────────────────────────────────────────────────────
const SelectToolsSchema = z.object({
  query:  z.string().min(1).max(4000),
  top_k:  z.number().int().min(1).max(30).optional().default(12),
  domain: z.string().optional(), // optional domain hint: 'code' | 'legal' | 'graph' | ...
});

// ── LLAMA_TOOL_DEFINITIONS (subset kept in sync with llama-tool-definitions.ts) ─
// Indexed by MCP name for fast lookup.  The selector returns only what Qdrant picks.
const TOOL_DEF_REGISTRY: Record<string, object> = {
  'search.dev_context': {
    type: 'function',
    function: {
      name: 'search__dev_context',
      description: 'Search the codebase for context relevant to a coding or debugging query. Returns ranked chunks with file paths and line references.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' }, hotFiles: { type: 'string' } }, required: ['query'] },
    },
  },
  'codebase.rg_search': {
    type: 'function',
    function: {
      name: 'codebase__rg_search',
      description: 'Controlled ripgrep search over the codebase. Returns line hits from relative repo paths.',
      parameters: { type: 'object', properties: { pattern: { type: 'string' }, glob: { type: 'string' }, limit: { type: 'integer' } }, required: ['pattern'] },
    },
  },
  'graph.expand_neighborhood': {
    type: 'function',
    function: {
      name: 'graph__expand_neighborhood',
      description: 'Expand graph neighborhood from sourceRefs. Returns nodes/edges/sourceRefs/confidence.',
      parameters: { type: 'object', properties: { sourceRefs: { type: 'string' }, depth: { type: 'integer' } }, required: ['sourceRefs'] },
    },
  },
  'graph.shortest_path': {
    type: 'function',
    function: {
      name: 'graph__shortest_path',
      description: 'Find the shortest dependency path between two files or symbols.',
      parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
    },
  },
  'graph.community_for_node': {
    type: 'function',
    function: {
      name: 'graph__community_for_node',
      description: 'Get the GPU cluster, SOM cluster, and community membership for a file.',
      parameters: { type: 'object', properties: { sourceRef: { type: 'string' } }, required: ['sourceRef'] },
    },
  },
  'graph.pagerank_top': {
    type: 'function',
    function: {
      name: 'graph__pagerank_top',
      description: 'Return the top-N highest PageRank nodes (most architecturally central files).',
      parameters: { type: 'object', properties: { limit: { type: 'integer' }, community: { type: 'string' } }, required: [] },
    },
  },
  'topology.search_near': {
    type: 'function',
    function: {
      name: 'topology__search_near',
      description: 'Search the 4D SOM manifold for files near a natural-language query.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    },
  },
  'topology.same_som_cluster': {
    type: 'function',
    function: {
      name: 'topology__same_som_cluster',
      description: 'Find all files sharing the same SOM cluster as the given node.',
      parameters: { type: 'object', properties: { sourceRef: { type: 'string' } }, required: ['sourceRef'] },
    },
  },
  'topology.search_4d': {
    type: 'function',
    function: {
      name: 'topology__search_4d',
      description: 'SOM 4D topology search — find files by SOM coordinates.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    },
  },
  'clusters.get_members': {
    type: 'function',
    function: {
      name: 'clusters__get_members',
      description: 'Get members of a GPU/SOM cluster.',
      parameters: { type: 'object', properties: { cluster_id: { type: 'string' }, limit: { type: 'integer' } }, required: ['cluster_id'] },
    },
  },
  'clusters.get_summary_lenses': {
    type: 'function',
    function: {
      name: 'clusters__get_summary_lenses',
      description: 'Get semantic summary lenses for a cluster.',
      parameters: { type: 'object', properties: { cluster_id: { type: 'string' } }, required: ['cluster_id'] },
    },
  },
  'trace.kag_search': {
    type: 'function',
    function: {
      name: 'trace__kag_search',
      description: 'Search KAG trace memory for prior agent runs and answers.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    },
  },
  'trace.explain_retrieval': {
    type: 'function',
    function: {
      name: 'trace__explain_retrieval',
      description: 'Explain why a specific result was retrieved — cluster dominance, community purpose, grounding signals.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, limit: { type: 'integer' } }, required: ['id'] },
    },
  },
  'context.get_compressed_card': {
    type: 'function',
    function: {
      name: 'context__get_compressed_card',
      description: 'Fetch a compressed ACE context card for a file or feature.',
      parameters: { type: 'object', properties: { source_ref: { type: 'string' } }, required: ['source_ref'] },
    },
  },
  'context.build_kv_packet': {
    type: 'function',
    function: {
      name: 'context__build_kv_packet',
      description: 'Build a KV cache packet from ACE context for efficient prompt reuse.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, source_refs: { type: 'string' } }, required: ['query'] },
    },
  },
  'search.go_hybrid': {
    type: 'function',
    function: {
      name: 'search__go_hybrid',
      description: 'Go search service RRF fusion: parallel FTS + pgvector + Qdrant. Best for broad semantic queries.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' }, collection: { type: 'string' } }, required: ['query'] },
    },
  },
  'kb.search_cards': {
    type: 'function',
    function: {
      name: 'kb__search_cards',
      description: 'Search the knowledge base notecard index.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    },
  },
  'kb.get_card': {
    type: 'function',
    function: {
      name: 'kb__get_card',
      description: 'Fetch a knowledge base notecard by ID or source path.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  'kb.expand_neighbors': {
    type: 'function',
    function: {
      name: 'kb__expand_neighbors',
      description: 'Expand knowledge base notecard graph neighbors.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, limit: { type: 'integer' } }, required: ['id'] },
    },
  },
  'kb.explain_retrieval': {
    type: 'function',
    function: {
      name: 'kb__explain_retrieval',
      description: 'Provide an audit trace for why a specific card was retrieved.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, limit: { type: 'integer' } }, required: ['id'] },
    },
  },
};

const FALLBACK_TOOLS = ['search.dev_context', 'codebase.rg_search', 'trace.kag_search',
                        'graph.expand_neighborhood', 'graph.pagerank_top', 'kb.search_cards'];

// ── Domain signal detection ────────────────────────────────────────────────────
const DOMAIN_SIGNALS: Record<string, string[]> = {
  search:    ['retrieval', 'semantic_search', 'rag'],
  graph:     ['graph', 'neo4j', 'topology'],
  code:      ['code_intel', 'ast', 'symbol'],
  embed:     ['embedding', 'vector', 'inference'],
  legal:     ['legal', 'evidence', 'case_management'],
  cache:     ['cache', 'redis', 'inspection'],
  agent:     ['agent', 'planning', 'reasoning'],
  rank:      ['reranking', 'ranking', 'retrieval'],
  memory:    ['memory', 'prior_answer', 'cache'],
  knowledge: ['knowledge_base', 'wiki', 'notecard'],
  atlas:     ['atlas', 'feature_lookup', 'atlas_indexing'],
  trace:     ['kag', 'trace_memory', 'retrieval'],
  cluster:   ['clustering', 'som', 'topology'],
  mcp:       ['mcp_tools', 'agent', 'planning'],
};

function detectSignals(query: string, domainHint?: string): string[] {
  const q      = query.toLowerCase();
  const active = new Set<string>(['retrieval']); // baseline
  for (const [domain, tags] of Object.entries(DOMAIN_SIGNALS)) {
    if (q.includes(domain) || tags.some(t => q.includes(t.replace('_', ' ')))) {
      tags.forEach(t => active.add(t));
    }
  }
  if (domainHint && DOMAIN_SIGNALS[domainHint]) {
    DOMAIN_SIGNALS[domainHint].forEach(t => active.add(t));
  }
  return [...active];
}

// ── Embed via Ollama ───────────────────────────────────────────────────────────
async function embedQuery(text: string): Promise<number[] | null> {
  const rawHost = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
  const ollamaBase = rawHost.startsWith('http') ? rawHost : `http://${rawHost.includes(':') ? rawHost : `${rawHost}:11434`}`;

  for (const model of ['nomic-embed-text:latest', 'embeddinggemma:latest']) {
    try {
      const res = await fetch(`${ollamaBase}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text.slice(0, 1024) }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const d = await res.json() as { embedding?: number[] };
      if (Array.isArray(d.embedding) && d.embedding.length === 768) return d.embedding;
    } catch { /* try next */ }
  }
  return null;
}

// ── Qdrant tool manifest search ────────────────────────────────────────────────
async function searchToolManifest(
  vector: number[],
  signals: string[],
  topK: number
): Promise<Array<{ tool_name: string; llama_name: string | null; score: number; ontology: string[] }>> {
  const qdrantUrl = ENV.QDRANT_URL || 'http://localhost:6333';

  const body = {
    vector: { name: 'content', vector },
    limit: topK * 2,
    with_payload: true,
    filter: {
      must: [
        { key: 'packet_kind', match: { value: 'tool_manifest' } },
      ],
    },
  };

  try {
    const res = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const d = await res.json() as { result?: Array<{ score: number; payload?: Record<string, unknown> }> };

    const signalSet = new Set(signals);
    return (d.result ?? [])
      .map(hit => {
        const ontology = (hit.payload?.ontology as string[] | undefined) ?? [];
        const boost    = ontology.filter(t => signalSet.has(t)).length * 0.05;
        return {
          tool_name:  String(hit.payload?.tool_name ?? ''),
          llama_name: (hit.payload?.llama_name as string | null) ?? null,
          score:      hit.score + boost,
          ontology,
        };
      })
      .filter(h => h.tool_name.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch {
    return [];
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  const parsed = SelectToolsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { query, top_k, domain } = parsed.data;
  const signals = detectSignals(query, domain);
  const vector  = await embedQuery(query);

  let mcp_names:   string[] = [];
  let llama_names: string[] = [];
  let source: 'qdrant' | 'fallback' = 'fallback';

  if (vector) {
    const hits = await searchToolManifest(vector, signals, top_k);
    const seen = new Set<string>();
    for (const h of hits) {
      if (seen.has(h.tool_name)) continue;
      seen.add(h.tool_name);
      const llamaName = h.llama_name ?? h.tool_name.replace(/\./g, '__');
      mcp_names.push(h.tool_name);
      llama_names.push(llamaName);
    }
    if (mcp_names.length > 0) source = 'qdrant';
  }

  // Fallback to static read-only defaults if Qdrant returns nothing
  if (mcp_names.length === 0) {
    mcp_names   = FALLBACK_TOOLS.slice(0, top_k);
    llama_names = mcp_names.map(n => n.replace(/\./g, '__'));
  }

  // Resolve OpenAI-format tool definitions
  const tool_defs = mcp_names
    .map(n => TOOL_DEF_REGISTRY[n])
    .filter(Boolean);

  return json({
    mcp_names,
    llama_names,
    tool_defs,
    signals,
    embed_ok: vector !== null,
    source,
    top_k,
  });
};
