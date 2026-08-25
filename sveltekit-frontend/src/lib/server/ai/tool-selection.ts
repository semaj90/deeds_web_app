/**
 * Shared tool-selection helper for the MCP / llama tool surfaces.
 *
 * This keeps the always-include set, recent-tool LRU, and Qdrant-backed
 * manifest selection in one place so the route, trace MCP server, and
 * Gemma tool loop all prune tool context the same way.
 */

import { ENV } from '$lib/server/env.server.js';
import { createHash } from 'node:crypto';
import {
  normalizeRecentToolUsage,
  selectToolDescriptors,
  type ToolDescriptor as PolicyToolDescriptor,
  type ToolUsage as PolicyToolUsage,
} from './tool-selection-policy.js';

export interface ToolDefinitionEntry {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolSelectionInput {
  query: string;
  topK?: number;
  domain?: string;
  bootstrap?: boolean;
  recentToolNames?: string[];
  requestedToolNames?: string[];
  requiredCategories?: string[];
  discoveryCallsInWindow?: number;
  previousToolNames?: string[];
  subagentRole?: string;
  alwaysIncludeToolNames?: string[];
  discoveredToolNames?: string[];
}

export interface ToolSelectionResult {
  mcp_names: string[];
  llama_names: string[];
  tool_defs: ToolDefinitionEntry[];
  signals: string[];
  embed_ok: boolean;
  source: 'qdrant' | 'fallback';
  top_k: number;
  bootstrap: boolean;
  always_include: string[];
  recent_tools: string[];
  selection_trace: ToolSelectionTrace;
}

export interface ToolSelectionTrace {
  schema: 'atlas.mcp-tool-selection-trace.v1';
  trace_id: string;
  routing_state: 'RETRIEVE' | 'GRAPH' | 'VALIDATE' | 'RECOVER' | 'SYNTHESIZE';
  state_source: 'DETERMINISTIC_QUERY_HEURISTIC';
  candidate_count: number;
  selected_tools: string[];
  selector_source: 'qdrant' | 'fallback';
  embedding_dimension: 768 | null;
  read_only: true;
}

function inferRoutingState(query: string, signals: string[]): ToolSelectionTrace['routing_state'] {
  const text = query.toLowerCase();
  if (/repair|fix|recover|failure|error|retry/.test(text)) return 'RECOVER';
  if (/validate|verify|audit|prove|check|contract/.test(text)) return 'VALIDATE';
  if (/summar|synth|explain|compose|answer/.test(text)) return 'SYNTHESIZE';
  if (signals.some((signal) => ['graph', 'topology', 'cluster', 'som'].includes(signal))) return 'GRAPH';
  return 'RETRIEVE';
}

function buildSelectionTrace(input: {
  query: string;
  signals: string[];
  selectedTools: string[];
  candidateCount: number;
  source: ToolSelectionResult['source'];
  embedOk: boolean;
}): ToolSelectionTrace {
  const traceSeed = JSON.stringify({
    query: input.query,
    signals: input.signals,
    selected_tools: input.selectedTools,
    source: input.source,
  });
  const traceId = createHash('sha256').update(traceSeed).digest('hex').slice(0, 32);
  return {
    schema: 'atlas.mcp-tool-selection-trace.v1',
    trace_id: traceId,
    routing_state: inferRoutingState(input.query, input.signals),
    state_source: 'DETERMINISTIC_QUERY_HEURISTIC',
    candidate_count: input.candidateCount,
    selected_tools: input.selectedTools,
    selector_source: input.source,
    embedding_dimension: input.embedOk ? 768 : null,
    read_only: true,
  };
}

const MAX_TOOL_RESULTS = 30;
const RECENT_TOOL_LIMIT = 16;

const TOOL_DEF_REGISTRY: Record<string, ToolDefinitionEntry> = {
  'search.dev_context': {
    type: 'function',
    function: {
      name: 'search__dev_context',
      description: 'Search the codebase for context relevant to a coding or debugging query. Returns ranked chunks with file paths and line references.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
          hotFiles: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  'codebase.rg_search': {
    type: 'function',
    function: {
      name: 'codebase__rg_search',
      description: 'Controlled ripgrep search over the codebase. Returns line hits from relative repo paths.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          glob: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['pattern'],
      },
    },
  },
  'graph.expand_neighborhood': {
    type: 'function',
    function: {
      name: 'graph__expand_neighborhood',
      description: 'Expand graph neighborhood from sourceRefs. Returns nodes/edges/sourceRefs/confidence.',
      parameters: {
        type: 'object',
        properties: {
          sourceRefs: { type: 'string' },
          depth: { type: 'integer' },
        },
        required: ['sourceRefs'],
      },
    },
  },
  'graph.shortest_path': {
    type: 'function',
    function: {
      name: 'graph__shortest_path',
      description: 'Find the shortest dependency path between two files or symbols.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from', 'to'],
      },
    },
  },
  'graph.community_for_node': {
    type: 'function',
    function: {
      name: 'graph__community_for_node',
      description: 'Get the GPU cluster, SOM cluster, and community membership for a file.',
      parameters: {
        type: 'object',
        properties: {
          sourceRef: { type: 'string' },
        },
        required: ['sourceRef'],
      },
    },
  },
  'graph.pagerank_top': {
    type: 'function',
    function: {
      name: 'graph__pagerank_top',
      description: 'Return the top-N highest PageRank nodes (most architecturally central files).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
          community: { type: 'string' },
        },
        required: [],
      },
    },
  },
  'topology.search_near': {
    type: 'function',
    function: {
      name: 'topology__search_near',
      description: 'Search the 4D SOM manifold for files near a natural-language query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  'topology.same_som_cluster': {
    type: 'function',
    function: {
      name: 'topology__same_som_cluster',
      description: 'Find all files sharing the same SOM cluster as the given node.',
      parameters: {
        type: 'object',
        properties: {
          sourceRef: { type: 'string' },
        },
        required: ['sourceRef'],
      },
    },
  },
  'topology.search_4d': {
    type: 'function',
    function: {
      name: 'topology__search_4d',
      description: 'SOM 4D topology search — find files by SOM coordinates.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  'clusters.get_members': {
    type: 'function',
    function: {
      name: 'clusters__get_members',
      description: 'Get members of a GPU/SOM cluster.',
      parameters: {
        type: 'object',
        properties: {
          cluster_id: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['cluster_id'],
      },
    },
  },
  'clusters.get_summary_lenses': {
    type: 'function',
    function: {
      name: 'clusters__get_summary_lenses',
      description: 'Get semantic summary lenses for a cluster.',
      parameters: {
        type: 'object',
        properties: {
          cluster_id: { type: 'string' },
        },
        required: ['cluster_id'],
      },
    },
  },
  'trace.kag_search': {
    type: 'function',
    function: {
      name: 'trace__kag_search',
      description: 'Search KAG trace memory for prior agent runs and answers.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  'trace.explain_retrieval': {
    type: 'function',
    function: {
      name: 'trace__explain_retrieval',
      description: 'Explain why a specific result was retrieved — cluster dominance, community purpose, grounding signals.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['id'],
      },
    },
  },
  'context.get_compressed_card': {
    type: 'function',
    function: {
      name: 'context__get_compressed_card',
      description: 'Fetch a compressed ACE context card for a file or feature.',
      parameters: {
        type: 'object',
        properties: {
          stableKey: { type: 'string' },
        },
        required: ['stableKey'],
      },
    },
  },
  'context.build_kv_packet': {
    type: 'function',
    function: {
      name: 'context__build_kv_packet',
      description: 'Build a compressed KV context packet for a set of hot files.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          query: { type: 'string' },
          hotFiles: { type: 'string' },
          hotSymbols: { type: 'string' },
        },
        required: ['taskId', 'query'],
      },
    },
  },
  'search.go_hybrid': {
    type: 'function',
    function: {
      name: 'search__go_hybrid',
      description: 'Go search service RRF fusion: parallel FTS + pgvector + Qdrant with reciprocal rank fusion.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          type: { type: 'string' },
          limit: { type: 'integer' },
          filters: { type: 'object' },
        },
        required: ['query'],
      },
    },
  },
  'kb.search_cards': {
    type: 'function',
    function: {
      name: 'kb__search_cards',
      description: 'Search the knowledge base for codebase cards (identity-spine chunks).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  'kb.get_card': {
    type: 'function',
    function: {
      name: 'kb__get_card',
      description: 'Retrieve the full content and metadata for a specific knowledge card by ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  'kb.expand_neighbors': {
    type: 'function',
    function: {
      name: 'kb__expand_neighbors',
      description: 'Expand the topological neighborhood of a card or file using graph relationships.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['id'],
      },
    },
  },
  'kb.explain_retrieval': {
    type: 'function',
    function: {
      name: 'kb__explain_retrieval',
      description: 'Provide an audit trace for why a specific card or search result was retrieved.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['id'],
      },
    },
  },
  'ops.search_tools': {
    type: 'function',
    function: {
      name: 'ops__search_tools',
      description:
        'Search the bounded tool catalog and return a compact always-include + recent + ranked tool subset. Use this to avoid flooding the context window with every available tool.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          top_k: { type: 'integer' },
          domain: { type: 'string' },
          bootstrap: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
  },
};

