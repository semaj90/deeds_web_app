/**
 * Gemma4 Tool-Calling Agent
 *
 * Runs an agentic loop against Ollama's native tool-calling API
 * (gemma4-rotorquant:latest — unified legal+VLM for tool-calling + agentic tasks).
 *
 * Loop:
 *   1. Send messages + tool definitions to /api/chat
 *   2. If response.message.tool_calls → invoke each tool in-process
 *   3. Append role:"tool" result messages → re-send
 *   4. Repeat until final text response or MAX_ROUNDS exceeded
 *
 * All tool dispatch is in-process — no HTTP round-trip to external services:
 *   rag_search      → Qdrant hybrid search (research_summaries + legal_documents)
 *   case_search     → Postgres full-text case search
 *   memory_recall   → selectAdaptiveMemory() — hyperedge X_prime similarity
 *   hyperedge_stats → queryTopHyperedges() — top Grade A/B knowledge clusters
 *
 * Timeline events are written to context_timeline for every agent run
 * (eventType: 'tool_call') so the RL loop can learn which tool chains
 * produce high-quality answers.
 */

import {
  ollamaFetch,
  VLM_MODELS,
  getOllamaEndpoint,
  bifrostChat,
  turboQuantChat,
} from '$lib/server/ollama.js';
import { generateEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { selectAdaptiveMemory, queryTopHyperedges } from '$lib/server/graph/hypergraph-4d.js';
import { queryTopology } from '$lib/server/retrieval/topology-search-client.js';
import { db, pool } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { appendOutcomeLedger } from '$lib/server/observability/outcome-ledger.js';
import { trackTokenUsage } from '$lib/server/ai/token-tracker.js';
import { resolveRuntimeConfig } from '$lib/server/ai/inference-configs.js';
import { canUseTurboQuant, gatePreferredBackend } from '$lib/server/ai/backend-runtime-guards.js';
import { ENV } from '$lib/server/env.server.js';
import fs from 'fs/promises';
import path from 'path';
import { LinterService } from '../../../ai/linter-service.js';
import { tieredLLMQuery } from '$lib/server/ai/tiered-llm-cache.js';
import type { LlmCacheTrace } from '$lib/server/ai/llm-cache-trace.js';
import { getErrorFixMemory, saveErrorFixMemory } from '$lib/server/ai/error-fix-memory.js';
import { buildAgentSystemPrompt } from '$lib/ai/prompts.js';
import {
  LLAMA_TOOL_DEFINITIONS,
  LLAMA_TO_MCP_NAME,
} from '$lib/server/ai/llama-tool-definitions.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUNDS = 5; // max tool-call rounds before forcing a final answer
const TIMEOUT_MS = 180_000;

// ── Model broker boundary ─────────────────────────────────────────────────────
// PLANNER_MODEL  — Gemma 4 legal VLM: planning, reasoning, synthesis (5.3GB)
// TOOL_MODEL     — FunctionGemma (or same VLM until model is available):
//                  structured-call translation / function-call parsing (270M target)
// EMBED_MODEL    — embeddinggemma: retrieval embeddings (separate, always)
//
// To activate FunctionGemma once pulled:
//   Set FUNCTION_GEMMA_MODEL=functiongemma:latest in .env
//   The TOOL_MODEL slot will route structured calls through it automatically.
const PLANNER_MODEL = VLM_MODELS.legal; // full reasoning + synthesis
const TOOL_MODEL = VLM_MODELS.tool; // structured-call translation (FunctionGemma when available)

// ── Ollama wire types ──────────────────────────────────────────────────────────

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
}

