import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { checkSemanticCache, saveToSemanticCache } from '../cache/semantic-cache.js';
import { generateEmbeddings } from '../grpc/embedding-client.js';
import { searchQdrantCode } from '../search/qdrant-search.js';
import { retrieveRankedEntities } from '../kb/search-logic-blended.js';
import { tool_graph_expand_neighborhood } from './mcp-tool-dispatch.js';

// Constants to protect Gemma4 context window
const MAX_RESULTS = 12;
const MAX_NODES = 40;
const MAX_EDGES = 80;
const MAX_SUMMARY_CHARS = 6000;
const MAX_SOURCE_REFS = 8;
const MAX_STABLE_KEYS = 16;

const LEGAL_INTENT_RE = /(legal|statute|citation|precedent|evidence|exhibit|chain of custody|deposition|motion|pleading|affidavit|indictment|jurisdiction|liability|damages)/i;

function clampPositiveInt(value: number, fallback: number, max: number): number {
  const n = Number.isFinite(value) ? Math.floor(value) : fallback;
  if (n <= 0) return fallback;
  return Math.min(n, max);
}

function boundedJsonStringify(payload: unknown): string {
  const jsonStr = JSON.stringify(payload);
  if (jsonStr.length <= MAX_SUMMARY_CHARS) return jsonStr;
  return JSON.stringify({
    ok: true,
    truncated: true,
    note: `Tool output exceeded ${MAX_SUMMARY_CHARS} chars`,
  });
}

function pickCollectionForQuery(query: string): string {
  return LEGAL_INTENT_RE.test(query) ? 'legal_documents' : 'codebase_chunks_768';
}

function dedupeAndLimit(values: string[] | undefined, max: number): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const deduped = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  return deduped.slice(0, max);
}

// streamText is imported from the core `ai` package.
// The provider comes from `@ai-sdk/openai-compatible`.

// Setup Bifrost / Gemma4 local OpenAI-compatible endpoint.
// Points to TurboQuant (llama-server) running on port 8090.
import { ENV } from '../env.server.js';

export const bifrost = createOpenAICompatible({
  name: 'bifrost',
  baseURL: `${String(ENV.TURBOQUANT_BASE_URL || ENV.TURBOQUANT_URL).replace(/\/$/, '')}/v1`,
  apiKey: 'local',
});

export async function searchEngramMemory(query: string) {
  return `Engram memory result for: ${query}`;
}

