/**
 * llama-tool-definitions.ts
 *
 * Exports the MCP tool allowlist as OpenAI-format tool definitions for
 * llama-server (TurboQuant :8090) function calling.
 *
 * Usage in the Karpathy tool loop:
 *   import { LLAMA_TOOL_DEFINITIONS, llamaToolCall } from './llama-tool-definitions.js';
 *
 *   const response = await fetch('http://turboquant:8090/v1/chat/completions', {
 *     method: 'POST',
 *     body: JSON.stringify({ model: 'gemma4-rotorquant:latest', messages, tools: LLAMA_TOOL_DEFINITIONS }),
 *   });
 *   // response.choices[0].message.tool_calls → dispatch via llamaToolCall()
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LlamaToolFunction {
  name:        string;
  description: string;
  parameters:  {
    type:       'object';
    properties: Record<string, { type: string; description: string; enum?: string[]; default?: unknown; items?: unknown }>;
    required?:  string[];
  };
}

export interface LlamaTool {
  type:     'function';
  function: LlamaToolFunction;
}

export interface LlamaToolCall {
  id:       string;
  type:     'function';
  function: { name: string; arguments: string };
}

// ── Tool definitions (mirrors trace-mcp-server.ts allowlist) ──────────────────

export const LLAMA_TOOL_DEFINITIONS: LlamaTool[] = [
  // ── Dev context (Step 5B default first tool) ────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search__dev_context',
      description:
        'Search the codebase for context relevant to a coding or debugging query. Returns ranked file chunks with stable keys. Call this first for any code question.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language coding/debugging question' },
          filePath: {
            type: 'string',
            description: 'Current file path for scoped boost (optional)',
          },
          limit: { type: 'integer', description: 'Max results (1–20, default 8)' },
          topo_class: { type: 'string', description: 'Topology class filter (optional)' },
        },
        required: ['query'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'codebase__rg_search',
      description:
        'Controlled ripgrep search over the codebase. Returns line hits from relative repo paths and is safe for exact symbol or text lookup.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Ripgrep pattern or literal search string' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional relative repo paths to search (default: ["src"])',
          },
          limit: { type: 'integer', description: 'Max results (default 40, max 200)' },
        },
        required: ['query'],
      },
    },
  },

  // ── Graph tools ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'graph__expand_neighborhood',
      description:
        'Expand graph neighborhood from sourceRefs. Returns nodes/edges/sourceRefs/confidence and compatibility neighbors.',
      parameters: {
        type: 'object',
        properties: {
          sourceRefs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Preferred input: source refs or stable keys to expand from',
          },
          stableKey: {
            type: 'string',
            description: 'Legacy single center stable key (optional when sourceRefs is provided)',
          },
          maxHops: { type: 'integer', description: 'Hop depth 1–2 (default 2)' },
          depth: { type: 'integer', description: 'Legacy alias for maxHops (default 2)' },
          limit: { type: 'integer', description: 'Max neighbors (default 40)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph__shortest_path',
      description: 'Find the shortest dependency path between two files or symbols in Neo4j.',
      parameters: {
        type: 'object',
        properties: {
          fromKey: { type: 'string', description: 'Source node stableKey' },
          toKey: { type: 'string', description: 'Target node stableKey' },
          maxHops: { type: 'integer', description: 'Max path length (default 5)' },
        },
        required: ['fromKey', 'toKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph__community_for_node',
      description: 'Get the GPU cluster, SOM cluster, and community membership for a node.',
      parameters: {
        type: 'object',
        properties: {
          stableKey: { type: 'string', description: 'Node stableKey' },
        },
        required: ['stableKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph__pagerank_top',
      description: 'Return the top-N highest PageRank nodes (most architecturally central files).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Number of top nodes (default 20)' },
          nodeType: { type: 'string', description: 'Filter by Neo4j label e.g. "CodebaseFile"' },
        },
      },
    },
  },

  // ── Topology tools ──────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'topology__search_near',
      description:
        'Search the 4D SOM manifold for files near a natural-language query. Useful for finding semantically similar code across clusters.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language query' },
          radius: { type: 'number', description: '4D Euclidean radius (default 0.25)' },
          limit: { type: 'integer', description: 'Max results (default 20)' },
          somCluster: { type: 'integer', description: 'Optional SOM cluster filter' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'topology__same_som_cluster',
      description:
        'Find all files sharing the same SOM cluster as the given node. Good for finding related implementations.',
      parameters: {
        type: 'object',
        properties: {
          stableKey: { type: 'string', description: 'Reference node stableKey' },
          limit: { type: 'integer', description: 'Max results (default 30)' },
        },
        required: ['stableKey'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'topology__search_4d',
      description:
        "Search using explicit 4D manifold coordinates (SOM grid + semantic + GRPO quality). Use when you know a cluster's SOM position and want structurally adjacent files with optional JSONB filters.",
      parameters: {
        type: 'object',
        properties: {
          som_x: { type: 'number', description: 'SOM X (BMU column)' },
          som_y: { type: 'number', description: 'SOM Y (BMU row)' },
          semantic_z: { type: 'number', description: 'Semantic projection 0–1 (default 0.5)' },
          grpo_w: { type: 'number', description: 'GRPO quality weight 0–1 (default 0.5)' },
          radius: { type: 'number', description: '4D radius (default 0.5)' },
          limit: { type: 'integer', description: 'Max results (default 20)' },
          filters: { type: 'object', description: 'JSONB payload filters' },
        },
        required: ['som_x', 'som_y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search__go_hybrid',
      description:
        'Go search service RRF fusion: parallel FTS + pgvector + Qdrant with reciprocal rank fusion. Faster than in-process hybrid for large-scale recall.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          type: {
            type: 'string',
            description: '"codebase", "legal", or "hybrid" (default: codebase)',
          },
          limit: { type: 'integer', description: 'Max results (default 20)' },
          filters: { type: 'object', description: 'JSONB metadata filters' },
        },
        required: ['query'],
      },
    },
  },

  // ── Cluster tools ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'clusters__get_members',
      description: 'List files in a GPU or directory cluster, sorted by PageRank.',
      parameters: {
        type: 'object',
        properties: {
          clusterKey: {
            type: 'string',
            description: 'Cluster key e.g. "gpu:19" or "dir:src/lib/server/ace"',
          },
          limit: { type: 'integer', description: 'Max files (default 50)' },
        },
        required: ['clusterKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clusters__get_summary_lenses',
      description:
        'Get the LLMS.md wiki summary and KAG notes for a cluster. Fastest way to understand what a cluster does.',
      parameters: {
        type: 'object',
        properties: {
          clusterKey: { type: 'string', description: 'Cluster key' },
        },
        required: ['clusterKey'],
      },
    },
  },

  // ── KAG / retrieval tools ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'trace__kag_search',
      description:
        'Full KAG-DAG retrieval: semantic vector search + knowledge graph expansion + LLMS.md context. Heavier than search__dev_context; use when you need deep context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query or question' },
          filePath: { type: 'string', description: 'Optional file path for scoped context' },
          limit: { type: 'integer', description: 'Max chunks (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trace__explain_retrieval',
      description:
        'Inspect the cached retrieval trace for a previous query. Shows which sources contributed and why.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query string to look up trace for' },
        },
        required: ['query'],
      },
    },
  },

  // ── Context / KV packet tools ───────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'context__get_compressed_card',
      description:
        'Fetch a compressed HCA card for a file or trace. Returns a 128-token summary: one-line description, key symbols, risks. Faster than reading the full file.',
      parameters: {
        type: 'object',
        properties: {
          stableKey: {
            type: 'string',
            description: 'Card key e.g. "file:src/lib/server/ai/gemma4-tool-controller.ts"',
          },
        },
        required: ['stableKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'context__build_kv_packet',
      description:
        'Build a compressed KV context packet for a set of hot files. Returns an attention TOC + file card summaries. Use when you have identified 1–8 relevant files.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Stable task identifier' },
          query: { type: 'string', description: 'Task description' },
          hotFiles: { type: 'string', description: 'Comma-separated list of file paths' },
          hotSymbols: { type: 'string', description: 'Comma-separated key symbol names' },
        },
        required: ['taskId', 'query'],
      },
    },
  },
  // ── KB Identity Spine tools ────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'kb__search_cards',
      description:
        'Search the knowledge base for codebase "cards" (identity-spine chunks). Returns ranked cards with stable IDs (card:path:hash), content snippets, and topological metadata.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language query or symbol name' },
          limit: { type: 'integer', description: 'Max results (default 10, max 25)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb__get_card',
      description:
        'Retrieve the full content and high-fidelity metadata for a specific knowledge card by ID. Use this when you have a card ID from search_cards.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Stable card ID (e.g. "card:src/lib/server/ai/gemma4-agent.ts:7a2b3")',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb__expand_neighbors',
      description:
        'Expand the topological neighborhood of a card or file using graph relationships. Returns structurally-related cards based on imports, dependencies, and cluster proximity.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Card or file ID to expand from' },
          limit: { type: 'integer', description: 'Max neighbors (default 20)' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb__explain_retrieval',
      description:
        'Provide an audit trace for why a specific card or search result was retrieved. Includes cluster dominance, community purpose, and grounding signals.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Card ID or query string to explain' },
          limit: { type: 'integer', description: 'Max grounding signals (default 5)' },
        },
        required: ['id'],
      },
    },
  },
];

// Tool name mapping: llama-server uses __ as namespace separator (dots invalid in JSON schema names)
// MCP uses dots.  Convert when dispatching.
export const LLAMA_TO_MCP_NAME: Record<string, string> = {
  search__dev_context: 'search.dev_context',
  codebase__rg_search: 'codebase.rg_search',
  graph__expand_neighborhood: 'graph.expand_neighborhood',
  graph__shortest_path: 'graph.shortest_path',
  graph__community_for_node: 'graph.community_for_node',
  graph__pagerank_top: 'graph.pagerank_top',
  topology__search_near: 'topology.search_near',
  topology__same_som_cluster: 'topology.same_som_cluster',
  clusters__get_members: 'clusters.get_members',
  clusters__get_summary_lenses: 'clusters.get_summary_lenses',
  trace__kag_search: 'trace.kag_search',
  trace__explain_retrieval: 'trace.explain_retrieval',
  context__get_compressed_card: 'context.get_compressed_card',
  context__build_kv_packet: 'context.build_kv_packet',
  topology__search_4d: 'topology.search_4d',
  search__go_hybrid: 'search.go_hybrid',
  kb__search_cards: 'kb.search_cards',
  kb__get_card: 'kb.get_card',
  kb__expand_neighbors: 'kb.expand_neighbors',
  kb__explain_retrieval: 'kb.explain_retrieval',
};

/**
 * Parse a llama-server tool_call and return the MCP tool name + arguments object.
 * Returns null for unknown / blocked tools.
 */
export function parseLlamaToolCall(tc: LlamaToolCall): { name: string; args: Record<string, unknown> } | null {
  const mcpName = LLAMA_TO_MCP_NAME[tc.function.name];
  if (!mcpName) return null;

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tc.function.arguments);
  } catch {
    return null;
  }

  // hotFiles is comma-separated in llama format → convert to array for MCP
  if ('hotFiles' in args && typeof args.hotFiles === 'string') {
    args.hotFiles = (args.hotFiles as string).split(',').map(s => s.trim()).filter(Boolean);
  }
  if ('hotSymbols' in args && typeof args.hotSymbols === 'string') {
    args.hotSymbols = (args.hotSymbols as string).split(',').map(s => s.trim()).filter(Boolean);
  }

  return { name: mcpName, args };
}