const CORE_ALWAYS_INCLUDE = [
  'search.dev_context',
  'codebase.rg_search',
  'trace.kag_search',
  'trace.explain_retrieval',
  'context.build_kv_packet',
];

const BOOTSTRAP_ALWAYS_INCLUDE = [
  ...CORE_ALWAYS_INCLUDE,
  'graph.expand_neighborhood',
  'graph.shortest_path',
  'topology.search_near',
  'clusters.get_summary_lenses',
];

const FALLBACK_TOOLS = [
  'search.dev_context',
  'codebase.rg_search',
  'trace.kag_search',
  'graph.expand_neighborhood',
  'graph.pagerank_top',
  'kb.search_cards',
];

const DOMAIN_SIGNALS: Record<string, string[]> = {
  search: ['retrieval', 'semantic_search', 'rag'],
  graph: ['graph', 'neo4j', 'topology'],
  code: ['code_intel', 'ast', 'symbol'],
  embed: ['embedding', 'vector', 'inference'],
  legal: ['legal', 'evidence', 'case_management'],
  cache: ['cache', 'redis', 'inspection'],
  agent: ['agent', 'planning', 'reasoning'],
  rank: ['reranking', 'ranking', 'retrieval'],
  memory: ['memory', 'prior_answer', 'cache'],
  knowledge: ['knowledge_base', 'wiki', 'notecard'],
  atlas: ['atlas', 'feature_lookup', 'atlas_indexing'],
  trace: ['kag', 'trace_memory', 'retrieval'],
  cluster: ['clustering', 'som', 'topology'],
  mcp: ['mcp_tools', 'agent', 'planning'],
};

