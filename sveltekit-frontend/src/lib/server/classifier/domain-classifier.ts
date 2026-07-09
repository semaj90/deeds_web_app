/**
 * Keyword-based domain classification for AST enrichment.
 * Maps source_ref text to semantic domains for XGBoost feature extraction.
 */

import type { Domain } from './ast-keyword-types.js';

export const KEYWORD_DOMAINS: Record<Domain, string[]> = {
  auth: ['session', 'login', 'logout', 'authenticate', 'authorize', 'token', 'credential', 'password', 'lucia', 'jwt', 'oauth', 'signin', 'signup'],
  ui: ['button', 'component', 'render', 'state', 'effect', 'prop', 'modal', 'dialog', 'svelte', 'onclick', 'form', 'input', 'layout', 'styles'],
  retrieval: ['search', 'query', 'rank', 'score', 'candidate', 'embedding', 'vector', 'qdrant', 'rrf', 'bm25', 'hybrid', 'retrieval', 'retrieve', 'dense', 'sparse'],
  network: ['fetch', 'http', 'request', 'response', 'api', 'endpoint', 'server', 'client', 'rest', 'json', 'protocol', 'socket', 'stream'],
  database: ['sql', 'postgres', 'drizzle', 'query', 'transaction', 'schema', 'migration', 'table', 'column', 'row', 'insert', 'select', 'update', 'delete'],
  cache: ['redis', 'valkey', 'cache', 'ttl', 'bifrost', 'bitfrost', 'memo', 'store', 'persist', 'retrieve', 'invalidate'],
  agent: ['agent', 'tool', 'dispatcher', 'mcp', 'trace', 'workflow', 'orchestrat', 'agentic', 'langgraph', 'prompt'],
  graph: ['neo4j', 'edge', 'node', 'pagerank', 'community', 'topology', 'relationship', 'traversal', 'neighbor', 'path'],
  ml: ['xgboost', 'classifier', 'embedding', 'som', 'kmeans', 'tensor', 'model', 'train', 'predict', 'inference', 'neural', 'network'],
  general: []
};

export function classifyDomainFromText(text: string): {
  domain: Domain;
  confidence: number;
  counts: Record<Domain, number>;
} {
  const lower = text.toLowerCase();
  const counts: Record<Domain, number> = {
    auth: 0,
    ui: 0,
    retrieval: 0,
    network: 0,
    database: 0,
    cache: 0,
    agent: 0,
    graph: 0,
    ml: 0,
    general: 0
  };

  for (const [domain, words] of Object.entries(KEYWORD_DOMAINS)) {
    counts[domain as Domain] = words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [bestDomain, bestScore] = sorted[0] ?? ['general', 0];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    domain: bestScore > 0 ? (bestDomain as Domain) : 'general',
    confidence: total > 0 ? bestScore / total : 0,
    counts: counts as Record<Domain, number>
  };
}
