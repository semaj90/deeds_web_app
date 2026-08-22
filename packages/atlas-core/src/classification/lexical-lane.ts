/**
 * Lexical Classification Lane
 *
 * Keyword-based domain assignment from source_ref, file_path, feature_id.
 * Uses TF-IDF inspired scoring with domain-specific keyword mappings.
 *
 * Phase 2 Step 1: July 28, 2026
 */

import { domainScoreSchema, type DomainScore, CANONICAL_DOMAINS } from '../validation/hybrid-semantic-classification.js';

/**
 * Domain keyword mappings (seed from canonical domain definitions)
 * Used for lexical matching
 */
export const DOMAIN_KEYWORDS: Record<string, string[]> = {
  auth: [
    'session', 'auth', 'user', 'login', 'credential', 'permission', 'role', 'verify',
    'authenticate', 'authorize', 'access', 'password', 'token', 'jwt', 'oauth',
    'lucia', 'grant', 'deny', 'scope', 'secret', 'hash', 'verify',
  ],
  retrieval: [
    'search', 'query', 'find', 'retrieve', 'lookup', 'index', 'rank', 'vector',
    'qdrant', 'ann', 'similarity', 'match', 'filter', 'fetch', 'scan', 'cursor',
    'pagination', 'scroll', 'offset', 'limit', 'top_k',
  ],
  embedding: [
    'embed', 'vector', 'semantic', 'similarity', 'encode', 'distance', 'cosine',
    'embedding', 'embedding_model', 'embeddinggemma', 'nomic', 'represent',
    'latent', 'dimension', 'normalize', 'pooling', 'projection', 'ae', 'autoencoder',
  ],
  graph: [
    'graph', 'node', 'edge', 'traversal', 'topology', 'neighbor', 'path', 'neo4j',
    'cypher', 'relationship', 'community', 'pagerank', 'centrality', 'subgraph',
    'walk', 'bfs', 'dfs', 'shortest_path', 'cluster', 'connected',
  ],
  storage: [
    'db', 'postgres', 'postgresql', 'redis', 'valkey', 'cache', 'persist', 'save',
    'qdrant', 'index', 'table', 'column', 'schema', 'query', 'transaction', 'acid',
    'drizzle', 'orm', 'sql', 'json', 'jsonb', 'array', 'vector_type',
  ],
  ai_analysis: [
    'ai', 'llm', 'model', 'gemma', 'ollama', 'inference', 'generation', 'completion',
    'synthesis', 'analyze', 'summarize', 'classify', 'extract', 'transform', 'turbo',
    'grpo', 'lora', 'fine_tune', 'prompt', 'context', 'token', 'attention',
  ],
  ui_components: [
    'component', 'svelte', 'render', 'button', 'modal', 'dialog', 'form', 'input',
    'layout', 'grid', 'flex', 'style', 'class', 'props', 'state', 'reactive',
    'bits_ui', 'snippet', 'slot', 'event', 'listener', 'binding', 'animation',
  ],
  api_routes: [
    'api', 'route', 'endpoint', 'handler', 'server', 'request', 'response', 'http',
    'get', 'post', 'put', 'delete', 'patch', 'sveltekit', 'load', 'action',
    'middleware', 'hook', 'guard', 'error', 'status', 'json', 'form_data',
  ],
  testing: [
    'test', 'unit', 'integration', 'e2e', 'vitest', 'playwright', 'mock', 'stub',
    'spy', 'assert', 'expect', 'coverage', 'spec', 'suite', 'case', 'scenario',
    'validation', 'check', 'verify', 'snapshot', 'regression', 'smoke',
  ],
  documentation: [
    'doc', 'comment', 'readme', 'markdown', 'example', 'usage', 'guide', 'tutorial',
    'explain', 'describe', 'note', 'todo', 'fixme', 'hack', 'type', 'annotation',
    'jsdoc', 'tsdoc', 'docstring', 'inline', 'reference', 'see', 'link',
  ],
};

/**
 * Normalize text for keyword matching
 * Converts to lowercase and splits on common delimiters
 */
export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[_\-\.\/]/g, ' ')  // Replace delimiters with spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Split CamelCase
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Compute term frequency (TF) for a word in text
 * TF = (count of word) / (total words)
 */
export function termFrequency(word: string, words: string[]): number {
  const count = words.filter((w) => w === word).length;
  return words.length > 0 ? count / words.length : 0;
}

/**
 * Compute inverse document frequency (IDF) for a word across domains
 * IDF = log(total domains / domains containing word)
 */
export function inverseDocumentFrequency(word: string, keywords: Record<string, string[]>): number {
  const totalDomains = Object.keys(keywords).length;
  const domainsWithWord = Object.values(keywords).filter((kw) => kw.includes(word)).length;

  if (domainsWithWord === 0) return 0;
  return Math.log(totalDomains / domainsWithWord);
}

/**
 * Compute TF-IDF score for a word
 */
