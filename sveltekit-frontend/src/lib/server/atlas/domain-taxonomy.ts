/**
 * Canonical Domain Taxonomy
 *
 * Owns domain normalization, fallback policy, and evidence extraction for
 * enrichment writers. This is the authority module for domain_class handling
 * inside the workstation control plane.
 */

export const DOMAIN_TAXONOMY_VERSION = 'parent-atlas-domain-taxonomy-v1';

export const CANONICAL_DOMAINS = [
  'auth',
  'ui',
  'retrieval',
  'network',
  'database',
  'cache',
  'agent',
  'graph',
  'ml',
] as const;

export type CanonicalDomain = (typeof CANONICAL_DOMAINS)[number];

export type DomainEvidenceKind =
  | 'path'
  | 'import'
  | 'export'
  | 'symbol'
  | 'ast'
  | 'route'
  | 'schema'
  | 'dependency'
  | 'lexical'
  | 'semantic'
  | 'neighbor';

export interface DomainEvidence {
  kind: DomainEvidenceKind;
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

export interface NormalizedDomainLabel {
  canonical: CanonicalDomain | null;
  fallback: 'general' | null;
  original: string;
  normalization: 'canonical' | 'alias' | 'deprecated_fallback' | 'unknown';
}

export interface DomainTaxonomyInput {
  sourceRef?: string | null;
  featureId?: string | null;
  summary?: string | null;
  title?: string | null;
  symbol?: string | null;
  imports?: string[] | null;
  routes?: string[] | null;
  schema?: string[] | null;
  dependencies?: string[] | null;
  neighbors?: string[] | null;
  metadata?: string[] | null;
}

const LEGACY_DOMAIN_ALIASES: Record<string, CanonicalDomain | null> = {
  auth: 'auth',
  authentication: 'auth',
  ui: 'ui',
  frontend: 'ui',
  ranking: 'retrieval',
  vector_search: 'retrieval',
  network: 'network',
  api: 'network',
  database: 'database',
  db: 'database',
  cache: 'cache',
  agent: 'agent',
  orchestration: 'agent',
  graph: 'graph',
  topology: 'graph',
  ml: 'ml',
  machinelearning: 'ml',
  general: null,
  other: null,
  unknown: null,
  general_abstractions: null,
  general_abstraction: null,
};

const DOMAIN_KEYWORDS: Record<CanonicalDomain, string[]> = {
  auth: ['session', 'login', 'logout', 'authenticate', 'authorize', 'token', 'credential', 'password', 'lucia', 'jwt', 'oauth', 'signin', 'signup'],
  ui: ['button', 'component', 'render', 'state', 'effect', 'prop', 'modal', 'dialog', 'svelte', 'onclick', 'form', 'input', 'layout', 'styles'],
  retrieval: ['search', 'query', 'rank', 'score', 'candidate', 'embedding', 'vector', 'qdrant', 'rrf', 'bm25', 'hybrid', 'retrieval', 'retrieve', 'dense', 'sparse'],
  network: ['fetch', 'http', 'request', 'response', 'api', 'endpoint', 'rest', 'protocol', 'socket', 'stream'],
  database: ['sql', 'postgres', 'drizzle', 'query', 'transaction', 'schema', 'migration', 'table', 'column', 'row', 'insert', 'select', 'update', 'delete'],
  cache: ['redis', 'valkey', 'cache', 'ttl', 'bifrost', 'bitfrost', 'memo', 'store', 'persist', 'invalidate'],
  agent: ['agent', 'tool', 'dispatcher', 'mcp', 'trace', 'workflow', 'orchestrat', 'agentic', 'langgraph', 'prompt'],
  graph: ['neo4j', 'edge', 'node', 'pagerank', 'community', 'topology', 'relationship', 'traversal', 'neighbor', 'path'],
  ml: ['xgboost', 'classifier', 'embedding', 'som', 'kmeans', 'tensor', 'model', 'train', 'predict', 'inference', 'neural', 'network'],
};

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function tokenize(value: string | null | undefined): string[] {
  return cleanText(value)
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeDomainLabel(label: string | null | undefined): NormalizedDomainLabel {
  const original = String(label ?? '').trim();
  const normalized = cleanText(label).replace(/\s+/g, '_');

  if (!normalized) {
    return {
      canonical: null,
      fallback: 'general',
      original,
      normalization: 'unknown',
    };
  }

  const exactMatch = CANONICAL_DOMAINS.find((domain) => domain === normalized);
  if (exactMatch) {
    return {
      canonical: exactMatch,
      fallback: null,
      original,
      normalization: 'canonical',
    };
  }

  if (normalized in LEGACY_DOMAIN_ALIASES) {
    const canonical = LEGACY_DOMAIN_ALIASES[normalized];
    return {
      canonical,
      fallback: canonical ? null : 'general',
      original,
      normalization: canonical
        ? 'alias'
        : normalized === 'general' || normalized === 'other' || normalized === 'unknown' || normalized === 'general_abstractions' || normalized === 'general_abstraction'
          ? 'deprecated_fallback'
          : 'unknown',
    };
  }

  return {
    canonical: null,
    fallback: 'general',
    original,
    normalization: 'unknown',
  };
}

export function extractDomainEvidence(input: DomainTaxonomyInput): DomainEvidence[] {
  const evidence: DomainEvidence[] = [];

  const add = (kind: DomainEvidenceKind, value: string | null | undefined, weight: number, sourceRef?: string | null) => {
    const clean = String(value ?? '').trim();
    if (!clean) return;
    evidence.push({
      kind,
      value: clean,
      weight,
      source_ref: sourceRef ? String(sourceRef).trim() : undefined,
    });
  };

  const sourceRef = String(input.sourceRef ?? '').trim();
  const featureId = String(input.featureId ?? '').trim();
  const summary = String(input.summary ?? '').trim();
  const title = String(input.title ?? '').trim();
  const symbol = String(input.symbol ?? '').trim();

  add('path', sourceRef, 1.4);
  add('path', featureId, 1.2, sourceRef);
  add('symbol', symbol, 1.3, sourceRef);
  add('lexical', title, 0.8, sourceRef);
  add('semantic', summary, 0.7, sourceRef);

  for (const value of input.imports ?? []) add('import', value, 1.15, sourceRef);
  for (const value of input.routes ?? []) add('route', value, 1.1, sourceRef);
  for (const value of input.schema ?? []) add('schema', value, 1.15, sourceRef);
  for (const value of input.dependencies ?? []) add('dependency', value, 1.0, sourceRef);
  for (const value of input.neighbors ?? []) add('neighbor', value, 0.6, sourceRef);
  for (const value of input.metadata ?? []) add('semantic', value, 0.5, sourceRef);

  return evidence;
}

export function classifyDomainTaxonomy(input: DomainTaxonomyInput): DomainClassification {
  const evidence = extractDomainEvidence(input);
  const text = [
    input.sourceRef,
    input.featureId,
    input.summary,
    input.title,
    input.symbol,
    ...(input.imports ?? []),
    ...(input.routes ?? []),
    ...(input.schema ?? []),
    ...(input.dependencies ?? []),
    ...(input.neighbors ?? []),
    ...(input.metadata ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scores: Record<CanonicalDomain, number> = {
    auth: 0,
    ui: 0,
    retrieval: 0,
    network: 0,
    database: 0,
    cache: 0,
    agent: 0,
    graph: 0,
    ml: 0,
  };

  for (const [domain, words] of Object.entries(DOMAIN_KEYWORDS) as Array<[CanonicalDomain, string[]]>) {
    for (const word of words) {
      if (text.includes(word)) {
        scores[domain] += 1;
      }
    }
  }

  for (const item of evidence) {
    const tokens = tokenize(item.value);
    for (const domain of CANONICAL_DOMAINS) {
      const matches = DOMAIN_KEYWORDS[domain].filter((word) => tokens.some((token) => token.includes(word))).length;
      scores[domain] += matches * item.weight;
    }
  }

  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]) as Array<[CanonicalDomain, number]>;

  const totalScore = ranked.reduce((sum, [, score]) => sum + score, 0);
  const best = ranked[0];
  const confidence = best && totalScore > 0 ? best[1] / totalScore : 0;

  const bestScore = best?.[1] ?? 0;
  const primary_domain = best && confidence >= 0.55 && bestScore >= 1.5 ? best[0] : null;
  const secondary_domains = ranked.slice(1, 3).map(([domain]) => domain);

  return {
    primary_domain,
    secondary_domains,
    confidence: Number(confidence.toFixed(3)),
    evidence,
    fallback_label: primary_domain ? null : 'general',
    classifier_version: DOMAIN_TAXONOMY_VERSION,
  };
}

export function classifyDomainLabel(input: DomainTaxonomyInput): string {
  const classification = classifyDomainTaxonomy(input);
  return classification.primary_domain ?? classification.fallback_label ?? 'general';
}
