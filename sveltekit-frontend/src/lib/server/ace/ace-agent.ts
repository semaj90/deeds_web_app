/**
 * ace-agent.ts — Multi-step Gemma 4 agentic loop for ACE code-intel queries.
 *
 * Uses callGemma4WithTools() to:
 *   1. Let Gemma 4 decide which tools to call (search_codebase, get_cluster, get_evidence, etc.)
 *   2. Execute those tools locally against real data (Qdrant, DB, Redis)
 *   3. Feed results back until Gemma 4 has enough context for a final answer
 *
 * Exports:
 *   ACE_TOOLS         — the tool registry (extend as needed)
 *   runAceAgentQuery  — top-level entry point; returns typed result
 */

import { ENV } from '$lib/server/env.server.js';
import { acePromptPreflightTool } from '$lib/server/ai/ace-prompt-preflight-tool.js';
import { callGemma4WithTools, type Gemma4Tool, type Gemma4ToolCallResult } from './gemma4-codeintel.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions + executors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * search_codebase — semantic search against the Qdrant codebase_chunks_768 collection.
 * Returns top-K chunk summaries + file paths for Gemma 4 to reason over.
 */
const searchCodebase: Gemma4Tool = {
  name: 'search_codebase',
  description: 'Semantic search over the indexed codebase. Returns relevant file paths and code summaries.',
  parameters: {
    type: 'object',
    properties: {
      query:  { type: 'string',  description: 'Natural-language search query' },
      top_k:  { type: 'integer', description: 'Max results to return (default 5)' },
      domain: { type: 'string',  description: 'Optional filter: server | client | db | api | tests' },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const query  = String(args.query ?? '');
    const topK   = Number(args.top_k  ?? 5);
    const domain = args.domain ? String(args.domain) : undefined;

    try {
      // Embed the query then hit Qdrant
      const embedResp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest', input: query }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!embedResp.ok) throw new Error(`Embed HTTP ${embedResp.status}`);
      const embedData = await embedResp.json() as { embeddings?: number[][] };
      const vector = embedData.embeddings?.[0];
      if (!vector?.length) throw new Error('Empty embedding');

      const filter = domain
        ? { must: [{ key: 'domain', match: { value: domain } }] }
        : undefined;

      const qdrantResp = await fetch(
        `${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vector, limit: topK, with_payload: true, ...(filter ? { filter } : {}) }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!qdrantResp.ok) throw new Error(`Qdrant HTTP ${qdrantResp.status}`);
      const qdrantData = await qdrantResp.json() as { result?: Array<{ payload?: Record<string, unknown>; score: number }> };

      const hits = (qdrantData.result ?? []).map(r => {
        const p = r.payload ?? {};
        return `[${(r.score * 100).toFixed(0)}%] ${p.relative_path ?? p.file_path ?? 'unknown'} — ${String(p.summary ?? p.content ?? '').slice(0, 200)}`;
      });

      return hits.length ? hits.join('\n') : 'No matching chunks found.';
    } catch (err) {
      return `search_codebase error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/**
 * get_cluster_summary — returns the stored metadata for a GPU cluster index.
 */
const getClusterSummary: Gemma4Tool = {
  name: 'get_cluster_summary',
  description: 'Get the stored summary, purpose, and tags for a specific GPU cluster ID.',
  parameters: {
    type: 'object',
    properties: {
      cluster_id: { type: 'integer', description: 'The numeric GPU cluster index (0-based)' },
    },
    required: ['cluster_id'],
  },
  execute: async (args) => {
    const clusterId = Number(args.cluster_id ?? -1);
    if (clusterId < 0) return 'Error: cluster_id must be a non-negative integer';

    try {
      const qdrantResp = await fetch(
        `${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { must: [{ key: 'gpu_cluster', match: { value: clusterId } }] },
            limit:  1,
            with_payload: true,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!qdrantResp.ok) throw new Error(`Qdrant HTTP ${qdrantResp.status}`);
      const data = await qdrantResp.json() as { result?: { points: Array<{ payload?: Record<string, unknown> }> } };
      const point = data.result?.points?.[0];
      if (!point?.payload) return `No data found for cluster ${clusterId}`;

      const p = point.payload;
      const lines = [
        `Cluster ${clusterId}`,
        p.purpose  ? `Purpose: ${p.purpose}` : '',
        p.summary  ? `Summary: ${String(p.summary).slice(0, 400)}` : '',
        p.tags     ? `Tags: ${Array.isArray(p.tags) ? p.tags.join(', ') : String(p.tags)}` : '',
        p.warnings ? `Warnings: ${Array.isArray(p.warnings) ? p.warnings.join('; ') : String(p.warnings)}` : '',
      ].filter(Boolean);
      return lines.join('\n');
    } catch (err) {
      return `get_cluster_summary error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/**
 * lookup_research_summary — finds stored research summaries relevant to a keyword.
 */
const lookupResearchSummary: Gemma4Tool = {
  name: 'lookup_research_summary',
  description: 'Search the research_summaries table for stored analysis results matching a keyword.',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: 'Keyword or phrase to search within summary text' },
      limit:   { type: 'integer', description: 'Max results (default 3)' },
    },
    required: ['keyword'],
  },
  execute: async (args) => {
    const keyword = String(args.keyword ?? '').slice(0, 100);
    const limit   = Math.min(Number(args.limit ?? 3), 10);

    try {
      const resp = await fetch(
        `${ENV.PUBLIC_API_URL}/api/analytics/research-graph`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'search', query: keyword, topK: limit }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!resp.ok) throw new Error(`research-graph HTTP ${resp.status}`);
      const data = await resp.json() as { results?: Array<{ title?: string; summary?: string; score?: number }> };
      const results = data.results ?? [];
      if (!results.length) return 'No matching research summaries found.';
      return results.map(r =>
        `[${((r.score ?? 0) * 100).toFixed(0)}%] ${r.title ?? 'untitled'}: ${String(r.summary ?? '').slice(0, 250)}`
      ).join('\n');
    } catch (err) {
      return `lookup_research_summary error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/**
 * get_system_health — returns current infrastructure health snapshot.
 */
const getSystemHealth: Gemma4Tool = {
  name: 'get_system_health',
  description: 'Get the current system health status including DB, Qdrant, Ollama, and Redis.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args) => {
    try {
      const resp = await fetch(`${ENV.PUBLIC_API_URL}/api/infrastructure/status`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!resp.ok) throw new Error(`Health HTTP ${resp.status}`);
      const data = await resp.json() as Record<string, unknown>;
      // Return a concise summary instead of the full blob
      const lines: string[] = [];
      for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object') {
          const v = val as Record<string, unknown>;
          lines.push(`${key}: ${v.status ?? v.ok ?? JSON.stringify(v).slice(0, 80)}`);
        }
      }
      return lines.join('\n') || JSON.stringify(data).slice(0, 400);
    } catch (err) {
      return `get_system_health error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/**
 * web_search — fallback when codebase search comes up empty.
 * Uses the SvelteKit /api/research/web-search proxy which calls Brave/Serper/DuckDuckGo.
 * Falls back to a Qdrant-stored web-research summary if the live search fails.
 */
const webSearch: Gemma4Tool = {
  name: 'web_search',
  description:
    'Search the web for technical documentation, error messages, or concepts not found in the local codebase. Use as a fallback when search_codebase returns no relevant results.',
  parameters: {
    type: 'object',
    properties: {
      query:   { type: 'string',  description: 'Web search query' },
      top_k:   { type: 'integer', description: 'Max results (default 3)' },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const query = String(args.query ?? '').slice(0, 300);
    const topK  = Math.min(Number(args.top_k ?? 3), 5);

    // Try live web search via the internal proxy
    try {
      const resp = await fetch(`${ENV.PUBLIC_API_URL}/api/research/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-bypass-auth': 'true' },
        body: JSON.stringify({ query, limit: topK }),
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.ok) {
        const data = await resp.json() as { results?: Array<{ title?: string; snippet?: string; url?: string }> };
        const hits = data.results ?? [];
        if (hits.length) {
          return hits.map(h => `${h.title ?? h.url}: ${String(h.snippet ?? '').slice(0, 300)}`).join('\n');
        }
      }
    } catch {
      // fall through to Qdrant stored research
    }

    // Fallback: semantic search in the web_research Qdrant collection
    try {
      const embedResp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest', input: query }),
        signal: AbortSignal.timeout(10_000),
      });
      if (embedResp.ok) {
        const eData = await embedResp.json() as { embeddings?: number[][] };
        const vec = eData.embeddings?.[0];
        if (vec?.length) {
          const sResp = await fetch(
            `${ENV.QDRANT_URL}/collections/research_summaries/points/search`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vector: vec, limit: topK, with_payload: true }),
              signal: AbortSignal.timeout(8_000),
            },
          );
          if (sResp.ok) {
            const sData = await sResp.json() as { result?: Array<{ payload?: Record<string, unknown>; score: number }> };
            const hits = sData.result ?? [];
            if (hits.length) {
              return '[Stored research fallback]\n' + hits.map(h => {
                const p = h.payload ?? {};
                return `[${(h.score * 100).toFixed(0)}%] ${p.title ?? 'untitled'}: ${String(p.summary ?? '').slice(0, 300)}`;
              }).join('\n');
            }
          }
        }
      }
    } catch {
      // nothing
    }

    return `No web search results found for: "${query}"`;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public tool registry
// ─────────────────────────────────────────────────────────────────────────────

export const ACE_TOOLS: Gemma4Tool[] = [
  acePromptPreflightTool,
  searchCodebase,
  getClusterSummary,
  lookupResearchSummary,
  getSystemHealth,
  webSearch,
];

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `You are a legal-AI codebase assistant with access to tools for searching code, \
clusters, and research summaries. Use the tools to gather the context you need before answering. \
Call tools in parallel when the sub-questions are independent. \
When you have enough context, provide a direct, concrete answer. \
Do not speculate about code you have not retrieved — use the tools first.`;

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface AceAgentResult extends Gemma4ToolCallResult {
  /** Final answer text (same as .text but aliased for clarity) */
  answer: string;
}

/**
 * Run a multi-step Gemma 4 agentic query over the ACE codebase.
 *
 * The model will emit tool calls, see the results, and iterate until
 * it can give a final answer — all in a single awaited call.
 *
 * @example
 * const r = await runAceAgentQuery('Which files handle RabbitMQ queue setup?');
 * console.log(r.answer);           // final LLM answer
 * console.log(r.toolCallsExecuted); // how many tool rounds ran
 */
export async function runAceAgentQuery(
  userQuery: string,
  opts: { model?: string; temperature?: number; maxTokens?: number; tools?: Gemma4Tool[] } = {},
): Promise<AceAgentResult> {
  const tools = opts.tools ?? ACE_TOOLS;

  const result = await callGemma4WithTools(
    AGENT_SYSTEM_PROMPT,
    userQuery,
    tools,
    { model: opts.model, temperature: opts.temperature, maxTokens: opts.maxTokens ?? 2048 },
  );

  return { ...result, answer: result.text };
}
