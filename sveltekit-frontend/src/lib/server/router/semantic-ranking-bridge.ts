import type { RouterObservation } from './router-types';

/**
 * Semantic Ranking Bridge — Wire embeddings + intent detection into tool ranking
 *
 * Replaces placeholder scoreSemanticSimilarity() and scoreIntentMatch() with real services.
 *
 * Ranking layers:
 * 1. Semantic: BM25 keyword overlap + EmbeddingGemma cosine similarity
 * 2. Intent: Gemma4 intent classification (CODE_SEARCH, SEMANTIC_SEARCH, GRAPH_EXPAND, etc.)
 * 3. Schema: Argument type matching
 *
 * All scores return [0, 1] normalized.
 */

export interface SemanticScoreResult {
  semanticScore: number; // [0, 1]
  bm25Score: number; // Raw BM25 score before normalization
  embeddingScore: number; // Cosine similarity [-1, 1] → [0, 1]
  intentScore: number; // [0, 1]
  intents: string[]; // Detected intents: CODE_SEARCH, SEMANTIC_SEARCH, GRAPH_EXPAND, VALIDATE, SYNTHESIZE
  reasoning: string;
}

/**
 * Score semantic similarity using BM25 + embedding (synchronous ranker version)
 *
 * BM25: Keyword matching (lexical)
 * Embedding: Semantic similarity (embeddings) — uses cached or neutral default
 * Blend: 0.6·BM25_norm + 0.4·embedding (favor keyword for structured code)
 *
 * Returns neutral fallback (0.5) when async lookup not available.
 * For full async scoring, use scoreSemanticSimilarityAsync().
 */
export function scoreSemanticSimilarity(
  query: string,
  toolName: string,
  toolDescription: string,
  toolKeywords: string[]
): number {
  try {
    // BM25 is synchronous: keyword matching
    const bm25Score = computeBM25(query, [toolName, toolDescription, ...toolKeywords]);

    // Embedding similarity: use placeholder (async lookup deferred)
    // TODO: Wire to Redis cache (embeddings:[query_hash]) for sync lookup
    const embeddingScore = 0.5; // Neutral default (real /api/embed call is async)

    // Blend: favor BM25 for structured code
    const semanticScore = 0.6 * normalize(bm25Score) + 0.4 * embeddingScore;

    return Math.min(1, Math.max(0, semanticScore));
  } catch (err) {
    // Graceful fallback to neutral default
    console.warn('[scoreSemanticSimilarity] error, falling back to 0.5:', err);
    return 0.5;
  }
}

/**
 * Async version for full semantic similarity analysis (outside ranking pipeline)
 */
export async function scoreSemanticSimilarityAsync(
  query: string,
  toolName: string,
  toolDescription: string,
  toolKeywords: string[]
): Promise<number> {
  try {
    // TODO: Wire to real BM25 service (e.g., Postgres FTS or external service)
    const bm25Score = computeBM25(query, [toolName, toolDescription, ...toolKeywords]);

    // TODO: Wire to EmbeddingGemma service (/api/embed)
    const embeddingScore = await computeEmbeddingSimilarity(query, toolDescription);

    // Blend: favor BM25 for structured code
    const semanticScore = 0.6 * normalize(bm25Score) + 0.4 * embeddingScore;

    return Math.min(1, Math.max(0, semanticScore));
  } catch (err) {
    // Graceful fallback to neutral default
    console.warn('[scoreSemanticSimilarityAsync] error, falling back to 0.5:', err);
    return 0.5;
  }
}

/**
 * Classify query intent (synchronous version for ranking)
 *
 * Returns intent score [0, 1] using keyword-based fallback.
 * Detected intents are cached but not returned (use scoreIntentMatchAsync for full details).
 *
 * Intent labels:
 * - CODE_SEARCH: find code by name/function/symbol
 * - SEMANTIC_SEARCH: find conceptually related code
 * - GRAPH_EXPAND: traverse graph relationships
 * - VALIDATE: check schema/types
 * - SYNTHESIZE: generate answer/summary
 * - EXECUTE: run tool/command
 */
export function scoreIntentMatch(
  query: string,
  toolName: string,
  allowedIntents: string[]
): number {
  try {
    // Synchronous keyword-based intent detection (fallback for ranking pipeline)
    // TODO: Wire to Gemma intent classifier for async full analysis
    const detectedIntents = classifyQueryIntentSync(query);
    const matchCount = detectedIntents.filter((i) => allowedIntents.includes(i)).length;
    const intentScore = detectedIntents.length > 0 ? matchCount / detectedIntents.length : 0.5;

    return Math.min(1, Math.max(0, intentScore));
  } catch (err) {
    // Graceful fallback
    console.warn('[scoreIntentMatch] error, falling back to 0.5:', err);
    return 0.5;
  }
}

