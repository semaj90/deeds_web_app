/**
 * Unified Retrieval + Summarization Orchestrator
 *
 * Coordinates the complete pipeline:
 * Postgres truth → embeddinggemma 768d → Qdrant named-vector
 * → Qdrant RRF fusion → TurboVec prefilter → Postgres join
 * → LangExtract + Gemma4 summary
 *
 * Each service has a clear job:
 * - Postgres: canonical packet truth, joins, provenance, summaries
 * - Qdrant: GPU vector index + named-vector search + RRF
 * - TurboVec: CUDA RAM prefilter/rerank + 768→64 latent transform
 * - Go Retrieval: fast API facade + orchestration
 * - LangExtract + Gemma4: structured extraction + bounded summaries
 */

import fetch from 'node-fetch';
import { Pool } from 'pg';
import { getRgPool, type RgSearchOptions } from '$lib/server/search/rg-pool.js';

export interface RetrievalConfig {
  qdrant: { host: string; port: number };
  turbovec: { host: string; port: number };
  goRetrieval: { host: string; port: number };
  postgres: { host: string; port: number; user: string; password: string; database: string };
  ollama: { host: string; port: number };
  gemma4: { host: string; port: number };
}

export interface RetrievalRequest {
  query: string;
  limit?: number;
  includePayload?: boolean;
  useRRF?: boolean;
  useLexical?: boolean;
  useAST?: boolean;
  useRgPool?: boolean;
}

export interface RankedCandidate {
  id: string;
  score: number;
  path: string;
  symbol: string;
  kind: string;
  ranks: {
    qdrant_dense?: number;
    turbovec?: number;
    rg_lexical?: number;
    ast_relation?: number;
    postgres?: number;
    freshness?: number;
  };
  rg_matches?: number;
}

export interface RetrievalResult {
  candidates: RankedCandidate[];
  timing: {
    embedding: number;
    qdrant_search: number;
    qdrant_rrf?: number;
    turbovec_transform: number;
    postgres_join: number;
    total: number;
  };
  stages_completed: string[];
  fallback_used: boolean;
}

export interface SummarizationRequest {
  candidates: RankedCandidate[];
  query: string;
  max_tokens?: number;
  temperature?: number;
}

export interface SummarizationResult {
  summary: string;
  extracted_entities: string[];
  key_relations: Array<{ from: string; relation: string; to: string }>;
  confidence: number;
  model: string;
  timing: number;
}

const DEFAULT_CONFIG: RetrievalConfig = {
  qdrant: { host: '127.0.0.1', port: 6333 },
  turbovec: { host: '127.0.0.1', port: 8791 },
  goRetrieval: { host: '127.0.0.1', port: 8100 },
  postgres: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5434'),
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
    database: process.env.POSTGRES_DB || 'legal_ai_db'
  },
  ollama: { host: '127.0.0.1', port: 11434 },
  gemma4: { host: '127.0.0.1', port: 8090 }
};

/**
 * STAGE 1: Generate 768-dim embedding via embeddinggemma
 */
async function generateEmbedding(query: string, config: RetrievalConfig): Promise<number[]> {
  const startTime = Date.now();
  try {
    const res = await fetch(`http://${config.ollama.host}:${config.ollama.port}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: query
      })
    });

    if (!res.ok) throw new Error(`Ollama embedding failed: ${res.status}`);
    const data = await res.json() as { embedding: number[] };
    if (!data.embedding || data.embedding.length !== 768) {
      throw new Error(`Expected 768-dim embedding, got ${data.embedding?.length || 0}`);
    }
    return data.embedding;
  } catch (err) {
    console.error('Embedding stage failed:', err);
    throw err;
  }
}

/**
 * STAGE 2: Qdrant named-vector search + RRF fusion
 */
async function qdrantSearch(
  embedding: number[],
  config: RetrievalConfig,
  useRRF: boolean,
  useLexical: boolean
): Promise<Array<{ id: string; score: number; payload: any }>> {
  const startTime = Date.now();
  try {
    // Dense vector search on named vector "content"
    const denseRes = await fetch(
      `http://${config.qdrant.host}:${config.qdrant.port}/collections/codebase_chunks_768/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: {
            name: 'content',
            vector: embedding
          },
          limit: 20,
          with_payload: true,
          with_vector: false,
          score_threshold: 0.3
        })
      }
    );

    if (!denseRes.ok) throw new Error(`Qdrant search failed: ${denseRes.status}`);
    const denseData = await denseRes.json() as { result: Array<{ id: string; score: number; payload: any }> };
    const denseHits = denseData.result || [];

    // TODO: RRF fusion (combine dense + lexical + payload filters)
    // For now, return dense hits only
    return denseHits.map((hit, idx) => ({
      ...hit,
      payload: { ...hit.payload, qdrant_rank: idx + 1 }
    }));
  } catch (err) {
    console.error('Qdrant search failed:', err);
    throw err;
  }
}

/**
 * STAGE 2.5: rg-pool lexical search (BM25-like via ripgrep)
 * Provides 0.20 weight for lexical signal in RRF blend
 */