export async function rotorQuantSearch({ query, limit }: { query: string, limit: number }) {
  try {
    const lim = clampPositiveInt(limit, MAX_RESULTS, MAX_RESULTS);
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return JSON.stringify({ error: 'Query is required' });
    }

    const collection = pickCollectionForQuery(trimmedQuery);
    const embResult = await generateEmbeddings([query]);
    if (!embResult.vectors || embResult.vectors.length === 0) return JSON.stringify({ error: "Embedding failed" });

    const vector = embResult.vectors[0];
    const qdrantMatches = await searchQdrantCode(vector, lim * 2, undefined, collection);

    const vectorMatches = qdrantMatches.map(m => ({ id: m.stable_key, score: m.semantic_score }));

    const ranked = await retrieveRankedEntities(vectorMatches);

    const topResults = ranked.slice(0, lim).map(rank => {
      const qMatch = qdrantMatches.find(q => q.stable_key === rank.id);
      return {
        stableKey: rank.id,
        path: qMatch?.file_path || "",
        score: Number(rank.finalScore.toFixed(3)),
        labels: qMatch?.topo_class ? [qMatch.topo_class] : [],
        summary: (qMatch?.content || "").slice(0, 220)
      };
    });

    const result = {
      query: trimmedQuery,
      collection,
      results: topResults
    };

    return boundedJsonStringify(result);
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

export async function graphExpandNeighborhood({ stableKeys, sourceRefs, maxHops }: { stableKeys?: string[], sourceRefs?: string[], maxHops?: number }) {
  try {
    const safeStableKeys = dedupeAndLimit(stableKeys, MAX_STABLE_KEYS);
    const safeSourceRefs = dedupeAndLimit(sourceRefs, MAX_SOURCE_REFS);

    const res = await tool_graph_expand_neighborhood({
      stableKeys: safeStableKeys,
      sourceRefs: safeSourceRefs,
      maxHops: maxHops === 2 ? 2 : 1,
      limit: MAX_NODES
    });

    if (res.success && res.data) {
      const data = res.data as any;
      const nodes = (data.nodes || []).slice(0, MAX_NODES).map((n: any) => ({
        id: n.id,
        kind: n.kind,
        pagerank: n.pagerank
      }));
      const edges = (data.edges || []).slice(0, MAX_EDGES).map((e: any) => ({
        from: e.from,
        to: e.to,
        relation: e.relation
      }));

      return boundedJsonStringify({
        ok: true,
        nodes,
        edges,
        maxHops: data.maxHops,
        limits: {
          maxNodes: MAX_NODES,
          maxEdges: MAX_EDGES,
          maxStableKeys: MAX_STABLE_KEYS,
          maxSourceRefs: MAX_SOURCE_REFS,
        },
      });
    }
    return JSON.stringify({ error: res.error || "Expansion failed" });
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

/** Chunk size for replaying cached responses as a realistic stream (chars per yield). */
const CACHE_REPLAY_CHUNK = 32;

/**
 * Replays a cached full-text response as a character-chunked async generator,
 * matching the feel of a live stream for clients consuming textStream.
 * Yields CACHE_REPLAY_CHUNK chars at a time so callers see progressive output
 * instead of one giant flush.
 */
async function* replayCacheAsStream(text: string): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += CACHE_REPLAY_CHUNK) {
    yield text.slice(i, i + CACHE_REPLAY_CHUNK);
  }
}

/**
 * Streams the Gemma4 response via the Vercel AI SDK (streamText) with:
 *   - 3-tier semantic cache interceptor (exact SHA-256 → Redis vector → pgvector)
 *   - Cache hits replayed as chunked stream (not one giant flush)
 *   - Tool calling: engramMemory, rotorQuantSearch, graphExpandNeighborhood
 *   - Cache write on onFinish (full assembled text after tool rounds complete)
 *
 * Backend: llama-server (:8090) via @ai-sdk/openai-compatible (bifrost provider).
 * Drop-in for TRT-LLM / vLLM: change bifrost baseURL, everything else stays.
 */
export async function streamGemma4WithTools(prompt: string) {
  const modelName = 'gemma4-offload';

  // 1–3. Semantic cache check (exact → Redis vector → pgvector)
  const cachedResponse = await checkSemanticCache(prompt, modelName, 0.90);
  if (cachedResponse) {
    console.log(
      `[Semantic Cache] HIT source=${cachedResponse.source} promptHash=${cachedResponse.promptHash.slice(0, 12)} ` +
        `tuple=${cachedResponse.provenanceTuple ? 'yes' : 'no'}`
    );
    // Replay as chunked stream — clients see progressive output, not one flash
    return {
      textStream: replayCacheAsStream(cachedResponse.response),
      cacheHit: cachedResponse,
    };
  }

  // 4. Cache miss: invoke llama-server via Vercel AI SDK streamText + tool calling
  const result = streamText({
    model: bifrost(modelName) as any,
    prompt,
    tools: {
      engramMemory: tool({
        description: 'Search or store Engram memory.',
        parameters: z.object({ query: z.string() }),
        // @ts-ignore
        execute: async ({ query }) => searchEngramMemory(query),
      }),
      rotorQuantSearch: tool({
        description: 'Run RotorQuant blended retrieval (Vector + Graph + Recency) over codebase_chunks_768.',
        parameters: z.object({
          query: z.string(),
          limit: z.number().default(MAX_RESULTS),
        }),
        // @ts-ignore
        execute: async ({ query, limit }) => rotorQuantSearch({ query, limit }),
      }),
      graphExpandNeighborhood: tool({
        description: 'Expand the semantic graph neighborhood from a set of stable keys or source refs.',
        parameters: z.object({
          stableKeys: z.array(z.string()).optional(),
          sourceRefs: z.array(z.string()).optional(),
          maxHops: z.number().optional(),
        }),
        // @ts-ignore
        execute: async (args) => graphExpandNeighborhood(args),
      }),
    },
    maxSteps: 4,
    // 5. Write assembled text to semantic cache after all tool rounds finish
    onFinish: async (event) => {
      if (event.text) {
        saveToSemanticCache(prompt, event.text, modelName).catch((err) =>
          console.warn('[Semantic Cache] Write failed (non-fatal):', err)
        );
      }
    },
  } as any);

  return result;
}
