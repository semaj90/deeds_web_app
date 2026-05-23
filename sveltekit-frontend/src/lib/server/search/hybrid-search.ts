/**
 * Hybrid retrieval orchestrator.
 *
 * Runs Postgres FTS + Qdrant semantic search in parallel, merges by stable_key,
 * enriches with Neo4j authority scores, then GPU-reranks the top-N candidates.
 * Results and a RetrievalTrace are cached in Redis under ace:explain:{hash}.
 *
 * Mode detection:
 *   lexical-heavy  — query contains dots, SCREAMING_CASE, file extensions, service names
 *   semantic-heavy — conversational, prose-style query
 *   hybrid         — default balanced mode
 */

import { searchCodeLexical, searchCodeHybridPg } from './postgres-fts.js';
import { searchQdrantCode }                       from './qdrant-search.js';
import { fetchAuthorityScores }                   from './neo4j-rerank.js';
import { rerankCandidates }                       from './gpu-rerank.js';
import { buildRetrievalTrace, SCORE_WEIGHTS }     from './retrieval-explainer.js';
import { recordEvent }                            from '$lib/server/trace/trace-collector.js';
import { createHash }                             from 'crypto';
import { ENV } from '$lib/server/env.server.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  stable_key:      string;
  file_path:       string;
  symbol_name?:    string;
  symbol_kind?:    string;
  language?:       string;
  content:         string;
  tags?:           string;
  topo_class?:     string;
  lexical_score?:  number;
  semantic_score?: number;
  authority_score?:number;
  gpu_score?:      number;
  final_score:     number;
  headline?:       string;
  sources:         string[];
}

export interface HybridSearchOptions {
  limit?:          number;
  topoClass?:      string;
  mode?:           'lexical-heavy' | 'hybrid' | 'semantic-heavy' | 'auto';
  skipNeo4j?:      boolean;
  skipGpuRerank?:  boolean;
  cacheResults?:   boolean;
}

export interface HybridSearchOutput {
  results:  HybridSearchResult[];
  mode:     string;
  traceKey: string;
}

// ── Mode detection ────────────────────────────────────────────────────────────

const CODE_PATTERNS = [
  /\.[a-z]{2,4}$/,          // file extension: .ts .svelte .go .py
  /[A-Z]{2,}/,              // SCREAMING_CASE or ALL_CAPS
  /[a-z][A-Z]/,             // camelCase boundary
  /:[0-9]+/,                // line:number ref
  /\//,                     // path separator
  /import\s|export\s|function\s|const\s|let\s|var\s/,
];

export function chooseRetrievalMode(query: string): 'lexical-heavy' | 'hybrid' | 'semantic-heavy' {
  const codeHits = CODE_PATTERNS.filter((p) => p.test(query)).length;
  if (codeHits >= 2) return 'lexical-heavy';
  if (codeHits === 0 && query.split(' ').length > 5) return 'semantic-heavy';
  return 'hybrid';
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function queryHash(query: string, opts: HybridSearchOptions): string {
  return createHash('sha1')
    .update(JSON.stringify({ query, ...opts }))
    .digest('hex')
    .slice(0, 16);
}

async function tryRedisGet(key: string): Promise<string | null> {
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(ENV.REDIS_URL);
    const val = await r.get(key);
    await r.quit();
    return val;
  } catch { return null; }
}