async function rgPoolLexicalSearch(
  query: string,
  config: RetrievalConfig,
  limit: number = 10
): Promise<Array<{ id: string; file: string; line: number; score: number; rank: number }>> {
  const startTime = Date.now();
  try {
    const pool = getRgPool();
    const results = await pool.search({
      query,
      type: 'ts',
      limit,
      cwd: process.cwd()
    });

    return results.map((r, idx) => ({
      id: `${r.file}:${r.line}`,
      file: r.file,
      line: r.line,
      score: 1.0 - (idx / Math.max(results.length, 1)),
      rank: idx + 1
    }));
  } catch (err) {
    console.error('rg-pool lexical search failed:', err);
    return [];
  }
}

/**
 * STAGE 3: TurboVec 768→64 transform + ANN prefilter
 */
async function turboVecPrefilter(
  embedding: number[],
  config: RetrievalConfig,
  limit: number = 10
): Promise<Array<{ id: string; score: number; rank: number }>> {
  const startTime = Date.now();
  try {
    const res = await fetch(
      `http://${config.turbovec.host}:${config.turbovec.port}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: embedding.slice(0, 64), // Use first 64-dim as proxy
          limit,
          threshold: 0.3
        })
      }
    );

    if (!res.ok) throw new Error(`TurboVec search failed: ${res.status}`);
    const data = await res.json() as { ids: string[]; scores: number[] };
    return (data.ids || []).map((id, idx) => ({
      id,
      score: data.scores?.[idx] || 0,
      rank: idx + 1
    }));
  } catch (err) {
    console.error('TurboVec prefilter failed:', err);
    throw err;
  }
}

/**
 * STAGE 4: Postgres truth join
 * Merge Qdrant results with canonical Postgres metadata
 */
async function postgresJoin(
  qdrantIds: string[],
  config: RetrievalConfig
): Promise<Map<string, { relative_path: string; symbol: string; kind: string }>> {
  const pool = new Pool(config.postgres);
  try {
    if (qdrantIds.length === 0) return new Map();

    const res = await pool.query(
      `SELECT id, relative_path, symbol, kind FROM codebase_chunk_index WHERE id = ANY($1) LIMIT 20`,
      [qdrantIds]
    );

    const map = new Map<string, any>();
    (res.rows || []).forEach((row) => {
      map.set(row.id, {
        relative_path: row.relative_path,
        symbol: row.symbol,
        kind: row.kind
      });
    });
    return map;
  } catch (err) {
    console.error('Postgres join failed:', err);
    throw err;
  } finally {
    pool.end().catch(() => {});
  }
}

/**
 * STAGE 5: Unified ranking + scoring
 * Combine all ranks using weighted formula:
 * score = 0.30·qdrant + 0.20·turbovec + 0.20·rg_lexical + 0.15·ast + 0.10·postgres + 0.05·freshness
 */
function rankCandidates(
  qdrantHits: Array<{ id: string; score: number; payload: any }>,
  turboVecHits: Array<{ id: string; score: number; rank: number }>,
  rgLexicalHits: Array<{ id: string; file: string; line: number; score: number; rank: number }>,
  postgresMap: Map<string, any>
): RankedCandidate[] {
  const turboVecMap = new Map(turboVecHits.map((h) => [h.id, h]));
  const rgLexicalMap = new Map(rgLexicalHits.map((h) => [h.id, h]));
  const scores = new Map<string, RankedCandidate>();

  // Qdrant contribution (0.30 weight)
  qdrantHits.forEach((hit, idx) => {
    const normalized = 1 - (idx / Math.max(qdrantHits.length, 1));
    const pgData = postgresMap.get(hit.id) || { relative_path: 'N/A', symbol: 'N/A', kind: 'N/A' };

    scores.set(hit.id, {
      id: hit.id,
      score: hit.score,
      path: pgData.relative_path,
      symbol: pgData.symbol,
      kind: pgData.kind,
      rg_matches: 0,
      ranks: {
        qdrant_dense: normalized
      }
    });
  });

  // TurboVec contribution (0.20 weight)
  turboVecMap.forEach((tv, id) => {
    const normalized = 1 - (tv.rank / Math.max(turboVecHits.length, 1));
    const existing = scores.get(id);
    if (existing) {
      existing.ranks.turbovec = normalized;
      existing.score = (existing.score * 0.6) + (tv.score * 0.4);
    }
  });

  // rg-pool lexical contribution (0.20 weight)
  rgLexicalMap.forEach((rg, id) => {
    const normalized = rg.score;
    const existing = scores.get(id);
    if (existing) {
      existing.ranks.rg_lexical = normalized;
      existing.rg_matches = (existing.rg_matches || 0) + 1;
    } else {
      // Create new entry if only rg-pool matched
      const pgData = postgresMap.get(id) || { relative_path: rg.file, symbol: 'N/A', kind: 'N/A' };
      scores.set(id, {
        id,
        score: 0,
        path: pgData.relative_path,
        symbol: pgData.symbol,
        kind: pgData.kind,
        rg_matches: 1,
        ranks: {
          rg_lexical: normalized
        }
      });
    }
  });

  // Compute final blended scores
  const ranked = Array.from(scores.values()).map((c) => {
    const qdrant_w = c.ranks.qdrant_dense || 0;
    const turbovec_w = c.ranks.turbovec || 0;
    const rg_lexical_w = c.ranks.rg_lexical || 0;
    const blended =
      0.30 * qdrant_w +
      0.20 * turbovec_w +
      0.20 * rg_lexical_w +
      0.15 * 0 + // ast_relation (placeholder)
      0.10 * 1 + // postgres (always present)
      0.05 * 1; // freshness (placeholder)

    return {
      ...c,
      score: blended
    };
  });

  return ranked.sort((a, b) => b.score - a.score).slice(0, 10);
}

/**
 * STAGE 6: LangExtract + Gemma4 summarization
 */
async function summarizeWithGemma4(
  candidates: RankedCandidate[],
  query: string,
  config: RetrievalConfig,
  options: { max_tokens?: number; temperature?: number } = {}
): Promise<SummarizationResult> {
  const startTime = Date.now();
  const maxTokens = options.max_tokens || 128;
  const temperature = options.temperature ?? 0.3;

  try {
    const context = candidates
      .slice(0, 5)
      .map((c) => `${c.path}::${c.symbol} (${c.kind})`)
      .join(', ');

    const prompt = `
Based on these code references: ${context}

Query: ${query}

Provide a 1-2 sentence summary of the relevant code structure and functionality.`;

    const res = await fetch(`http://${config.gemma4.host}:${config.gemma4.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
        stream: false
      })
    });

    if (!res.ok) throw new Error(`Gemma4 synthesis failed: ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content: string } }> };
    const summary = data.choices?.[0]?.message?.content || '';

    return {
      summary,
      extracted_entities: [], // TODO: wire LangExtract
      key_relations: [], // TODO: wire LangExtract
      confidence: 0.85,
      model: 'gemma4-legal-iq4xs-direct.gguf',
      timing: Date.now() - startTime
    };
  } catch (err) {
    console.error('Gemma4 summarization failed:', err);
    throw err;
  }
}

/**
 * MAIN ORCHESTRATOR: Execute complete retrieval + summarization pipeline
 */
export async function executeUnifiedRetrieval(
  request: RetrievalRequest,
  config: RetrievalConfig = DEFAULT_CONFIG
): Promise<RetrievalResult> {
  const totalStart = Date.now();
  const stages: string[] = [];
  let fallbackUsed = false;

  try {
    // STAGE 1: Embedding
    const embedding = await generateEmbedding(request.query, config);
    stages.push('embedding');

    // STAGE 2: Qdrant search
    const qdrantHits = await qdrantSearch(embedding, config, request.useRRF ?? true, request.useLexical ?? false);
    const qdrantIds = qdrantHits.map((h) => h.id);
    stages.push('qdrant_search');

    // STAGE 2.5: rg-pool lexical search (opt-in via useRgPool)
    let rgLexicalHits: Array<{ id: string; file: string; line: number; score: number; rank: number }> = [];
    if (request.useRgPool ?? true) {
      rgLexicalHits = await rgPoolLexicalSearch(request.query, config, request.limit ?? 10);
      stages.push('rg_pool_lexical');
    }

    // STAGE 3: TurboVec prefilter
    const turboVecHits = await turboVecPrefilter(embedding, config, request.limit ?? 10);
    stages.push('turbovec_prefilter');

    // STAGE 4: Postgres join
    const postgresMap = await postgresJoin(qdrantIds, config);
    stages.push('postgres_join');

    // STAGE 5: Ranking
    const ranked = rankCandidates(qdrantHits, turboVecHits, rgLexicalHits, postgresMap);
    stages.push('ranking');

    return {
      candidates: ranked,
      timing: {
        embedding: 0, // Placeholder
        qdrant_search: 0,
        turbovec_transform: 0,
        postgres_join: 0,
        total: Date.now() - totalStart
      },
      stages_completed: stages,
      fallback_used: fallbackUsed
    };
  } catch (err) {
    console.error('Unified retrieval failed:', err);
    throw err;
  }
}

/**
 * MAIN ORCHESTRATOR: Execute complete retrieval + summarization pipeline
 */
export async function executeUnifiedRetrievalWithSummarization(
  request: RetrievalRequest,
  config: RetrievalConfig = DEFAULT_CONFIG,
  summarizeOptions?: { max_tokens?: number; temperature?: number }
): Promise<RetrievalResult & { summary?: SummarizationResult }> {
  const retrievalResult = await executeUnifiedRetrieval(request, config);

  if (retrievalResult.candidates.length === 0) {
    return retrievalResult;
  }

  const summaryResult = await summarizeWithGemma4(
    retrievalResult.candidates,
    request.query,
    config,
    summarizeOptions
  );

  return {
    ...retrievalResult,
    summary: summaryResult
  };
}

export default {
  generateEmbedding,
  qdrantSearch,
  rgPoolLexicalSearch,
  turboVecPrefilter,
  postgresJoin,
  rankCandidates,
  summarizeWithGemma4,
  executeUnifiedRetrieval,
  executeUnifiedRetrievalWithSummarization
};