// ── Tool definitions (Ollama function-calling schema) ─────────────────────────

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'rag_search',
      description:
        'Semantic search across legal research summaries and documents. ' +
        'Use this to retrieve relevant case law, statutes, or research on a topic.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          collection: {
            type: 'string',
            enum: ['research_summaries', 'legal_documents', 'evidence_items'],
            description: 'Which knowledge collection to search (default: research_summaries)',
          },
          topK: { type: 'number', description: 'Max results to return (default 5, max 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'case_search',
      description:
        'Search legal cases in the database by keyword or description. ' +
        'Returns case title, status, and summary.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or case description' },
          limit: { type: 'number', description: 'Max results (default 5, max 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_recall',
      description:
        'Retrieve the most relevant hyperedge memory modules from the 4D knowledge graph. ' +
        'These are HGNN-enriched summaries of clusters of related research that the system ' +
        'has learned are high-quality for a given topic (Grade A/B hyperedges). ' +
        'Use this when you need background context or prior learned knowledge on a subject.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Topic or question to recall memories for' },
          topK: { type: 'number', description: 'Number of memory modules to return (default 3)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hyperedge_stats',
      description:
        'Get statistics about the top knowledge clusters (hyperedges) currently in the graph. ' +
        'Shows which topic clusters have the highest quality scores and how many summaries they contain. ' +
        'Use this to understand what the system knows well.',
      parameters: {
        type: 'object',
        properties: {
          minGrade: {
            type: 'string',
            enum: ['A', 'B', 'C'],
            description: 'Minimum grade threshold (default B)',
          },
          limit: { type: 'number', description: 'Number of hyperedges to return (default 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the contents of a source file to understand the current code or structure.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description:
              'Path to the file relative to workspace root (e.g., src/routes/+page.svelte)',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'topology_search',
      description:
        'Search the 4D topology-indexed codebase using cosine retrieval (Qdrant 768-dim) ' +
        'followed by manifold4 Euclidean neighborhood expansion. ' +
        'The four manifold dimensions are: som_x/som_y (SOM grid — structural topology), ' +
        'semantic_z (embedding centroid projection), grpo_w (RL quality signal). ' +
        'Returns files closest in the combined vector+topology space. ' +
        'Use this when you need to find structurally-related or topologically-adjacent files ' +
        'beyond simple keyword or semantic search.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query — embedded and used to find the 4D centroid',
          },
          radius: {
            type: 'number',
            description: 'Euclidean radius in manifold4 space (default 0.25, range 0.05–2.0)',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default 15, max 40)',
          },
          somCluster: {
            type: 'number',
            description: 'Restrict search to a specific SOM cluster index (optional)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'LLMS.md',
      description:
        'Quick-hit fetch of the per-directory LLMS.md (LLMS.md spec) for a path. ' +
        'Returns pre-rendered Markdown with: directory purpose, audit score, ' +
        'top warnings (auth/Zod/SSR/Svelte4/network), dominant tags, ' +
        'topological neighbors, and representative files. Walks UP the tree to ' +
        'the nearest LLMS.md (Cursor/Codex/Aider use the same convention). ' +
        'Use this BEFORE editing files in an unfamiliar directory — it gives you ' +
        'the same snapshot a human reviewer would expect from the dir README. ' +
        'Sub-5ms latency vs ~50-100ms for the full KAG pipeline.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Directory or file path. If a file, the dirname is used. ' +
              'Examples: "src/lib/server/ace", "src/routes/api/cases/[id]/+server.ts".',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_fix',
      description:
        'Run svelte-check or tsc on a specific file to verify it is free of syntax/type errors. Use this AFTER applying a shadow patch.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to verify (e.g., src/routes/+page.svelte)',
          },
          checkFull: {
            type: 'boolean',
            description: 'Whether to check the entire project for regressions (default: false)',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_shadow_patch',
      description:
        'Apply a temporary patch to a file for verification. This creates a .bak file automatically.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the target file' },
          patch: { type: 'string', description: 'The code content to write' },
        },
        required: ['filePath', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revert_fix',
      description:
        'Revert a shadow patch by restoring the .bak file. Use this to cleanup after verification.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file to revert' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph_search',
      description:
        'Search the fast-AST codebase graph (docs/graph/codebase-graph.json) by keyword. ' +
        'Returns matching source files with their tags, TODO count, auth status, and audit score. ' +
        'Use this to locate relevant files before reading or patching them.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords to search for (file path, tags, or summary words)',
          },
          topK: { type: 'number', description: 'Max files to return (default 8, max 20)' },
          onlyRoutes: {
            type: 'boolean',
            description: 'Restrict to SvelteKit route files (+server.ts, +page.server.ts)',
          },
          onlyNoAuth: {
            type: 'boolean',
            description: 'Return only routes missing auth guard (locals.user check)',
          },
          hasTodos: {
            type: 'boolean',
            description: 'Return only files with at least one TODO/FIXME',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wiki_note_lookup',
      description:
        'Look up KAG wiki notes (wiki:note:dir:*) from Redis for directories matching a query. ' +
        'Each note contains an AI-written directory summary, audit score, and SOM topology coordinates ' +
        'written by the directory summarizer pipeline. Use this to understand what a directory does before editing.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Directory name, tag, or topic to look up (e.g. "server/cache", "auth", "embedding")',
          },
          limit: { type: 'number', description: 'Max notes to return (default 5, max 15)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_hotspots',
      description:
        'Return the worst-scoring directories from the fast-AST codebase audit. ' +
        'Each result explains WHY the directory scored low: low audit score, TODO density, or missing auth on API routes. ' +
        'Use this first when asked to improve code quality or find areas needing attention.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'How many hotspot directories to return (default 10, max 30)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trace_search',
      description:
        'Advanced multi-lens retrieval across codebase chunks, architectural summaries, and synthesis memory. ' +
        'Use this for complex coding questions, architecture analysis, or finding the "why" behind code.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Technical query or coding problem' },
          topK: { type: 'number', description: 'Max results to return (default 5, max 15)' },
          intent: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional intent lenses: purpose, risk, api_surface, dependencies, retrieval_role',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web via SearXNG (google+duckduckgo+bing engines). ' +
        'Falls back to Qdrant research_summaries semantic search if SearXNG is unavailable. ' +
        'Use this for current events, documentation, or information not in the codebase.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Web search query' },
          maxResults: { type: 'number', description: 'Max results to return (default 3, max 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph_expand',
      description:
        'Expand the ego-graph around a file or directory node in Neo4j. ' +
        'Returns neighboring files, clusters, and summaries up to N hops away. ' +
        'Use this to understand what else is affected when changing a file, or to ' +
        'find related files that import or are imported by the target.',
      parameters: {
        type: 'object',
        properties: {
          stableKey: {
            type: 'string',
            description:
              'Node stable key (e.g. "file:src/lib/server/ace/context-assembler.ts" or "dir:src/routes/api")',
          },
          depth: { type: 'number', description: 'Hop depth 1-3 (default 2)' },
          limit: { type: 'number', description: 'Max neighbors (default 30, max 80)' },
        },
        required: ['stableKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph_path',
      description:
        'Find the shortest relationship path between two nodes in the codebase graph. ' +
        'Useful to understand how a route connects to a DB table, how a component reaches a service, etc.',
      parameters: {
        type: 'object',
        properties: {
          fromKey: { type: 'string', description: 'Source node stableKey' },
          toKey: { type: 'string', description: 'Target node stableKey' },
          maxHops: { type: 'number', description: 'Max path length (default 5, max 8)' },
        },
        required: ['fromKey', 'toKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph_community',
      description:
        'Look up which GPU cluster and SOM cluster a file belongs to. ' +
        'Also returns community ID if GDS community detection has been run. ' +
        'Use this to understand which subsystem a file is part of.',
      parameters: {
        type: 'object',
        properties: {
          stableKey: { type: 'string', description: 'Node stableKey to look up' },
        },
        required: ['stableKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph_pagerank',
      description:
        'Return the top files or directories by PageRank score — these are the most ' +
        'architecturally important nodes. High PageRank = many other files depend on it.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'How many top nodes to return (default 15, max 50)',
          },
          nodeType: {
            type: 'string',
            description: 'Optional Neo4j label filter (e.g. "CodebaseFile")',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_postgres_fts',
      description:
        'Lexical full-text search over the Postgres code_retrieval_chunks table ' +
        '(populated from Qdrant after each indexing run). Preserves camelCase, dots, ' +
        'and path segments — ideal for exact symbol/function/class name lookup. ' +
        'Faster than Qdrant for known identifiers. Returns file paths, symbol names, ' +
        'topo_class, and authority score. Use alongside topology_search for hybrid recall.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Symbol name, function, or keywords to search for',
          },
          topoClass: {
            type: 'string',
            description:
              'Optional: filter to a topology class (e.g. "gpu-cuda", "search-retrieval")',
          },
          limit: { type: 'number', description: 'Max results (default 10, max 30)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_hybrid',
      description:
        'Hybrid retrieval: combines Postgres FTS (lexical), Qdrant semantic search, ' +
        'and Neo4j authority scoring. Best for queries that mix symbol names with ' +
        'conceptual descriptions. Returns merged, re-scored results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language or mixed symbol+concept query' },
          topoClass: { type: 'string', description: 'Optional topology class filter' },
          limit: { type: 'number', description: 'Max results (default 10, max 30)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'topology_search_4d',
      description:
        'Search using explicit 4D manifold coordinates (SOM grid + semantic projection + GRPO quality). ' +
        'Use when you already know a SOM cluster position and want structurally-adjacent files ' +
        'without re-embedding a query. Supports JSONB payload filters (topo_class, has_auth, etc.).',
      parameters: {
        type: 'object',
        properties: {
          som_x: { type: 'number', description: 'SOM X coordinate (BMU column, 0-based)' },
          som_y: { type: 'number', description: 'SOM Y coordinate (BMU row, 0-based)' },
          semantic_z: {
            type: 'number',
            description: 'Semantic centroid projection 0–1 (default 0.5)',
          },
          grpo_w: { type: 'number', description: 'GRPO quality weight 0–1 (default 0.5)' },
          radius: {
            type: 'number',
            description: 'Euclidean radius in 4D manifold space (default 0.5)',
          },
          limit: { type: 'number', description: 'Max results (default 20, max 50)' },
          filters: {
            type: 'object',
            description: 'Optional JSONB payload filters (e.g. { "topo_class": "server" })',
          },
        },
        required: ['som_x', 'som_y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_go_hybrid',
      description:
        'Go search service RRF fusion: parallel fan-out of citation + FTS + pgvector + Qdrant ' +
        'with reciprocal rank fusion. Faster than in-process hybrid for large-scale recall. ' +
        'Supports JSONB metadata filters. Falls back gracefully when service is unavailable.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          type: {
            type: 'string',
            description: '"codebase", "legal", or "hybrid" (default: codebase)',
          },
          limit: { type: 'number', description: 'Max results (default 20, max 50)' },
          filters: { type: 'object', description: 'Optional JSONB metadata filters' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb_search_cards',
      description:
        'Search the knowledge base for codebase "cards" (identity-spine chunks). ' +
        'Returns ranked cards with stable IDs (card:path:hash), content snippets, ' +
        'and topological metadata (SOM cluster, gpu cluster). Use this for high-fidelity retrieval.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language query or symbol name' },
          limit: { type: 'number', description: 'Max results (default 10, max 25)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb_get_card',
      description:
        'Retrieve the full content and high-fidelity metadata for a specific knowledge card by ID. ' +
        'Use this when you have a card ID from search_cards and need the full context.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Stable card ID (e.g., card:src/lib/server/ai/gemma4-agent.ts:7a2b3)',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb_expand_neighbors',
      description:
        'Expand the topological neighborhood of a card or file using graph relationships. ' +
        'Returns structurally-related cards based on imports, dependencies, and cluster proximity.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Card or file ID to expand from' },
          limit: { type: 'number', description: 'Max neighbors (default 20)' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kb_explain_retrieval',
      description:
        'Provide an audit trace for why a specific card or search result was retrieved. ' +
        'Includes cluster dominance, community purpose, and grounding signals.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Card ID or query string to explain' },
          limit: { type: 'number', description: 'Max grounding signals (default 5)' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_pick_next_semantic_packet',
      description:
        'Claim the next ready Kanban task semantic packet and return related files, cluster IDs, and the next action.',
      parameters: {
        type: 'object',
        properties: {
          lane: {
            type: 'string',
            description: 'Pickup lane name (default semantic_packet)',
          },
          enqueueIfMissing: {
            type: 'boolean',
            description: 'Preserve queue-only selection behavior (default true)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_run_semantic_packet_workflow',
      description:
        'Create, enrich, cache, and enqueue a task semantic packet for a Kanban task. ' +
        'Use this after a task is created or when the packet needs to be refreshed.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'number', description: 'Kanban task ID to process' },
        },
        required: ['taskId'],
      },
    },
  },
] as const;

// ── GEMMA4_ALLOWED_TOOLS — exported allowlist for MCP graph/search tools ──────
export const GEMMA4_ALLOWED_TOOLS = {
  'trace.kag_search': { write: false },
  'trace.explain_retrieval': { write: false },
  'topology.search_near': { write: false },
  'context.build_kv_packet': { write: false },
  'context.get_compressed_card': { write: false },
  'context.explain_compression': { write: false },
  'context.refresh_task_toc': { write: false },
  'task.pick_next_semantic_packet': { write: false },
  'task.run_semantic_packet_workflow': { write: true, requiresGainValidation: false },
  'topology.same_som_cluster': { write: false },
  'graph.expand_neighborhood': { write: false },
  'graph.shortest_path': { write: false },
  'graph.community_for_node': { write: false },
  'graph.pagerank_top': { write: false },
  'clusters.get_members': { write: false },
  'clusters.get_summary_lenses': { write: false },
  'trace.validate_ace_hit': { write: false },
  'web.search': { write: false },
  'search.dev_context': { write: false },
  'kag.record_agent_run': { write: true, requiresGainValidation: false },
  'kag.ingest_memory_directory': { write: true, requiresGainValidation: false },
  'research.encode': { write: true, requiresGainValidation: true },
  'topology.search_4d': { write: false },
  'search.go_hybrid': { write: false },
  'kb.search_cards': { write: false },
  'kb.get_card': { write: false },
  'kb.expand_neighbors': { write: false },
  'kb.explain_retrieval': { write: false },
} as const;

export function truncateToolResult(result: unknown, maxChars = 12_000): unknown {
  const s = typeof result === 'string' ? result : JSON.stringify(result);
  if (s.length <= maxChars) return result;
  return s.slice(0, maxChars) + '\n[truncated]';
}

/**
 * Convert accumulated Go/topology retrieval hits into ClusterContextPackets
 * for injection into the pre-synthesis context block.
 * Groups by clusterKey (or topoClass fallback), max 3 packets.
 */
function buildGoClusterPackets(
  hits: Array<{ clusterKey?: string; topoClass?: string; path?: string; score?: number }>
): AgentRunResult['goToolClusterContext'] {
  if (!hits.length) return undefined;
  const byKey = new Map<
    string,
    { count: number; topoClass: string; files: Set<string>; scores: number[] }
  >();
  for (const h of hits) {
    const key = h.clusterKey ?? `topo:${h.topoClass ?? 'unknown'}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { count: 0, topoClass: h.topoClass ?? 'general', files: new Set(), scores: [] };
      byKey.set(key, entry);
    }
    entry.count++;
    if (h.path) entry.files.add(h.path);
    if (h.score != null) entry.scores.push(h.score);
  }
  return [...byKey.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([clusterKey, { count, topoClass, files, scores }]) => {
      const clusterId = parseInt(clusterKey.replace(/\D/g, ''), 10) || 0;
      const topFiles = [...files].slice(0, 5).map((f) => f.split('/').pop() ?? f);
      const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const scoreHint = avgScore != null ? `, avg score ${avgScore.toFixed(3)}` : '';
      return {
        clusterId,
        clusterKey,
        topoClass,
        chunkCount: count,
        topFiles,
        synthesisSuggestion: `Go/topology: ${count} hits in ${clusterKey} (${topoClass})${scoreHint}. Top files: ${topFiles.slice(0, 3).join(', ')}.`,
        communityId: null,
        graphAuthorityScore: null,
      };
    });
}

// ── ALLOWED_TOOLS allowlist ────────────────────────────────────────────────────
// read  — pure retrieval, no filesystem or DB writes; always allowed
// write — filesystem or DB side-effect; requires explicit opt-in (ALLOW_WRITE_TOOLS)
// gated — dangerous / indexing ops; require ALLOW_GATED_TOOLS flag or separate endpoint
const ALLOWED_TOOLS = {
  read: new Set([
    'rag_search',
    'case_search',
    'memory_recall',
    'hyperedge_stats',
    'topology_search',
    'trace_search',
    'LLMS.md',
    'read_file',
    'graph_search',
    'wiki_note_lookup',
    'audit_hotspots',
    'web_search',
    // TRACE MCP graph tools (proxy to :8788)
    'graph_expand',
    'graph_path',
    'graph_community',
    'graph_pagerank',
    'graph.expand_neighborhood',
    'graph.shortest_path',
    'graph.community_for_node',
    'graph.pagerank_top',
    'search_postgres_fts',
    'search_hybrid',
    'search.postgres_fts',
    'search.hybrid',
    // TRACE MCP topology + cluster + KAG tools
    'trace.kag_search',
    'trace.explain_retrieval',
    'topology.search_near',
    'topology.same_som_cluster',
    'clusters.get_members',
    'clusters.get_summary_lenses',
    'web.search',
    'context.build_kv_packet',
    'context.get_compressed_card',
    'context.explain_compression',
    'context.refresh_task_toc',
    'task.pick_next_semantic_packet',
    'task.run_semantic_packet_workflow',
    // MCP dev-context tool (Step 5B)
    'search.dev_context',
    // B1 new tools: graph expansion, cluster lenses, ACE hit validator
    'trace.validate_ace_hit',
    // topology.search_4d + search.go_hybrid (4D manifold + RRF Go service)
    'topology_search_4d',
    'topology.search_4d',
    'search_go_hybrid',
    'search.go_hybrid',
    // LLAMA __ names (TurboQuant native function-call format)
    'search__dev_context',
    'graph__expand_neighborhood',
    'graph__shortest_path',
    'graph__community_for_node',
    'graph__pagerank_top',
    'topology__search_near',
    'topology__same_som_cluster',
    'clusters__get_members',
    'clusters__get_summary_lenses',
    'trace__kag_search',
    'trace__explain_retrieval',
    'context__get_compressed_card',
    'context__build_kv_packet',
    'trace__validate_ace_hit',
    'topology__search_4d',
    'search__go_hybrid',
    // KB Identity Spine tools
    'kb.search_cards',
    'kb.get_card',
    'kb.expand_neighbors',
    'kb.explain_retrieval',
    'kb__search_cards',
    'kb__get_card',
    'kb__expand_neighbors',
    'kb__explain_retrieval',
  ]),
  write: new Set(['apply_shadow_patch', 'revert_fix', 'verify_fix', 'research.encode']),
  gated: new Set<string>([
    // reserved for future indexing / DB-mutation tools
  ]),
} as const;

// ── FNV-1a 32-bit hash (for Redis cache keys) ─────────────────────────────────
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// ── Manual JSON tool-request fallback parser ──────────────────────────────────
// Gemma 4 sometimes emits tool requests as raw JSON instead of native tool_calls.
// Supported shapes:
//   { "tool": "trace.search", "args": { "query": "...", "limit": 10 } }
//   { "tool": "rag_search",   "arguments": { ... } }
//   { "name": "graph_expand", "arguments": { "file": "..." } }   ← OpenAI-style in prose
//   ```json\n{...}\n```
//   prose before/after JSON: "I will call {...} to search."
// Tool names may use dot notation (trace.search) or underscores (trace_search).

/** Extract all top-level JSON objects from text using balanced-brace scanning. */
function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0,
    start = -1,
    inString = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth++ === 0) start = i;
    } else if (ch === '}') {
      if (--depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function tryParseToolObject(obj: Record<string, unknown>): OllamaToolCall | null {
  // Shape 1: { "tool": "name", "args"|"arguments": {...} }
  if (typeof obj['tool'] === 'string') {
    const name = (obj['tool'] as string).replace(/\./g, '_');
    const args = (
      typeof obj['args'] === 'object' && obj['args'] !== null
        ? obj['args']
        : typeof obj['arguments'] === 'object' && obj['arguments'] !== null
          ? obj['arguments']
          : {}
    ) as Record<string, unknown>;
    return { function: { name, arguments: args } };
  }
  // Shape 2: { "name": "name", "arguments": {...} }  (OpenAI-style in prose)
  if (typeof obj['name'] === 'string') {
    const name = (obj['name'] as string).replace(/\./g, '_');
    const rawArgs = obj['arguments'] ?? obj['args'] ?? obj['parameters'] ?? {};
    const args = (
      typeof rawArgs === 'string'
        ? (() => {
            try {
              return JSON.parse(rawArgs);
            } catch {
              return {};
            }
          })()
        : rawArgs
    ) as Record<string, unknown>;
    return { function: { name, arguments: args } };
  }
  return null;
}

export function parseToolRequest(content: string): OllamaToolCall[] {
  if (!content?.trim()) return [];

  // Fast path: strip ```json fences and try direct parse
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  if (stripped.startsWith('{')) {
    try {
      const obj = JSON.parse(stripped) as Record<string, unknown>;
      const tc = tryParseToolObject(obj);
      if (tc) return [tc];
    } catch {
      /* fall through to balanced scan */
    }
  }

  // General path: extract all JSON objects from prose (handles nested braces)
  for (const candidate of extractJsonObjects(content)) {
    try {
      const obj = JSON.parse(candidate) as Record<string, unknown>;
      const tc = tryParseToolObject(obj);
      if (tc) return [tc];
    } catch {
      /* keep scanning */
    }
  }

  return [];
}

// ── TRACE MCP proxy helper ────────────────────────────────────────────────────
// Calls a tool on the standalone TRACE MCP HTTP server at :8788.
// Non-fatal: returns null if the server is not running.
const TRACE_MCP_URL = ENV.TRACE_MCP_URL;

async function callTraceMcp(
  toolName: string,
  toolArgs: Record<string, unknown>,
  traceContext?: { parentTaskId?: string; runId?: string }
): Promise<unknown> {
  try {
    const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: {
            ...toolArgs,
            parentTaskId: traceContext?.parentTaskId,
            runId: traceContext?.runId,
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { error: `TRACE MCP HTTP ${res.status}` };
    const body = (await res.json()) as {
      result?: { content?: Array<{ text?: string }> };
      error?: unknown;
    };
    const text = body.result?.content?.[0]?.text;
    if (!text) return body.error ?? null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (e) {
    return { error: `TRACE MCP unavailable: ${(e as Error).message}` };
  }
}

// ── In-process tool dispatch ───────────────────────────────────────────────────

interface ToolResult {
  tool: string;
  result: unknown;
  errorMsg?: string;
}

type GoHit = { clusterKey?: string; topoClass?: string; path?: string; score?: number };

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  options?: {
    goRetrievalHits?: GoHit[];
    parentTaskId?: string;
    runId?: string;
  }
): Promise<ToolResult> {
  try {
    if (name.startsWith('kb_') || name.startsWith('kb.')) {
      const toolName = name.replace(/_/g, '.'); // kb_search_cards -> kb.search_cards
      return {
        tool: name,
        result: await callTraceMcp(toolName, args, {
          parentTaskId: options?.parentTaskId,
          runId: options?.runId,
        }),
      };
    }

    if (name === 'rag_search') {
      const query = String(args.query ?? '');
      const collection = String(args.collection ?? 'research_summaries');
      const topK = Math.min(Number(args.topK ?? 5), 20);

      let emb: number[] | null = null;
      try {
        emb = await Promise.race([
          generateEmbedding(query),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('embed-timeout')), 12_000)
          ),
        ]);
      } catch {
        emb = null;
      }
      if (!emb)
        return { tool: name, result: [], errorMsg: 'Embedding unavailable (VRAM contention)' };

      const VALID = [
        'research_summaries',
        'codebase_chunks_768',
        'legal_documents',
        'evidence_items',
      ] as const;
      const col = VALID.includes(collection as (typeof VALID)[number])
        ? (collection as (typeof VALID)[number])
        : 'research_summaries';

      const hits = await qdrant.hybridSearch({
        collection: col,
        query,
        queryEmbedding: emb,
        limit: topK,
      });

      return {
        tool: name,
        result: hits.results.map((h) => ({
          id: h.id,
          score: h.score,
          summary: (h.payload?.['summary'] ?? h.payload?.['content'] ?? '') as string,
          title: (h.payload?.['title'] ?? '') as string,
          source: (h.payload?.['source'] ?? col) as string,
          pipeline: (h.payload?.['pipeline'] ?? '') as string,
        })),
      };
    }

    if (name === 'case_search') {
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit ?? 5), 20);

      const { rows } = await pool.query<{
        id: string;
        title: string;
        status: string;
        description: string | null;
      }>(
        `SELECT id, title, status, description
           FROM cases
          WHERE to_tsvector('english', title || ' ' || COALESCE(description, ''))
                  @@ plainto_tsquery('english', $1)
          ORDER BY ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')),
                           plainto_tsquery('english', $1)) DESC
          LIMIT $2`,
        [query, limit]
      );

      return { tool: name, result: rows };
    }

    if (name === 'memory_recall') {
      const query = String(args.query ?? '');
      const topK = Math.min(Number(args.topK ?? 3), 10);

      let emb: number[] | null = null;
      try {
        emb = await Promise.race([
          generateEmbedding(query),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('embed-timeout')), 12_000)
          ),
        ]);
      } catch {
        emb = null;
      }
      if (!emb)
        return { tool: name, result: [], errorMsg: 'Embedding unavailable (VRAM contention)' };

      const modules = await selectAdaptiveMemory(emb, topK);
      return {
        tool: name,
        result: modules.map((m) => ({
          hash: m.hyperedgeHash,
          grade: m.gradeLabel,
          score: m.gradeScore,
          pipeline: m.pipeline,
          summary: m.summary,
          members: m.memberCount,
          similarity: m.similarity,
          loraHint: m.loraHint,
        })),
      };
    }

    if (name === 'hyperedge_stats') {
      const minGrade = (args.minGrade as 'A' | 'B' | 'C') ?? 'B';
      const limit = Math.min(Number(args.limit ?? 5), 20);

      const edges = await queryTopHyperedges(minGrade, limit);
      return {
        tool: name,
        result: edges.map((e) => ({
          hash: e.hash,
          grade: e.gradeLabel,
          score: e.gradeScore,
          pipeline: e.pipeline,
          members: e.memberIds.length,
          summary: e.summary?.slice(0, 300) ?? '',
        })),
      };
    }

    if (name === 'topology_search') {
      const query = String(args.query ?? '').trim();
      const radius = Math.min(Math.max(Number(args.radius ?? 0.25), 0.05), 2.0);
      const limit = Math.min(Number(args.limit ?? 15), 40);
      const somCluster = args.somCluster != null ? Number(args.somCluster) : undefined;

      const result = await queryTopology(query, { radius, limit, somCluster });
      if (!result) {
        return {
          tool: name,
          result: [],
          errorMsg:
            'Topology search engine unavailable (port 8101). Run: node scripts/topology-search-server.mjs',
        };
      }

      return {
        tool: name,
        result: {
          center: result.center,
          radius: result.radius,
          totalFound: result.totalFound,
          durationMs: result.durationMs,
          hits: (result.hits ?? []).slice(0, limit).map((h) => ({
            path: h.path,
            topoClass: h.topoClass,
            topoHex: h.topoHex,
            somCluster: h.somCluster,
            hybridScore: h.hybridScore ?? h.manifoldScore,
            cosineScore: h.cosineScore ?? null,
            manifoldDistance: h.manifoldDistance ?? null,
            graphAuthorityScore: h.graphAuthorityScore ?? null,
            summary: h.summary ?? h.contentPreview ?? '',
          })),
        },
      };
    }

    if (name === 'web_search') {
      const query = String(args.query ?? '').trim();
      const maxResults = Math.min(Math.max(Number(args.maxResults ?? 3), 1), 5);
      if (!query) return { tool: name, result: [] };

      const cacheKey = `websearch:${fnv1a32(query)}`;

      // 1. Redis cache hit
      try {
        const { getRedis } = await import('$lib/server/redis.js');
        const redis = getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          return { tool: name, result: JSON.parse(cached) };
        }
      } catch {
        /* Redis unavailable — continue */
      }

      // 2. SearXNG
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        const params = new URLSearchParams({
          q: query,
          format: 'json',
          engines: 'google,duckduckgo,bing',
          language: 'en',
          safesearch: '1',
        });
        const res = await fetch(`${ENV.SEARXNG_URL}/search?${params}`, {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        }).finally(() => clearTimeout(tid));

        if (res.ok) {
          const body = (await res.json()) as {
            results?: Array<{ title?: string; url?: string; content?: string }>;
          };
          const hits = (body.results ?? []).slice(0, maxResults).map((r) => ({
            title: String(r.title ?? '').slice(0, 120),
            url: String(r.url ?? ''),
            snippet: String(r.content ?? '').slice(0, 400),
            source: 'searxng' as const,
          }));

          if (hits.length > 0) {
            try {
              const { getRedis } = await import('$lib/server/redis.js');
              const redis = getRedis();
              await redis.set(cacheKey, JSON.stringify(hits), 'EX', 3600);
            } catch {
              /* non-fatal */
            }
            return { tool: name, result: hits };
          }
        }
      } catch {
        /* SearXNG unreachable — fall through to Qdrant */
      }

      // 3. Qdrant research_summaries semantic fallback
      try {
        const emb = await Promise.race([
          generateEmbedding(query),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('embed-timeout')), 12_000)
          ),
        ]).catch(() => null);
        if (emb) {
          const hits = await qdrant.hybridSearch({
            collection: 'research_summaries',
            query,
            queryEmbedding: emb,
            limit: maxResults,
          });
          const results = hits.results
            .filter((h) => h.score > 0.5)
            .map((h) => ({
              title: String(h.payload?.['title'] ?? 'Research Note'),
              url: String(h.payload?.['source'] ?? ''),
              snippet: String(h.payload?.['summary'] ?? '').slice(0, 400),
              source: 'qdrant_fallback' as const,
            }));
          if (results.length > 0) return { tool: name, result: results };
        }
      } catch {
        /* non-fatal */
      }

      return { tool: name, result: [] };
    }

    if (name === 'read_file') {
      const fp = String(args.filePath ?? '');
      if (!fp.startsWith('src/'))
        return { tool: name, result: null, errorMsg: 'Access denied: outside src/' };
      const abs = path.join(process.cwd(), fp);
      try {
        const content = await fs.readFile(abs, 'utf-8');
        return { tool: name, result: { content, lines: content.split('\n').length } };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'LLMS.md') {
      const p = String(args.path ?? '');
      if (!p) return { tool: name, result: null, errorMsg: 'path is required' };
      try {
        const { resolveAgentsMdQuickHit } = await import('$lib/server/graph/community-graph.js');
        const hit = await resolveAgentsMdQuickHit(p);
        if (!hit) {
          return {
            tool: name,
            result: null,
            errorMsg: 'No LLMS.md found for this path (run `npm run llms:write`)',
          };
        }
        return {
          tool: name,
          result: {
            path: p,
            markdown: hit.markdown,
            length: hit.markdown.length,
            resolvedBy: hit.source,
            resolvedPath: hit.resolvedPath,
            resolvedKey: hit.resolvedKey ?? null,
          },
        };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'verify_fix') {
      const fp = String(args.filePath ?? '');
      const full = Boolean(args.checkFull ?? false);
      const res = await LinterService.verifySvelteFile(fp, { checkFull: full });
      return { tool: name, result: res };
    }

    if (name === 'apply_shadow_patch') {
      const fp = String(args.filePath ?? '');
      const patch = String(args.patch ?? '');
      if (!fp.startsWith('src/'))
        return { tool: name, result: null, errorMsg: 'Access denied: outside src/' };
      const abs = path.join(process.cwd(), fp);
      const bak = `${abs}.bak`;

      try {
        if (!process.env.DEV_BYPASS_AUTH)
          return { tool: name, result: null, errorMsg: 'Write access disabled' };
        await fs.copyFile(abs, bak);
        await fs.writeFile(abs, patch, 'utf-8');
        return { tool: name, result: { success: true, backup: bak } };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'revert_fix') {
      const fp = String(args.filePath ?? '');
      const abs = path.join(process.cwd(), fp);
      const bak = `${abs}.bak`;
      try {
        await fs.copyFile(bak, abs);
        await fs.unlink(bak);
        return { tool: name, result: { success: true } };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'graph_search') {
      const { searchGraph } = await import('$lib/server/graph/graph-intel.js');
      const query = String(args.query ?? '');
      const topK = Math.min(Number(args.topK ?? 8), 20);
      const onlyRoutes = Boolean(args.onlyRoutes ?? false);
      const onlyNoAuth = Boolean(args.onlyNoAuth ?? false);
      const hasTodos = Boolean(args.hasTodos ?? false);
      const hits = await searchGraph(query, topK, { onlyRoutes, onlyNoAuth, hasTodos });
      return { tool: name, result: hits };
    }

    if (name === 'wiki_note_lookup') {
      const { lookupWikiNotes } = await import('$lib/server/graph/graph-intel.js');
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit ?? 5), 15);
      const notes = await lookupWikiNotes(query, limit);
      return { tool: name, result: notes };
    }

    if (name === 'audit_hotspots') {
      const { getAuditHotspots } = await import('$lib/server/graph/graph-intel.js');
      const limit = Math.min(Number(args.limit ?? 10), 30);
      const hotspots = await getAuditHotspots(limit);
      return { tool: name, result: hotspots };
    }

    if (name === 'trace_search') {
      const query = String(args.query ?? '');
      const topK = Math.min(Number(args.topK ?? 5), 15);
      const intent = Array.isArray(args.intent) ? args.intent.map(String) : undefined;

      const emb = await generateEmbedding(query).catch(() => null);
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable' };

      const { traceRerank } = await import('../../../ai/trace-reranker.js');
      const hits = await traceRerank({
        query,
        queryEmbedding: emb,
        limit: topK,
        intentOverride: intent,
      });

      return {
        tool: name,
        result: hits.map((h) => ({
          id: h.id,
          score: h.score,
          path: h.payload?.path,
          content: (h.payload?.content ?? '').slice(0, 1000),
          lenses: h.lenses,
          tags: h.payload?.tags,
        })),
      };
    }

    // ── TRACE MCP graph tools — proxy to :8788 ─────────────────────────────
    if (name === 'graph_expand' || name === 'graph.expand_neighborhood') {
      const sourceRefs = Array.isArray(args.sourceRefs)
        ? args.sourceRefs.map((ref) => String(ref)).filter(Boolean)
        : [];
      const stableKey = String(args.stableKey ?? '');
      const maxHops = Math.min(Math.max(Number(args.maxHops ?? args.depth ?? 2), 1), 2);
      const limit = Math.min(Number(args.limit ?? 30), 80);
      const payload =
        sourceRefs.length > 0
          ? { sourceRefs, maxHops, limit }
          : { stableKey, depth: maxHops, limit };
      const data = await callTraceMcp('graph.expand_neighborhood', payload);
      return { tool: name, result: data };
    }

    if (name === 'graph_path' || name === 'graph.shortest_path') {
      const fromKey = String(args.fromKey ?? '');
      const toKey = String(args.toKey ?? '');
      const maxHops = Math.min(Number(args.maxHops ?? 5), 8);
      const data = await callTraceMcp('graph.shortest_path', { fromKey, toKey, maxHops });
      return { tool: name, result: data };
    }

    if (name === 'graph_community' || name === 'graph.community_for_node') {
      const stableKey = String(args.stableKey ?? '');
      const data = await callTraceMcp('graph.community_for_node', { stableKey });
      return { tool: name, result: data };
    }

    if (name === 'graph_pagerank' || name === 'graph.pagerank_top') {
      const limit = Math.min(Number(args.limit ?? 15), 50);
      const nodeType = args.nodeType ? String(args.nodeType) : undefined;
      const data = await callTraceMcp('graph.pagerank_top', {
        limit,
        ...(nodeType ? { nodeType } : {}),
      });
      return { tool: name, result: data };
    }

    if (name === 'search_postgres_fts' || name === 'search.postgres_fts') {
      const query = String(args.query ?? '');
      const topoClass = args.topoClass ? String(args.topoClass) : undefined;
      const limit = Math.min(Number(args.limit ?? 10), 30);
      const data = await callTraceMcp('search.postgres_fts', {
        query,
        limit,
        ...(topoClass ? { topo_class: topoClass } : {}),
      });
      return { tool: name, result: data };
    }

    if (name === 'search_hybrid' || name === 'search.hybrid') {
      const query = String(args.query ?? '');
      const topoClass = args.topoClass ? String(args.topoClass) : undefined;
      const limit = Math.min(Number(args.limit ?? 10), 30);
      const data = await callTraceMcp('search.hybrid', {
        query,
        limit,
        ...(topoClass ? { topo_class: topoClass } : {}),
      });
      return { tool: name, result: data };
    }

    if (name === 'topology_search_4d' || name === 'topology.search_4d') {
      const som_x = Number(args.som_x ?? 0);
      const som_y = Number(args.som_y ?? 0);
      const semantic_z = args.semantic_z != null ? Number(args.semantic_z) : undefined;
      const grpo_w = args.grpo_w != null ? Number(args.grpo_w) : undefined;
      const radius = Math.min(Math.max(Number(args.radius ?? 0.5), 0.01), 5.0);
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const filters =
        args.filters && typeof args.filters === 'object'
          ? (args.filters as Record<string, unknown>)
          : undefined;
      const data = await callTraceMcp('topology.search_4d', {
        som_x,
        som_y,
        radius,
        limit,
        ...(semantic_z != null ? { semantic_z } : {}),
        ...(grpo_w != null ? { grpo_w } : {}),
        ...(filters ? { filters } : {}),
      });
      // Accumulate hits for cluster context injection before final synthesis
      const topoNorm = data as { ok?: boolean; hits?: Array<Record<string, unknown>> };
      if (options?.goRetrievalHits && topoNorm?.ok && Array.isArray(topoNorm.hits)) {
        for (const h of topoNorm.hits.slice(0, 20)) {
          options.goRetrievalHits.push({
            clusterKey: h.clusterKey != null ? String(h.clusterKey) : undefined,
            topoClass: h.topoClass != null ? String(h.topoClass) : undefined,
            path: h.path != null ? String(h.path) : undefined,
            score: h.score != null ? Number(h.score) : undefined,
          });
        }
      }
      return { tool: name, result: data };
    }

    if (name === 'search_go_hybrid' || name === 'search.go_hybrid') {
      const query = String(args.query ?? '');
      const type = ['codebase', 'legal', 'hybrid'].includes(String(args.type ?? ''))
        ? String(args.type)
        : 'codebase';
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const filters =
        args.filters && typeof args.filters === 'object'
          ? (args.filters as Record<string, unknown>)
          : undefined;
      const data = await callTraceMcp('search.go_hybrid', {
        query,
        type,
        limit,
        ...(filters ? { filters } : {}),
      });
      // Accumulate hits for cluster context injection before final synthesis
      const goNorm = data as { ok?: boolean; hits?: Array<Record<string, unknown>> };
      if (options?.goRetrievalHits && goNorm?.ok && Array.isArray(goNorm.hits)) {
        for (const h of goNorm.hits.slice(0, 20)) {
          options.goRetrievalHits.push({
            clusterKey: h.clusterKey != null ? String(h.clusterKey) : undefined,
            topoClass: h.topoClass != null ? String(h.topoClass) : undefined,
            path: h.path != null ? String(h.path) : undefined,
            score: h.score != null ? Number(h.score) : undefined,
          });
        }
      }
      return { tool: name, result: data };
    }

    if (name === 'trace.kag_search' || name === 'trace_kag_search') {
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit ?? 5), 15);
      return { tool: name, result: await callTraceMcp('trace.kag_search', { query, limit }) };
    }

    if (name === 'trace.explain_retrieval' || name === 'trace_explain_retrieval') {
      const query = String(args.query ?? '');
      const stableKeys = Array.isArray(args.stableKeys) ? args.stableKeys.map(String) : [];
      return {
        tool: name,
        result: await callTraceMcp('trace.explain_retrieval', { query, stableKeys }),
      };
    }

    if (name === 'topology.same_som_cluster' || name === 'topology_same_som_cluster') {
      const stableKey = String(args.stableKey ?? '');
      const limit = Math.min(Number(args.limit ?? 20), 50);
      return {
        tool: name,
        result: await callTraceMcp('topology.same_som_cluster', { stableKey, limit }),
      };
    }

    if (name === 'clusters.get_members' || name === 'clusters_get_members') {
      const clusterKey = String(args.clusterKey ?? '');
      const limit = Math.min(Number(args.limit ?? 30), 100);
      return {
        tool: name,
        result: await callTraceMcp('clusters.get_members', { clusterKey, limit }),
      };
    }

    if (name === 'clusters.get_summary_lenses' || name === 'clusters_get_summary_lenses') {
      const clusterKey = String(args.clusterKey ?? '');
      const lenses = Array.isArray(args.lenses) ? args.lenses.map(String) : undefined;
      return {
        tool: name,
        result: await callTraceMcp('clusters.get_summary_lenses', {
          clusterKey,
          ...(lenses ? { lenses } : {}),
        }),
      };
    }

    if (name === 'research.encode' || name === 'research_encode') {
      const content = String(args.content ?? '').trim();
      const title = String(args.title ?? '').slice(0, 80);
      const source = String(args.source ?? 'agent');
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
      if (!content) return { tool: name, result: null, errorMsg: 'content is required' };
      try {
        const { validateInformationGain, heuristicQualityCheck } = await import(
          './information-gain-validator.js'
        );
        if (!heuristicQualityCheck(content))
          return {
            tool: name,
            result: { encoded: false, reason: 'heuristic quality check failed' },
          };
        const emb = await generateEmbedding(title || content.slice(0, 200)).catch(() => null);
        let existingText = '';
        if (emb) {
          const existing = await qdrant.hybridSearch({
            collection: 'research_summaries',
            query: title || content.slice(0, 100),
            queryEmbedding: emb,
            limit: 1,
          });
          existingText = (existing.results[0]?.payload?.['summary'] as string) ?? '';
        }
        const validation = await validateInformationGain({
          context: title,
          existing: existingText,
          candidate: content,
        });
        if (!validation.success || !validation.shouldUpdate || (validation.gainScore ?? 0) < 0.25)
          return {
            tool: name,
            result: {
              encoded: false,
              reason: `gain check rejected (score=${validation.gainScore?.toFixed(2)})`,
            },
          };
        const { archiveSynthesisMemory } = await import(
          '$lib/server/indexer/synthesis-memory-archiver.js'
        );
        await archiveSynthesisMemory({
          title,
          content,
          source,
          tags,
          metadata: { gainScore: validation.gainScore },
        });
        return { tool: name, result: { encoded: true, gainScore: validation.gainScore, title } };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: (e as Error).message };
      }
    }

    // ── KV context tools — proxy to trace-mcp-server :8788 ────────────────
    if (name === 'context.build_kv_packet' || name === 'context_build_kv_packet') {
      const taskId = String(args.taskId ?? `agent:${Date.now()}`);
      const q = String(args.query ?? '');
      const files = Array.isArray(args.hotFiles) ? (args.hotFiles as string[]) : [];
      const syms = Array.isArray(args.hotSymbols) ? (args.hotSymbols as string[]) : [];
      const blocked = Array.isArray(args.blockedAreas) ? (args.blockedAreas as string[]) : [];
      const maxTok = Math.min(Number(args.maxInputTokens ?? 12000), 32000);
      return {
        tool: name,
        result: await callTraceMcp('context.build_kv_packet', {
          taskId,
          query: q,
          hotFiles: files,
          hotSymbols: syms,
          blockedAreas: blocked,
          maxInputTokens: maxTok,
        }),
      };
    }

    if (name === 'context.get_compressed_card' || name === 'context_get_compressed_card') {
      const stableKey = String(args.stableKey ?? '');
      if (!stableKey) return { tool: name, result: null, errorMsg: 'stableKey is required' };
      return {
        tool: name,
        result: await callTraceMcp('context.get_compressed_card', { stableKey }),
      };
    }

    if (name === 'context.explain_compression' || name === 'context_explain_compression') {
      return {
        tool: name,
        result: await callTraceMcp('context.explain_compression', {
          taskId: String(args.taskId ?? ''),
        }),
      };
    }

    if (name === 'context.refresh_task_toc' || name === 'context_refresh_task_toc') {
      const taskId = String(args.taskId ?? '');
      const files = Array.isArray(args.hotFiles) ? (args.hotFiles as string[]) : [];
      const syms = Array.isArray(args.hotSymbols) ? (args.hotSymbols as string[]) : [];
      const blocked = Array.isArray(args.blockedAreas) ? (args.blockedAreas as string[]) : [];
      return {
        tool: name,
        result: await callTraceMcp('context.refresh_task_toc', {
          taskId,
          hotFiles: files,
          hotSymbols: syms,
          blockedAreas: blocked,
        }),
      };
    }

    if (
      name === 'task_pick_next_semantic_packet' ||
      name === 'task.pick_next_semantic_packet'
    ) {
      const lane = String(args.lane ?? 'semantic_packet');
      const enqueueIfMissing = args.enqueueIfMissing !== false;
      return {
        tool: name,
        result: await callTraceMcp('task.pick_next_semantic_packet', {
          lane,
          enqueueIfMissing,
        }),
      };
    }

    if (
      name === 'task_run_semantic_packet_workflow' ||
      name === 'task.run_semantic_packet_workflow'
    ) {
      const taskId = Number(args.taskId ?? 0);
      return {
        tool: name,
        result: await callTraceMcp('task.run_semantic_packet_workflow', {
          taskId,
        }),
      };
    }

    if (name === 'search.dev_context' || name === 'search__dev_context') {
      const query = String(args.query ?? '');
      const filePath = args.filePath ? String(args.filePath) : undefined;
      const limit = Math.min(Number(args.limit ?? 8), 20);
      return {
        tool: name,
        result: await callTraceMcp('search.dev_context', {
          query,
          limit,
          ...(filePath ? { filePath } : {}),
        }),
      };
    }

    if (name === 'kag.record_agent_run') {
      return {
        tool: name,
        result: await callTraceMcp('kag.record_agent_run', {
          taskId: String(args.taskId ?? `kag-${Date.now().toString(36)}`),
          errorSummary: String(args.errorSummary ?? args.summary ?? ''),
          files: Array.isArray(args.files) ? args.files : [],
          tags: Array.isArray(args.tags) ? args.tags : [],
          confidence: typeof args.confidence === 'number' ? args.confidence : 0.5,
          patchResult: String(args.patchResult ?? 'unknown'),
          researchNotes: args.researchNotes ? String(args.researchNotes) : undefined,
          needsDeepResearch: Boolean(args.needsDeepResearch ?? false),
        }),
      };
    }

    if (name === 'kag.ingest_memory_directory') {
      return {
        tool: name,
        result: await callTraceMcp('kag.ingest_memory_directory', {
          dir: args.dir ? String(args.dir) : undefined,
        }),
      };
    }

    return { tool: name, result: null, errorMsg: `Unknown tool: ${name}` };
  } catch (err) {
    return { tool: name, result: null, errorMsg: (err as Error).message };
  }
}

