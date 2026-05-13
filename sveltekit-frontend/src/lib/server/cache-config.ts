/**
 * Per-domain cache TTL + key-prefix policy.
 *
 * Single source of truth for all cache durations and Redis key namespaces.
 * Import `getCachePolicy(domain)` instead of hardcoding TTL values inline.
 *
 * Domain taxonomy mirrors the retrieval pipeline tiers:
 *   - llm          → LLM response cache (exact-match L1)
 *   - ace          → ACE context/prompt fingerprint cache
 *   - rag          → RAG bundle cache (KB tier = long, case tier = short)
 *   - embedding    → Embedding vector cache
 *   - code         → Code-LLM index per-file output
 *   - dag          → DAG topological ordering (CouchDB)
 *   - authority    → Authority-chain multi-hop expansion
 *   - research     → Research summaries (web crawl + corpus)
 *   - cartridge    → CHR-ROM97 cartridge + GPU analysis results
 *   - agent        → Agent tool-call result cache
 *   - session      → Auth session cache
 *   - settings     → Admin settings hot cache (5s — propagation latency)
 */

export type CacheDomain =
  | 'llm'
  | 'ace'
  | 'ace-context'
  | 'rag-kb'
  | 'rag-case'
  | 'embedding'
  | 'code'
  | 'dag'
  | 'authority'
  | 'research'
  | 'cartridge'
  | 'cartridge-critical'
  | 'cartridge-high'
  | 'agent'
  | 'session'
  | 'settings';

export interface CachePolicy {
  /** Redis TTL in seconds */
  ttlSeconds: number;
  /** Redis key prefix (no trailing colon — getCacheKey adds it) */
  keyPrefix: string;
  /** Human-readable description */
  description: string;
}

const POLICIES: Record<CacheDomain, CachePolicy> = {
  llm: {
    ttlSeconds: 3600,       // 1h — exact-match LLM response (redis-exact-match.ts)
    keyPrefix:  'llm:exact',
    description: 'Exact-match LLM response cache (L1)',
  },
  ace: {
    ttlSeconds: 120,        // 2min — ACE prompt fingerprint (context-assembler.ts)
    keyPrefix:  'ace:prompt',
    description: 'ACE context fingerprint → compiled prompt cache',
  },
  'ace-context': {
    ttlSeconds: 48 * 60 * 60, // 48h — packed ACE context packets (feature-map-store.ts)
    keyPrefix:  'ace:context',
    description: 'Packed ACE context packet registry',
  },
  'rag-kb': {
    ttlSeconds: 600,        // 10min — KB retrieval bundle (stable corpus)
    keyPrefix:  'rag:kb',
    description: 'RAG KB-tier retrieval bundle (statutes, court opinions)',
  },
  'rag-case': {
    ttlSeconds: 120,        // 2min — case-scoped retrieval (invalidated on evidence upload)
    keyPrefix:  'rag:case',
    description: 'RAG case-tier retrieval bundle (evidence vectors)',
  },
  embedding: {
    ttlSeconds: 86400,      // 24h — embeddings rarely change for the same text
    keyPrefix:  'embed',
    description: 'Embedding vector cache (embeddinggemma 768-dim)',
  },
  code: {
    ttlSeconds: 21600,      // 6h — code-LLM index per-file output (code-llm-index.ts)
    keyPrefix:  'code:llm_output:path',
    description: 'Per-file/dir code LLM output (ACE fast-AST path)',
  },
  dag: {
    ttlSeconds: 3600,       // 1h — DAG topological ordering (dag-cache.ts)
    keyPrefix:  'dag',
    description: 'DAG topological order cache (CouchDB-backed)',
  },
  authority: {
    ttlSeconds: 900,        // 15min — authority chain (authority-chain.ts)
    keyPrefix:  'auth:chain',
    description: 'Multi-hop statute/case authority chain expansion',
  },
  research: {
    ttlSeconds: 300,        // 5min — research summaries (context-assembler.ts)
    keyPrefix:  'research',
    description: 'Research summaries from web crawl + legal corpus',
  },
  cartridge: {
    ttlSeconds: 21600,      // 6h — default cartridge (medium priority)
    keyPrefix:  'cartridge',
    description: 'CHR-ROM97 cartridge (default / medium priority)',
  },
  'cartridge-critical': {
    ttlSeconds: 86400,      // 24h — active case evidence
    keyPrefix:  'cartridge',
    description: 'CHR-ROM97 cartridge (critical priority — active case)',
  },
  'cartridge-high': {
    ttlSeconds: 43200,      // 12h — recent case data
    keyPrefix:  'cartridge',
    description: 'CHR-ROM97 cartridge (high priority — recent case)',
  },
  agent: {
    ttlSeconds: 1800,       // 30min — agent tool-call LRU (caching-layer.ts)
    keyPrefix:  'agent',
    description: 'Gemma4 agent tool-call result cache',
  },
  session: {
    ttlSeconds: 86400,      // 24h — auth session
    keyPrefix:  'session',
    description: 'Auth session cache',
  },
  settings: {
    ttlSeconds: 5,          // 5s — hot admin settings (chat-memory.ts)
    keyPrefix:  'settings',
    description: 'Admin settings propagation cache (5s TTL)',
  },
};

/**
 * Get the cache policy for a domain.
 *
 * @example
 * const { ttlSeconds, keyPrefix } = getCachePolicy('rag-kb');
 * await redis.set(`${keyPrefix}:${id}`, data, 'EX', ttlSeconds);
 */
export function getCachePolicy(domain: CacheDomain): CachePolicy {
  return POLICIES[domain];
}

/**
 * Build a scoped Redis key using the canonical key prefix for a domain.
 *
 * @example
 * const key = getCacheKey('code', fileHash);
 * // → 'code:llm_output:path:<fileHash>'
 */
export function getCacheKey(domain: CacheDomain, ...segments: string[]): string {
  const { keyPrefix } = POLICIES[domain];
  return segments.length ? `${keyPrefix}:${segments.join(':')}` : keyPrefix;
}

/**
 * All configured domains — useful for monitoring dashboards.
 */
export const CACHE_DOMAINS = Object.keys(POLICIES) as CacheDomain[];