const recentToolUsage = new Map<string, { lastUsedAt: number; callCount: number }>();
let recentToolSequence = 0;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeToolName(name: string): string {
  return String(name ?? '').trim();
}

function dedupeOrdered(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const normalized = normalizeToolName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function rankSignals(query: string, domainHint?: string): string[] {
  const q = query.toLowerCase();
  const active = new Set<string>(['retrieval']);
  for (const [domain, tags] of Object.entries(DOMAIN_SIGNALS)) {
    if (q.includes(domain) || tags.some((tag) => q.includes(tag.replace('_', ' ')))) {
      tags.forEach((tag) => active.add(tag));
    }
  }
  if (domainHint && DOMAIN_SIGNALS[domainHint]) {
    DOMAIN_SIGNALS[domainHint].forEach((tag) => active.add(tag));
  }
  return [...active];
}

export function recordToolUsage(toolName: string): void {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return;
  recentToolSequence += 1;
  const current = recentToolUsage.get(normalized);
  recentToolUsage.set(normalized, {
    lastUsedAt: recentToolSequence,
    callCount: (current?.callCount ?? 0) + 1,
  });
  if (recentToolUsage.size > 64) {
    const oldest = [...recentToolUsage.entries()]
      .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)
      .slice(0, recentToolUsage.size - 64);
    for (const [name] of oldest) {
      recentToolUsage.delete(name);
    }
  }
}

export function resetToolUsage(): void {
  recentToolUsage.clear();
  recentToolSequence = 0;
}

export function getRecentToolNames(limit = RECENT_TOOL_LIMIT): string[] {
  const bounded = clampInt(limit, 0, 32);
  return getRecentToolUsageSnapshot(bounded)
    .map((entry) => entry.name);
}

export function getRecentToolUsageSnapshot(limit = RECENT_TOOL_LIMIT): PolicyToolUsage[] {
  const bounded = clampInt(limit, 0, 32);
  return [...recentToolUsage.entries()]
    .sort((a, b) => b[1].lastUsedAt - a[1].lastUsedAt)
    .slice(0, bounded)
    .map(([name, info]) => ({
      name,
      lastUsedAt: info.lastUsedAt,
      callCount: info.callCount,
    }));
}