// ── Public result type ────────────────────────────────────────────────────────

export interface AgentRunResult {
  answer: string;
  toolsUsed: string[];
  rounds: number;
  sources: unknown[];
  durationMs: number;
  cacheTier?: 'L1_redis' | 'L2_qdrant' | 'L3_ollama';
  cacheLatencyMs?: number;
  cacheTrace?: LlmCacheTrace;
  errorFixMemoryHit?: boolean;
  verificationStatus?: string;
  requestedBackend?: 'bifrost' | 'turboquant';
  inferenceBackend?: 'bifrost' | 'turboquant' | 'ollama' | 'cache';
  backendFallbackReason?: string;
  yorha?: Record<string, unknown>;
  /** Cluster context derived from Go/topology tool results during this agent run. */
  goToolClusterContext?: Array<{
    clusterId: number;
    clusterKey?: string;
    topoClass: string;
    chunkCount: number;
    topFiles?: string[];
    synthesisSuggestion: string;
    communityId: string | null;
    graphAuthorityScore: number | null;
  }>;
}

// ── Agent loop ────────────────────────────────────────────────────────────────

// Tools that write state — their results must never be served from cache.
// Serving a stale "patch applied" or "file written" response to a different
// caller would silently corrupt state (side-effect cache poisoning).
const SIDE_EFFECT_TOOLS = new Set(['apply_shadow_patch', 'revert_fix', 'verify_fix']);

