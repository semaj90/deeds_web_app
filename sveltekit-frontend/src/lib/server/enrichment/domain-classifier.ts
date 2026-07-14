/**
 * Domain classification for Atlas packets.
 *
 * Evidence precedence (highest → lowest):
 *   imports > symbols > routes > schema > ast > path > lexical > dependency > semantic > neighbor
 *
 * Confidence policy:
 *   >= 0.80  → primary domain accepted
 *   0.55–0.79 → primary accepted, marked uncertain
 *   < 0.55   → primary_domain = null, fallback_label = 'general'
 *
 * 'general' means "insufficient evidence", not "classification complete".
 * Semantic-neighbor evidence alone must never assign a high-confidence domain.
 */

export type EvidenceKind =
  | 'import'
  | 'symbol'
  | 'path'
  | 'ast'
  | 'schema'
  | 'route'
  | 'dependency'
  | 'lexical'
  | 'semantic'
  | 'neighbor';

export interface DomainEvidence {
  kind: EvidenceKind;
  value: string;
  weight: number;
  source_ref?: string;
}

export interface DomainClassification {
  primary_domain: string | null;
  secondary_domains: string[];
  confidence: number;
  evidence: DomainEvidence[];
  fallback_label: 'general' | null;
  classifier_version: string;
}

export const CLASSIFIER_VERSION = 'domain-classifier-v1';

// Domain taxonomy — extend as the codebase grows
export const DOMAIN_TAXONOMY = [
  'auth',
  'retrieval',
  'embedding',
  'vector',
  'graph',
  'inference',
  'ingestion',
  'enrichment',
  'storage',
  'cache',
  'queue',
  'ui',
  'api',
  'config',
  'test',
  'script',
  'schema',
  'migration',
] as const;

export type DomainLabel = typeof DOMAIN_TAXONOMY[number];

// Weight table per evidence kind (determines how much each kind contributes)
const EVIDENCE_WEIGHTS: Record<EvidenceKind, number> = {
  import:     1.0,
  symbol:     0.9,
  route:      0.9,
  schema:     0.8,
  ast:        0.7,
  path:       0.6,
  dependency: 0.5,
  lexical:    0.4,
  semantic:   0.3,
  neighbor:   0.2,
};

// Domain signals: keywords that map to a domain
const DOMAIN_SIGNALS: Record<DomainLabel, string[]> = {
  auth:        ['session', 'lucia', 'login', 'password', 'user', 'role', 'token', 'auth', 'jwt', 'oauth'],
  retrieval:   ['search', 'retrieval', 'candidates', 'rrf', 'qdrant', 'rerank', 'recall', 'query'],
  embedding:   ['embed', 'embedding', 'vector', 'ollamaembed', 'embeddinggemma', 'encode'],
  vector:      ['qdrant', 'pgvector', 'hnsw', 'ann', 'bm42', 'sparse', 'dense', 'cosine'],
  graph:       ['neo4j', 'cypher', 'pagerank', 'node', 'edge', 'community', 'topology', 'relationship'],
  inference:   ['llama', 'gemma', 'inference', 'generate', 'completion', 'stream', 'chat', 'token'],
  ingestion:   ['ingest', 'parse', 'chunk', 'extract', 'upload', 'pipeline', 'seaweed', 'minio'],
  enrichment:  ['enrich', 'classify', 'summarize', 'domain', 'label', 'annotation', 'promotion'],
  storage:     ['postgres', 'drizzle', 'table', 'migration', 'schema', 'sql', 'insert', 'select'],
  cache:       ['redis', 'valkey', 'bitfrost', 'cache', 'ttl', 'evict', 'ioredis', 'memcache'],
  queue:       ['rabbitmq', 'amqp', 'queue', 'publish', 'subscribe', 'worker', 'consumer', 'job'],
  ui:          ['svelte', 'component', 'route', 'page', 'layout', 'form', 'button', 'modal', 'css'],
  api:         ['endpoint', 'handler', 'route', 'server', 'request', 'response', 'zod', 'fetch'],
  config:      ['config', 'env', 'settings', 'vite', 'svelte.config', 'package.json', 'tsconfig'],
  test:        ['test', 'spec', 'vitest', 'playwright', 'expect', 'mock', 'fixture', 'describe'],
  script:      ['script', 'mjs', 'mts', 'cli', 'node', 'tsx', 'argv', 'process.env'],
  schema:      ['schema', 'zod', 'drizzle', 'postgres', 'table', 'column', 'enum', 'index'],
  migration:   ['migration', 'migrate', 'alter', 'create table', 'drop', 'seed', 'backfill'],
};