export function getAlwaysIncludeToolNames(bootstrap = false): string[] {
  return bootstrap ? [...BOOTSTRAP_ALWAYS_INCLUDE] : [...CORE_ALWAYS_INCLUDE];
}

export function mergeToolNames(groups: string[][], limit = MAX_TOOL_RESULTS): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const name of group) {
      const normalized = normalizeToolName(name);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(normalized);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function embedQuery(text: string): Promise<number[] | null> {
  const rawHost = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
  const ollamaBase = rawHost.startsWith('http')
    ? rawHost
    : `http://${rawHost.includes(':') ? rawHost : `${rawHost}:11434`}`;

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
    } catch {
      // try the next embedding backend
    }
  }
  return null;
}

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
      .map((hit) => {
        const ontology = (hit.payload?.ontology as string[] | undefined) ?? [];
        const boost = ontology.filter((tag) => signalSet.has(tag)).length * 0.05;
        return {
          tool_name: String(hit.payload?.tool_name ?? ''),
          llama_name: (hit.payload?.llama_name as string | null) ?? null,
          score: hit.score + boost,
          ontology,
        };
      })
      .filter((hit) => hit.tool_name.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch {
    return [];
  }
}

function normalizeToolDefs(names: string[]): ToolDefinitionEntry[] {
  return names
    .map((name) => TOOL_DEF_REGISTRY[name])
    .filter((entry): entry is ToolDefinitionEntry => Boolean(entry));
}

function inferCategory(name: string): string {
  const normalized = normalizeToolName(name);
  return normalized.includes('.') ? normalized.split('.')[0] : 'general';
}

const TOOL_POLICY_CATALOG: PolicyToolDescriptor[] = Object.entries(TOOL_DEF_REGISTRY).map(([name, entry]) => ({
  name,
  description: entry.function.description,
  category: inferCategory(name),
  inputSchema: entry.function.parameters,
}));

export async function selectToolsForQuery(input: ToolSelectionInput): Promise<ToolSelectionResult> {
  const topK = clampInt(input.topK ?? 12, 1, 30);
  const bootstrap = Boolean(input.bootstrap);
  const recentUsage = normalizeRecentToolUsage(input.recentToolNames ? input.recentToolNames.map((name, index) => ({
    name,
    lastUsedAt: input.recentToolNames!.length - index,
    callCount: 1,
  })) : getRecentToolUsageSnapshot());
  const signals = rankSignals(input.query, input.domain);
  const vector = await embedQuery(input.query);

  let rankedNames: string[] = [];
  let source: ToolSelectionResult['source'] = 'fallback';

  if (vector) {
    const hits = await searchToolManifest(vector, signals, topK);
    rankedNames = hits.map((hit) => hit.tool_name);
    if (rankedNames.length > 0) {
      source = 'qdrant';
    }
  }

  if (rankedNames.length === 0) {
    rankedNames = [...FALLBACK_TOOLS];
  }

  const selection = selectToolDescriptors({
    query: input.query,
    turnNumber: bootstrap ? 1 : 4,
    tools: TOOL_POLICY_CATALOG,
    usage: recentUsage,
    requestedToolNames: input.requestedToolNames,
    requiredCategories: input.requiredCategories,
    discoveryCallsInWindow: input.discoveryCallsInWindow ?? 0,
    previousToolNames: input.previousToolNames,
    subagentRole: input.subagentRole,
    toolBudget: topK,
    rankedToolNames: rankedNames,
    alwaysIncludeToolNames: input.alwaysIncludeToolNames ?? getAlwaysIncludeToolNames(bootstrap),
    discoveredToolNames: input.discoveredToolNames,
  });

  const mcpNames = selection.selected.map((tool) => tool.name);
  const llamaNames = mcpNames.map((name) => name.replace(/\./g, '__'));

  return {
    mcp_names: mcpNames,
    llama_names: llamaNames,
    tool_defs: normalizeToolDefs(mcpNames),
    signals,
    embed_ok: vector !== null,
    source,
    top_k: topK,
    bootstrap,
    always_include: selection.selected
      .filter((tool) => selection.reasonByTool[tool.name] === 'always_include')
      .map((tool) => tool.name),
    recent_tools: recentUsage.map((entry) => entry.name),
    selection_trace: buildSelectionTrace({
      query: input.query,
      signals,
      selectedTools: mcpNames,
      candidateCount: rankedNames.length,
      source,
      embedOk: vector !== null,
    }),
  };
}