async function tryRedisSet(key: string, value: string, ttl = 300): Promise<void> {
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(ENV.REDIS_URL);
    await r.setex(key, ttl, value);
    await r.quit();
  } catch { /* non-fatal */ }
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function hybridSearch(
  query: string,
  queryEmbedding: number[],
  opts: HybridSearchOptions = {}
): Promise<HybridSearchOutput> {
  const {
    limit       = 20,
    topoClass,
    mode: forcedMode = 'auto',
    skipNeo4j        = false,
    skipGpuRerank    = false,
    cacheResults     = true,
  } = opts;

  const mode = forcedMode === 'auto' ? chooseRetrievalMode(query) : forcedMode;
  const hash = queryHash(query, { limit, topoClass, mode });
  const cacheKey = `ace:hybrid:${hash}`;

  if (cacheResults) {
    const cached = await tryRedisGet(cacheKey);
    if (cached) {
      try {
        recordEvent(null, 'cache_hit', { cacheKey, symbolName: 'hybridSearch' });
        return JSON.parse(cached) as HybridSearchOutput;
      } catch { /* fall through */ }
    }
  }

  const t0 = Date.now();
  const weights = SCORE_WEIGHTS[mode];

  // ── Parallel retrieval ────────────────────────────────────────────────────

  const t1 = Date.now();
  const [pgRows, qdrantRows] = await Promise.all([
    mode === 'semantic-heavy'
      ? searchCodeLexical(query, { limit: Math.ceil(limit * 1.5), topoClass })
      : searchCodeHybridPg(query, queryEmbedding, { limit: Math.ceil(limit * 2), topoClass }),
    searchQdrantCode(queryEmbedding, Math.ceil(limit * 1.5), topoClass),
  ]);

  // ── Merge by stable_key ───────────────────────────────────────────────────

  const merged = new Map<string, HybridSearchResult>();

  for (const r of pgRows) {
    if ('path' in r) {
      // It is a HybridPgResult
      merged.set(r.stable_key, {
        stable_key:      r.stable_key,
        file_path:       r.path,
        symbol_name:     r.symbol ?? undefined,
        content:         r.content,
        lexical_score:   r.lex_rank != null ? 1 / (60 + r.lex_rank) : undefined,
        semantic_score:  r.sem_rank != null ? 1 / (60 + r.sem_rank) : undefined,
        authority_score: 0,
        final_score:     r.hybrid_score,
        sources:         ['postgres_fts'],
      });
    } else {
      // It is a FTSResult
      merged.set(r.stable_key, {
        stable_key:      r.stable_key,
        file_path:       r.file_path,
        symbol_name:     r.symbol_name ?? undefined,
        symbol_kind:     r.symbol_kind ?? undefined,
        language:        r.language ?? undefined,
        content:         r.content,
        tags:            r.tags,
        topo_class:      r.topo_class ?? undefined,
        lexical_score:   r.lexical_score,
        semantic_score:  r.graph_authority_score,
        authority_score: 0,
        final_score:     r.lexical_score,
        headline:        r.headline,
        sources:         ['postgres_fts'],
      });
    }
  }

  for (const r of qdrantRows) {
    const existing = merged.get(r.stable_key);
    if (existing) {
      existing.semantic_score = r.semantic_score;
      existing.sources.push('qdrant');
      existing.final_score +=
        r.semantic_score * (weights.semantic ?? 0.35);
    } else {
      merged.set(r.stable_key, {
        stable_key:      r.stable_key,
        file_path:       r.file_path,
        symbol_name:     r.symbol_name,
        symbol_kind:     r.symbol_kind,
        language:        r.language,
        content:         r.content,
        tags:            r.tags,
        topo_class:      r.topo_class,
        semantic_score:  r.semantic_score,
        authority_score: r.graph_authority_score ?? 0,
        final_score:     r.semantic_score * (weights.semantic ?? 0.35),
        sources:         ['qdrant'],
      });
    }
  }

  recordEvent(null, 'qdrant_query', {
    durationMs:  Date.now() - t1,
    score:       qdrantRows[0]?.semantic_score,
    symbolName:  'hybridSearch',
    metadata:    { pgHits: pgRows.length, qdrantHits: qdrantRows.length, mode },
  });

  let candidates = Array.from(merged.values());

  // ── Neo4j authority enrichment ─────────────────────────────────────────────

  if (!skipNeo4j && candidates.length > 0) {
    const authorityMap = await fetchAuthorityScores(candidates.map((c) => c.stable_key));
    for (const c of candidates) {
      const auth = authorityMap[c.stable_key];
      if (auth) {
        c.authority_score = auth.pagerank;
        c.final_score += auth.pagerank * (weights.neo4j ?? 0.20);
      }
    }
  }

  // Sort before GPU rerank to pick the best candidates
  candidates.sort((a, b) => b.final_score - a.final_score);

  // ── GPU rerank (top candidates only) ──────────────────────────────────────

  const useGpu = !skipGpuRerank && queryEmbedding.length > 0;
  if (useGpu) {
    const topN = candidates.slice(0, Math.min(candidates.length, limit * 3));
    const reranked = await rerankCandidates(
      queryEmbedding,
      topN.map((c) => ({
        stable_key: c.stable_key,
        pre_score:  c.final_score,
      })),
      1 - (weights.gpu ?? 0.15)
    );
    for (const r of reranked) {
      const match = merged.get(r.stable_key);
      if (match) {
        match.gpu_score  = r.gpu_score;
        match.final_score = r.final_score;
      }
    }
    candidates = Array.from(merged.values()).sort((a, b) => b.final_score - a.final_score);
  }

  const results = candidates.slice(0, limit);

  // ── Trace caching ──────────────────────────────────────────────────────────

  const trace = buildRetrievalTrace(query, mode, results, Date.now() - t0, {
    neo4jUsed:     !skipNeo4j,
    gpuRerankUsed: useGpu,
  });

  const traceKey = `ace:explain:${hash}`;
  void tryRedisSet(traceKey, JSON.stringify(trace), 600);

  recordEvent(null, 'span', {
    symbolName: 'hybridSearch',
    durationMs: Date.now() - t0,
    score:      results[0]?.final_score,
    metadata:   { resultCount: results.length, mode, gpuRerankUsed: useGpu },
  });

  const output: HybridSearchOutput = { results, mode, traceKey };
  if (cacheResults) void tryRedisSet(cacheKey, JSON.stringify(output), 300);

  return output;
}