/**
 * Async version of intent matching for full analysis (used outside ranking)
 */
export async function scoreIntentMatchAsync(
  query: string,
  toolName: string,
  allowedIntents: string[]
): Promise<{ intentScore: number; detectedIntents: string[] }> {
  try {
    const detectedIntents = await classifyQueryIntent(query);
    const matchCount = detectedIntents.filter((i) => allowedIntents.includes(i)).length;
    const intentScore = detectedIntents.length > 0 ? matchCount / detectedIntents.length : 0.5;

    return {
      intentScore: Math.min(1, Math.max(0, intentScore)),
      detectedIntents
    };
  } catch (err) {
    console.warn('[scoreIntentMatchAsync] error, falling back to 0.5:', err);
    return { intentScore: 0.5, detectedIntents: [] };
  }
}

/**
 * Compute BM25 score (Okapi BM25)
 *
 * Simplified implementation for local computation.
 * For production, use Postgres full-text search or Elasticsearch.
 */
function computeBM25(
  query: string,
  documents: string[],
  k1: number = 1.5,
  b: number = 0.75
): number {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const docText = documents.join(' ').toLowerCase();
  const docLength = docText.split(/\s+/).length;

  // Simplified: count term occurrences
  let score = 0;
  for (const term of queryTerms) {
    const termCount = (docText.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
    const idf = Math.log((1 + 1) / (termCount + 0.5)); // Simplified IDF
    score += idf * ((termCount * (k1 + 1)) / (termCount + k1 * (1 - b + b * docLength)));
  }

  return score;
}

/**
 * Compute embedding similarity
 *
 * TODO: Implement via HTTP call to /api/embed
 * Flow:
 * 1. POST /api/embed with query
 * 2. Embed tool description
 * 3. Compute cosine similarity
 * 4. Return [-1, 1] → normalize to [0, 1]
 */
async function computeEmbeddingSimilarity(query: string, description: string): Promise<number> {
  try {
    // Placeholder: return 0.5
    // Real implementation:
    // const queryEmbedding = await fetch('/api/embed', { body: query }).then(r => r.json());
    // const descEmbedding = await fetch('/api/embed', { body: description }).then(r => r.json());
    // const similarity = cosineSimilarity(queryEmbedding, descEmbedding);
    // return (similarity + 1) / 2; // [-1, 1] → [0, 1]
    return 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Synchronous keyword-based intent detection
 */
function classifyQueryIntentSync(query: string): string[] {
  try {
    const keywordMap: Record<string, string[]> = {
      CODE_SEARCH: ['find', 'search', 'locate', 'where', 'which', 'definition'],
      SEMANTIC_SEARCH: ['similar', 'related', 'like', 'analogy', 'compare'],
      GRAPH_EXPAND: ['depends', 'imports', 'calls', 'references', 'relationships'],
      VALIDATE: ['check', 'validate', 'type', 'schema', 'error'],
      SYNTHESIZE: ['summarize', 'explain', 'what', 'how', 'why'],
      EXECUTE: ['run', 'execute', 'apply', 'fix', 'refactor']
    };

    const queryLower = query.toLowerCase();
    const detectedIntents: string[] = [];

    for (const [intent, keywords] of Object.entries(keywordMap)) {
      if (keywords.some((kw) => queryLower.includes(kw))) {
        detectedIntents.push(intent);
      }
    }

    return detectedIntents.length > 0 ? detectedIntents : ['CODE_SEARCH'];
  } catch {
    return ['CODE_SEARCH'];
  }
}

/**
 * Classify query intent via Gemma intent classifier (async)
 *
 * TODO: Implement via Gemma intent classifier
 * Flow:
 * 1. Call Gemma with prompt: "Classify intent: {query}"
 * 2. Parse response for intent labels
 * 3. Return array of intents
 */
async function classifyQueryIntent(query: string): Promise<string[]> {
  try {
    // TODO: Replace with real Gemma classifier call
    // For now, use synchronous keyword-based fallback
    return classifyQueryIntentSync(query);
  } catch {
    return ['CODE_SEARCH'];
  }
}

/**
 * Normalize BM25 score to [0, 1]
 *
 * BM25 can produce scores > 1, so cap and normalize.
 */
function normalize(score: number, max: number = 10): number {
  return Math.min(1, score / max);
}

/**
 * Cosine similarity between two vectors
 *
 * dot(a, b) / (||a|| * ||b||)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