/**
 * Score a text fragment against a single domain using its signal keywords.
 * Returns a [0, 1] hit rate across the domain's signals.
 */
function scoreDomainSignals(text: string, domain: DomainLabel): number {
  const lower = text.toLowerCase();
  const signals = DOMAIN_SIGNALS[domain];
  const hits = signals.filter(s => lower.includes(s)).length;
  return hits / signals.length;
}

/**
 * Classify a packet's domain from available text fields.
 *
 * @param sources - Extractors that produced evidence (call extractEvidence() per extractor)
 * @param packetText - Concatenated text: source_ref + summary + content excerpt (max ~2000 chars)
 */
export function classifyDomain(
  packetText: string,
  extraEvidence: DomainEvidence[] = [],
): DomainClassification {
  // Score each domain against the full packet text (lexical lane)
  const domainScores = new Map<DomainLabel, number>();
  for (const domain of DOMAIN_TAXONOMY) {
    const signalScore = scoreDomainSignals(packetText, domain);
    if (signalScore > 0) {
      domainScores.set(domain, signalScore);
    }
  }

  // Aggregate extra evidence (from AST, imports, path analysis etc.)
  const evidenceList: DomainEvidence[] = [...extraEvidence];
  for (const ev of extraEvidence) {
    // If evidence names a known domain, boost its score
    const namedDomain = ev.value as DomainLabel;
    if (DOMAIN_TAXONOMY.includes(namedDomain)) {
      const boost = ev.weight * EVIDENCE_WEIGHTS[ev.kind];
      domainScores.set(namedDomain, (domainScores.get(namedDomain) ?? 0) + boost);
    }
  }

  // Build lexical evidence entries for the explanation
  for (const [domain, score] of domainScores) {
    if (score > 0 && !evidenceList.some(e => e.kind === 'lexical' && e.value === domain)) {
      evidenceList.push({
        kind: 'lexical',
        value: domain,
        weight: score * EVIDENCE_WEIGHTS.lexical,
      });
    }
  }

  // Sort domains by accumulated score
  const sorted = Array.from(domainScores.entries())
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return {
      primary_domain: null,
      secondary_domains: [],
      confidence: 0,
      evidence: evidenceList,
      fallback_label: 'general',
      classifier_version: CLASSIFIER_VERSION,
    };
  }

  const [topDomain, topScore] = sorted[0];
  const secondary = sorted.slice(1, 4).map(([d]) => d);

  // Normalize confidence: top domain score relative to a 0.3 saturation point
  // A score of 0.3 (30% of signals matched) maps to confidence 1.0
  const rawConfidence = Math.min(topScore / 0.3, 1.0);

  // Apply penalty if best evidence is only lexical/semantic (no structural signals)
  const hasStructuralEvidence = extraEvidence.some(e =>
    ['import', 'symbol', 'route', 'schema', 'ast'].includes(e.kind)
  );
  const confidence = hasStructuralEvidence ? rawConfidence : rawConfidence * 0.7;

  if (confidence < 0.55) {
    return {
      primary_domain: null,
      secondary_domains: secondary,
      confidence,
      evidence: evidenceList,
      fallback_label: 'general',
      classifier_version: CLASSIFIER_VERSION,
    };
  }

  return {
    primary_domain: topDomain,
    secondary_domains: secondary,
    confidence,
    evidence: evidenceList,
    fallback_label: null,
    classifier_version: CLASSIFIER_VERSION,
  };
}

/**
 * Build a DomainEvidence entry from a source_ref path.
 * E.g. "src/lib/server/auth/session.ts" → kind='path', value='auth', weight=0.6
 */
export function extractPathEvidence(sourceRef: string): DomainEvidence[] {
  const parts = sourceRef.toLowerCase().split(/[/\\_.]+/);
  const evidence: DomainEvidence[] = [];
  for (const domain of DOMAIN_TAXONOMY) {
    if (parts.some(p => p === domain || p.startsWith(domain))) {
      evidence.push({
        kind: 'path',
        value: domain,
        weight: EVIDENCE_WEIGHTS.path,
        source_ref: sourceRef,
      });
    }
  }
  return evidence;
}