function getPreferredBackend(
  metadata?: Record<string, unknown>,
  runtime?: ReturnType<typeof resolveRuntimeConfig>
): 'bifrost' | 'turboquant' {
  const config = runtime ?? resolveRuntimeConfig();
  const isTurboRequested = metadata?.preferredBackend === 'turboquant';
  return gatePreferredBackend(isTurboRequested ? 'turboquant' : undefined, config) as
    | 'bifrost'
    | 'turboquant';
}

export async function runGemma4Agent(
  query: string,
  options?: {
    systemPrompt?: string;
    pipeline?: string;
    userId?: string;
    sessionId?: string;
    bypassCache?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<AgentRunResult> {
  const t0 = Date.now();
  const pipeline = options?.pipeline ?? 'ace';
  const toolsUsed: string[] = [];
  const sources: unknown[] = [];
  // Accumulates cluster/topology hits from Go retrieval tools across all rounds.
  // Converted to ClusterContextPacket[] and injected before final synthesis.
  const goRetrievalHits: Array<{
    clusterKey?: string;
    topoClass?: string;
    path?: string;
    score?: number;
  }> = [];
  // Bypass cache when caller requests it, or when side-effect tools were used
  let hasSideEffect = false;
  let bypassCache = options?.bypassCache ?? false;

  // ── Level-1: stable system prefix (KV-cacheable on llama-server) ──────────
  // When a caller provides a custom systemPrompt (e.g. tests / raw mode) we
  // use it verbatim. Otherwise we use the stable TRACE agent prefix so
  // llama-server can reuse its KV cache across calls.
  let system: string;
  let kvPacketText = '';
  if (options?.systemPrompt) {
    system = options.systemPrompt;
  } else {
    const { getStableSystemPrefix } = await import('./kv-context-controller.js').catch(() => ({
      getStableSystemPrefix: () => buildAgentSystemPrompt(),
    }));
    system = getStableSystemPrefix();

    // ── Level 2 + 3: build KV context packet when caller provides hints ────
    const taskId =
      typeof options?.metadata?.taskId === 'string' ? options.metadata.taskId : undefined;
    const hotFiles = Array.isArray(options?.metadata?.hotFiles)
      ? (options!.metadata!.hotFiles as string[])
      : [];
    const hotSymbols = Array.isArray(options?.metadata?.hotSymbols)
      ? (options!.metadata!.hotSymbols as string[])
      : [];
    const blocked = Array.isArray(options?.metadata?.blockedAreas)
      ? (options!.metadata!.blockedAreas as string[])
      : [];

    if (taskId || hotFiles.length > 0) {
      try {
        const { buildKvContextPacket, formatKvPacketForPrompt } = await import(
          './kv-context-controller.js'
        );
        const packet = await buildKvContextPacket({
          taskId: taskId ?? `agent:${pipeline}:${Date.now()}`,
          query,
          hotFiles,
          hotSymbols,
          blockedAreas: blocked,
        });
        kvPacketText = formatKvPacketForPrompt(packet);
      } catch {
        /* non-fatal — run without KV packet */
      }
    }
  }

  // User content: prepend the KV packet (dynamic section) before the raw query
  const userContent = kvPacketText ? `${kvPacketText}\n\n---\n\nUser request: ${query}` : query;

  const messages: OllamaMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];

  let finalAnswer = '';
  let round = 0;
  let resultCacheTier: AgentRunResult['cacheTier'] = undefined;
  let resultCacheMs: number | undefined = undefined;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const runtime = resolveRuntimeConfig();
  const requestedBackend = getPreferredBackend(options?.metadata, runtime);
  let inferenceBackend: AgentRunResult['inferenceBackend'] = requestedBackend;
  let backendFallbackReason: string | undefined;

  // Error-fix memory pre-flight: if the query references an error / file /
  // route, look up any previously verified fix for it. Populates the
  // `errorFixMemoryHit` + `verificationStatus` fields on the result.
  const filePathMeta =
    typeof options?.metadata?.filePath === 'string' ? options.metadata.filePath : undefined;
  const routeMeta =
    typeof options?.metadata?.route === 'string' ? options.metadata.route : undefined;
  let errorFixMemoryHit = false;
  let verificationStatus: string | undefined;
  try {
    const prior = await getErrorFixMemory({
      errorText: query,
      filePath: filePathMeta,
      route: routeMeta,
    });
    if (prior) {
      errorFixMemoryHit = true;
      verificationStatus = prior.verificationStatus;
      // Inject the prior fix as a system hint so the model can reuse / refine
      messages.splice(1, 0, {
        role: 'system',
        content:
          `## Prior fix memory\n` +
          `Verification: ${prior.verificationStatus} · path: ${prior.filePath ?? 'n/a'} · tools: ${prior.toolCalls.join(', ')}\n\n` +
          `Diagnosis: ${prior.diagnosis}\n\n` +
          `Patch summary: ${prior.patchSummary}`.trim(),
      });
    }
  } catch {
    /* non-fatal — Redis miss is fine */
  }

  // ── Stuck detector ────────────────────────────────────────────────────────
  // Tracks how many times the same query fingerprint has been submitted.
  // When count ≥ 2 (same error pattern seen before without resolution), the
  // agent system prompt is updated to recommend kag.record_agent_run with
  // needsDeepResearch:true and the stuck flag propagates to yorhaMetadata.
  let isStuck = false;
  let stuckCount = 0;
  try {
    const { createHash: _sha } = await import('node:crypto');
    const queryHash = _sha('sha1').update(query.slice(0, 200)).digest('hex').slice(0, 12);
    const stuckKey = `kag:stuck:${queryHash}`;
    const { getRedis } = await import('$lib/server/redis.js');
    const _redis = getRedis();
    const raw = await _redis.get(stuckKey);
    stuckCount = raw ? parseInt(raw, 10) : 0;
    isStuck = stuckCount >= 2;

    // Increment counter (TTL 1h — resets after the session window)
    await _redis.setex(stuckKey, 3600, String(stuckCount + 1));

    if (isStuck) {
      messages.splice(1, 0, {
        role: 'system',
        content:
          `## Stuck detector — escalation required\n` +
          `This query pattern has been submitted ${stuckCount} time(s) without resolution.\n` +
          `After your analysis, call **kag.record_agent_run** with:\n` +
          `  taskId: "kag-${queryHash.slice(0, 8)}", needsDeepResearch: true\n` +
          `Do NOT retry the same approach. Escalate or propose a fundamentally different fix.`,
      });
    }
  } catch {
    /* non-fatal — stuck detection is advisory */
  }

  // coding/openai-facade pipelines use MCP tool surface (LLAMA_TOOL_DEFINITIONS);
  // legal pipelines use in-process Ollama tools (AGENT_TOOLS).
  const isCodingPipeline = pipeline === 'openai-facade' || pipeline === 'coding';
  const activeTools = isCodingPipeline ? LLAMA_TOOL_DEFINITIONS : AGENT_TOOLS;

  const runPreferredToolCall = async (currentMessages: OllamaMessage[]) => {
    if (requestedBackend !== 'turboquant' || !canUseTurboQuant(runtime)) {
      inferenceBackend = 'bifrost';
      return bifrostChat(currentMessages, TOOL_MODEL, {
        tools: activeTools,
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: TIMEOUT_MS,
        cacheKey: `agent-tool-loop:${pipeline}`,
      });
    }

    try {
      inferenceBackend = 'turboquant';
      return await turboQuantChat(currentMessages, TOOL_MODEL, {
        tools: activeTools,
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: TIMEOUT_MS,
      });
    } catch (error) {
      backendFallbackReason = (error as Error).message;
      inferenceBackend = 'bifrost';
      return bifrostChat(currentMessages, TOOL_MODEL, {
        tools: activeTools,
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: TIMEOUT_MS,
        cacheKey: `agent-tool-loop:${pipeline}`,
      });
    }
  };

  // ── Pre-loop cache check (L1 Redis → L2 Qdrant) ──────────────────────────
  // Skip the entire tool-calling loop if a cached final answer exists.
  // Only applies when bypassCache is false AND caller didn't force fresh inference.
  if (!bypassCache) {
    try {
      const cached = await tieredLLMQuery(messages, {
        model: PLANNER_MODEL,
        temperature: 0.2,
        maxTokens: 2048,
        context: pipeline,
        bypassCache: false,
      });
      // Only accept cache hits — L3 would just be a cold Ollama call with no tools
      if (cached.tier !== 'L3_ollama') {
        finalAnswer = cached.response;
        resultCacheTier = cached.tier;
        resultCacheMs = cached.latencyMs;
        inferenceBackend = 'cache';
        round = 0; // no tool rounds consumed
      }
    } catch {
      // Cache unavailable — proceed normally
    }
  }

  while (!finalAnswer && round < MAX_ROUNDS) {
    round++;

    const rawResult = await runPreferredToolCall(messages);

    // Accumulate token counts across rounds (Ollama returns these on non-streaming calls)
    if (typeof rawResult === 'object' && rawResult !== null) {
      const rd = rawResult as Record<string, unknown>;
      if (typeof rd.prompt_eval_count === 'number') totalPromptTokens += rd.prompt_eval_count;
      if (typeof rd.eval_count === 'number') totalCompletionTokens += rd.eval_count;
    }

    const raw = rawResult as { content?: string; tool_calls?: OllamaToolCall[] } | string;
    const msgContent = typeof raw === 'string' ? raw : (raw.content ?? '');
    let toolCalls: OllamaToolCall[] | undefined =
      typeof raw !== 'string' ? raw.tool_calls : undefined;

    // Manual JSON fallback: if no native tool_calls, try parsing the content
    if (!toolCalls?.length && msgContent.trim()) {
      const parsed = parseToolRequest(msgContent);
      if (parsed.length) toolCalls = parsed;
    }

    const msg: OllamaMessage = {
      role: 'assistant',
      content: msgContent,
      tool_calls: toolCalls,
    };

    // Final answer — no tool calls
    if (!msg.tool_calls?.length) {
      finalAnswer = msg.content ?? '';
      break;
    }

    // Append the assistant's tool-call request to the conversation
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });

    // Execute each tool call in-process
    for (const tc of msg.tool_calls) {
      // Normalize LLAMA __ names → MCP dot names before allowlist/dispatch
      let name = tc.function.name;
      if (name.includes('__')) {
        const mcpName = LLAMA_TO_MCP_NAME[name];
        if (mcpName) name = mcpName;
      }
      // TurboQuant may return arguments as a JSON string; parse it to object
      const rawArgs = tc.function.arguments as unknown;
      const tArgs: Record<string, unknown> =
        typeof rawArgs === 'string'
          ? (() => {
              try {
                return JSON.parse(rawArgs) as Record<string, unknown>;
              } catch {
                return {};
              }
            })()
          : ((rawArgs as Record<string, unknown>) ?? {});

      // Enforce allowlist — skip tools the caller has not opted into
      const allowWrite = options?.metadata?.allowWriteTools === true;
      const allowGated = options?.metadata?.allowGatedTools === true;
      if (
        (ALLOWED_TOOLS.write.has(name) && !allowWrite) ||
        (ALLOWED_TOOLS.gated.has(name) && !allowGated) ||
        (!ALLOWED_TOOLS.read.has(name) &&
          !ALLOWED_TOOLS.write.has(name) &&
          !ALLOWED_TOOLS.gated.has(name))
      ) {
        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: `Tool "${name}" is not permitted in this context.` }),
        });
        continue;
      }

      toolsUsed.push(name);
      if (SIDE_EFFECT_TOOLS.has(name)) hasSideEffect = true;

      const result = await dispatchTool(name, tArgs ?? {}, {
        goRetrievalHits,
        parentTaskId: options?.metadata?.parentTaskId as string | undefined,
        runId: options?.metadata?.runId as string | undefined,
      });
      if (Array.isArray(result.result)) sources.push(...result.result);

      // Ollama expects role:"tool" messages with the result as content
      messages.push({
        role: 'tool',
        content: JSON.stringify(result.errorMsg ? { error: result.errorMsg } : result.result),
      });
    }
  }

  // Build cluster context from accumulated Go/topology tool hits.
  // Injected into messages so the model has structured cluster metadata
  // before it synthesises its final answer (HCA compression step).
  const goClusterPackets = buildGoClusterPackets(goRetrievalHits);
  if (goClusterPackets?.length && !finalAnswer) {
    const clusterBlock = goClusterPackets
      .map(
        (p) =>
          `[${p.clusterKey ?? p.clusterId}] ${p.topoClass}: ${p.chunkCount} hits` +
          `${p.topFiles?.length ? ', top: ' + p.topFiles.slice(0, 3).join(', ') : ''}`
      )
      .join('\n');
    messages.push({
      role: 'user' as const,
      content: `[CLUSTER CONTEXT from retrieval tools]\n${clusterBlock}`,
    });
  }

  // If we ran out of rounds without a final answer, synthesise one.
  // Use tieredLLMQuery so the synthesis is cached (L1→L2→L3).
  // Bypass cache when any side-effect tool ran — stale "patch applied"
  // answers must never be served to a different caller.
  if (!finalAnswer && round >= MAX_ROUNDS) {
    bypassCache = bypassCache || hasSideEffect;
    const finalMessages = [
      ...messages,
      {
        role: 'user' as const,
        content: 'Please now provide a final answer based on what you found.',
      },
    ];

    if (requestedBackend === 'turboquant' && canUseTurboQuant(runtime)) {
      try {
        inferenceBackend = 'turboquant';
        const forced = await turboQuantChat(finalMessages, PLANNER_MODEL, {
          temperature: 0.2,
          maxTokens: 2048,
          timeoutMs: TIMEOUT_MS,
        });
        finalAnswer = forced;
      } catch (error) {
        backendFallbackReason = backendFallbackReason ?? (error as Error).message;
        const forced = await tieredLLMQuery(finalMessages, {
          model: PLANNER_MODEL,
          temperature: 0.2,
          maxTokens: 2048,
          context: pipeline,
          bypassCache,
        });
        finalAnswer = forced.response;
        inferenceBackend = forced.tier === 'L3_ollama' ? 'ollama' : 'cache';
      }
    } else {
      const forced = await tieredLLMQuery(finalMessages, {
        model: PLANNER_MODEL,
        temperature: 0.2,
        maxTokens: 2048,
        context: pipeline,
        bypassCache,
      });
      finalAnswer = forced.response;
      inferenceBackend = forced.tier === 'L3_ollama' ? 'ollama' : 'cache';
    }
  }

  const durationMs = Date.now() - t0;
  const cacheTrace: LlmCacheTrace = {
    modelRole: 'gemma4-agent-planner',
    cacheTier: resultCacheTier ?? 'L4_none',
    tokenizerFamily: 'gemma',
    provider:
      inferenceBackend === 'turboquant'
        ? 'turboquant'
        : inferenceBackend === 'bifrost'
          ? 'bifrost'
          : inferenceBackend === 'ollama'
            ? 'ollama'
            : 'tiered-llm-cache',
    latencyMs: resultCacheMs ?? durationMs,
  };

  // Fire-and-forget token usage log (with template + pipeline context in metadata JSONB)
  trackTokenUsage({
    userId: options?.userId,
    endpoint: '/api/ai/agent',
    model: TOOL_MODEL,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    durationMs,
    cached: resultCacheTier !== undefined,
    metadata: {
      chatTemplate: 'gemma',
      pipeline,
      rounds: round,
      toolsUsed,
      cachedTier: resultCacheTier ?? null,
      cacheTrace,
      plannerModel: PLANNER_MODEL,
      toolModel: TOOL_MODEL,
      requestedBackend,
      inferenceBackend,
      backendFallbackReason: backendFallbackReason ?? null,
    },
  });

  // Inference observability — model_role + cache_tier for CI gate
  logInference({
    type: 'llm',
    model: PLANNER_MODEL,
    backend:
      inferenceBackend === 'turboquant'
        ? 'turboquant'
        : inferenceBackend === 'bifrost'
          ? 'bifrost'
          : 'ollama',
    latencyMs: durationMs,
    cacheHit: resultCacheTier !== undefined,
    metadata: {
      model_role: cacheTrace.modelRole,
      cache_tier: cacheTrace.cacheTier,
      toolsUsed,
      rounds: round,
      pipeline,
      requested_backend: requestedBackend,
      inference_backend: inferenceBackend,
      turbo_fallback_reason: backendFallbackReason ?? null,
    },
  });

  // Fire-and-forget timeline record
  db.insert(contextTimeline)
    .values({
      userId: options?.userId ? Number(options.userId) : null,
      sessionId: options?.sessionId ?? '',
      eventType: 'tool_call',
      pipeline,
      payload: {
        query,
        toolsUsed,
        rounds: round,
        durationMs,
        requestedBackend,
        inferenceBackend,
        backendFallbackReason: backendFallbackReason ?? null,
      } as Record<string, unknown>,
    })
    .catch(() => {
      /* non-fatal */
    });

  // Append a lightweight observation to the outcome ledger for downstream reward attribution
  void appendOutcomeLedger({
    source: 'gemma4-agent',
    intent: pipeline ?? query,
    tools: toolsUsed,
    sourceRefs: filePathMeta ? [filePathMeta] : [],
    graphVersion: process.env.ATLAS_VERSION ?? null,
    outcome: hasSideEffect ? 'side_effect' : 'answer',
    reward: null,
  });

  // Persist a fresh fix-memory entry when the agent ran a side-effect tool
  // (apply_shadow_patch / revert_fix / verify_fix). Verification status is
  // 'unknown' until the next agent run probes the same error and confirms
  // — that flips it to 'passed' or 'failed' via a separate update path.
  if (hasSideEffect && !errorFixMemoryHit) {
    void saveErrorFixMemory(
      { errorText: query, filePath: filePathMeta, route: routeMeta },
      {
        diagnosis: finalAnswer.slice(0, 600),
        patchSummary: toolsUsed.includes('apply_shadow_patch')
          ? 'Patch applied via apply_shadow_patch'
          : 'Side-effect tool sequence executed',
        verificationStatus: 'unknown',
        toolCalls: toolsUsed.filter((t) => SIDE_EFFECT_TOOLS.has(t)),
      }
    ).catch(() => null);
  }

  // ── 7. Encode (Long-term Memory) ───────────────────────────────────────────
  const MEMORY_THRESHOLDS = {
    synthesis_memory: 0.3,
    architecture_note: 0.35,
    bug_fix_memory: 0.25,
    audit_discovery: 0.2,
    user_instruction: 0.1,
    cluster_summary: 0.4,
    directory_summary: 0.35,
  };

  let yorhaMetadata: any = {
    traceUsed: true,
    memoryEncoded: false,
    informationGain: null,
    isStuck,
    stuckCount,
  };

  // If the answer is substantial and successful, archive it as synthesis memory
  if (
    finalAnswer.length > 500 &&
    !finalAnswer.includes("I don't know") &&
    !finalAnswer.includes('error')
  ) {
    try {
      const { validateInformationGain, heuristicQualityCheck } = await import(
        './information-gain-validator.js'
      );

      if (heuristicQualityCheck(finalAnswer)) {
        // 1. Look up existing memory for this query
        const emb = await generateEmbedding(query).catch(() => null);
        let existingText = '';

        if (emb) {
          const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
          const existing = await qdrant.hybridSearch({
            collection: 'synthesis_memory',
            query,
            queryEmbedding: emb,
            limit: 1,
          });
          existingText = (existing.results[0]?.payload?.content as string) ?? '';
        }

        // 2. Validate Information Gain via Gemma4
        const validation = await validateInformationGain({
          context: query,
          existing: existingText,
          candidate: finalAnswer,
        });

        // 3. Populate YorHA UI metadata
        yorhaMetadata.informationGain = {
          score: validation.gainScore,
          decision: validation.shouldUpdate ? 'accepted' : 'rejected',
          reason: validation.reasoning,
        };

        // 4. Archive only if it provides significant improvement (respecting threshold)
        const threshold = MEMORY_THRESHOLDS.synthesis_memory;
        if (
          validation.success &&
          validation.shouldUpdate &&
          (validation.gainScore ?? 0) >= threshold
        ) {
          const { archiveSynthesisMemory } = await import(
            '$lib/server/indexer/synthesis-memory-archiver.js'
          );
          await archiveSynthesisMemory({
            title: query.slice(0, 60),
            content: finalAnswer,
            source: `chat:${options?.sessionId ?? 'anon'}`,
            tags: toolsUsed,
            metadata: {
              gainScore: validation.gainScore,
              reasoning: validation.reasoning,
              validated_at: new Date().toISOString(),
            },
          });
          yorhaMetadata.memoryEncoded = true;
          console.log(
            `[agent] High-gain memory encoded: ${query.slice(0, 30)}... (Gain: ${validation.gainScore})`
          );
        }
      }
    } catch (e) {
      console.error('[agent] Memory encoding failed:', e);
      /* non-fatal */
    }
  }

  return {
    answer: finalAnswer,
    toolsUsed,
    rounds: round,
    sources,
    durationMs: Date.now() - t0,
    cacheTier: resultCacheTier,
    cacheLatencyMs: resultCacheMs,
    errorFixMemoryHit,
    verificationStatus,
    inferenceBackend,
    requestedBackend,
    backendFallbackReason,
    yorha: yorhaMetadata,
    goToolClusterContext: goClusterPackets?.length ? goClusterPackets : undefined,
  };
}