export function tfIdfScore(word: string, words: string[], keywords: Record<string, string[]>): number {
  const tf = termFrequency(word, words);
  const idf = inverseDocumentFrequency(word, keywords);
  return tf * idf;
}

/**
 * Score a domain based on keyword matches in normalized text
 * Returns confidence ∈ [0, 1]
 */
export function scoreDomain(
  domain: string,
  textWords: string[],
  keywords: Record<string, string[]>,
  minConfidence: number = 0.2
): number {
  if (!keywords[domain]) return 0;

  const domainKeywords = keywords[domain];
  let totalScore = 0;
  let matchedCount = 0;

  for (const word of textWords) {
    if (domainKeywords.includes(word)) {
      const score = tfIdfScore(word, textWords, keywords);
      totalScore += score;
      matchedCount++;
    }
  }

  if (matchedCount === 0) return 0;

  // Normalize to [0, 1] by averaging
  const avgScore = totalScore / matchedCount;

  // Boost by match density (matched / total words)
  const density = matchedCount / textWords.length;
  const finalScore = Math.min(1, avgScore * (1 + density));

  return finalScore < minConfidence ? 0 : finalScore;
}

/**
 * Lexical lane: Classify entity based on source reference and path keywords
 *
 * @param entityId - Entity identifier
 * @param sourceRef - Source reference (e.g., file path, function name)
 * @param additionalText - Optional additional text to include (feature_id, etc.)
 * @param topK - Return top-K domains (default: 5)
 * @returns Array of domain scores sorted by confidence (descending)
 */
export function classifyLexical(
  entityId: string,
  sourceRef: string,
  additionalText?: string,
  topK: number = 5
): DomainScore[] {
  // Normalize input text
  const refWords = normalizeText(sourceRef);
  const additionalWords = additionalText ? normalizeText(additionalText) : [];
  const allWords = [...refWords, ...additionalWords];

  if (allWords.length === 0) return [];

  // Score each domain
  const scores: DomainScore[] = [];

  for (const domain of Object.keys(DOMAIN_KEYWORDS)) {
    const score = scoreDomain(domain, allWords, DOMAIN_KEYWORDS, 0.3);

    if (score > 0) {
      const validated = domainScoreSchema.parse({
        domain,
        score: Math.round(score * 1000) / 1000,  // Round to 3 decimals
        source: 'LEXICAL_KEYWORD',
        explanation: `Matched keywords: ${allWords.filter((w) => DOMAIN_KEYWORDS[domain]?.includes(w)).join(', ')}`,
      });

      scores.push(validated);
    }
  }

  // Sort by score (descending) and return top-K
  return scores.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Batch lexical classification for multiple entities
 *
 * @param entities - Array of { entityId, sourceRef, additionalText? }
 * @param topK - Return top-K domains per entity
 * @returns Array of classification results
 */
export function classifyLexicalBatch(
  entities: Array<{
    entityId: string;
    sourceRef: string;
    additionalText?: string;
  }>,
  topK: number = 5
): Record<string, DomainScore[]> {
  const results: Record<string, DomainScore[]> = {};

  for (const entity of entities) {
    results[entity.entityId] = classifyLexical(
      entity.entityId,
      entity.sourceRef,
      entity.additionalText,
      topK
    );
  }

  return results;
}

/**
 * Compute aggregate confidence for lexical classifications
 * Returns average score across all domains for an entity
 */
export function computeAggregateConfidence(scores: DomainScore[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / scores.length) * 1000) / 1000;
}

/**
 * Validation metrics for lexical lane
 */
export interface LexicalLaneMetrics {
  totalEntities: number;
  classifiedEntities: number;
  coveragePercentage: number;
  averageConfidence: number;
  averageDomainsPerEntity: number;
  minConfidenceObserved: number;
  maxConfidenceObserved: number;
}

/**
 * Compute metrics for lexical lane coverage
 */
export function computeMetrics(
  classifications: Record<string, DomainScore[]>
): LexicalLaneMetrics {
  const entityIds = Object.keys(classifications);
  const classifiedCount = entityIds.filter((id) => classifications[id].length > 0).length;

  const confidences = entityIds.flatMap((id) => classifications[id].map((s) => s.score));
  const averageConfidence = confidences.length > 0
    ? Math.round((confidences.reduce((a, b) => a + b) / confidences.length) * 1000) / 1000
    : 0;

  const domainsPerEntity = Object.values(classifications).map((scores) => scores.length);
  const averageDomains = domainsPerEntity.length > 0
    ? Math.round((domainsPerEntity.reduce((a, b) => a + b) / domainsPerEntity.length) * 100) / 100
    : 0;

  return {
    totalEntities: entityIds.length,
    classifiedEntities: classifiedCount,
    coveragePercentage: entityIds.length > 0 ? (classifiedCount / entityIds.length) * 100 : 0,
    averageConfidence,
    averageDomainsPerEntity: averageDomains,
    minConfidenceObserved: confidences.length > 0 ? Math.min(...confidences) : 0,
    maxConfidenceObserved: confidences.length > 0 ? Math.max(...confidences) : 0,
  };
}
