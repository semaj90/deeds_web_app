/**
 * QW-6 & QW-7: Frozen Baseline Classifier + Taxonomy Registry
 * Deterministic fallback using frozen embeddings and heuristic rules
 * Unblocks domain classification before PyTorch model training
 */

import { db } from '../db/client';
import { domainTaxonomy } from '../db/schema-phase109a';
import { eq, and } from 'drizzle-orm';

// ===== CANONICAL DOMAIN DEFINITIONS =====

const CANONICAL_DOMAINS = [
  {
    domainId: 'retrieval',
    label: 'Retrieval & Search',
    description: 'Vector search, embedding, semantic indexing, Qdrant operations',
    parentDomainId: null,
  },
  {
    domainId: 'auth',
    label: 'Authentication & Sessions',
    description: 'Lucia sessions, credentials, login, authorization',
    parentDomainId: null,
  },
  {
    domainId: 'api_routes',
    label: 'API Routes & Handlers',
    description: 'HTTP endpoints, request/response, API orchestration',
    parentDomainId: null,
  },
  {
    domainId: 'database',
    label: 'Database & ORM',
    description: 'Postgres, Drizzle, schemas, queries, migrations',
    parentDomainId: null,
  },
  {
    domainId: 'embeddings',
    label: 'Embeddings & Models',
    description: 'LLM inference, tensor operations, GPU acceleration',
    parentDomainId: null,
  },
  {
    domainId: 'ui_components',
    label: 'UI Components & State',
    description: 'Svelte components, state management, rendering',
    parentDomainId: null,
  },
  {
    domainId: 'graph_reasoning',
    label: 'Graph & Topology',
    description: 'Neo4j, graph traversal, KAG, relationship reasoning',
    parentDomainId: null,
  },
  {
    domainId: 'testing',
    label: 'Testing & Validation',
    description: 'Unit tests, integration tests, fixtures, validation gates',
    parentDomainId: null,
  },
  {
    domainId: 'caching',
    label: 'Caching & Performance',
    description: 'Redis, Bitfrost, L1/L2 cache, performance optimization',
    parentDomainId: null,
  },
  {
    domainId: 'documentation',
    label: 'Documentation & Specs',
    description: 'README, API docs, architecture specs, specifications',
    parentDomainId: null,
  },
];

// ===== CLASSIFICATION RULES =====

interface ClassificationRule {
  domainId: string;
  keywords: string[];
  antiKeywords?: string[]; // Negative signal
  baseConfidence: number;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    domainId: 'retrieval',
    keywords: [
      'qdrant',
      'search',
      'embedding',
      'vector',
      'similarity',
      'ann',
      'cosine',
      'semantic',
      'retrieval',
    ],
    baseConfidence: 0.85,
  },
  {
    domainId: 'auth',
    keywords: [
      'lucia',
      'session',
      'credentials',
      'password',
      'login',
      'auth',
      'jwt',
      'token',
      'oauth',
    ],
    antiKeywords: ['authentication_error_message'],
    baseConfidence: 0.90,
  },
  {
    domainId: 'api_routes',
    keywords: [
      'post',
      'get',
      'put',
      'delete',
      '/api/',
      'endpoint',
      'handler',
      'request',
      'response',
    ],
    baseConfidence: 0.80,
  },
  {
    domainId: 'database',
    keywords: [
      'postgres',
      'drizzle',
      'query',
      'schema',
      'table',
      'sql',
      'migration',
      'orm',
      'select',
    ],
    baseConfidence: 0.85,
  },
  {
    domainId: 'embeddings',
    keywords: [
      'embedding',
      'model',
      'tensor',
      'gpu',
      'inference',
      'llm',
      'ollama',
      'gemma',
    ],
    antiKeywords: ['comment'],
    baseConfidence: 0.85,
  },
  {
    domainId: 'ui_components',
    keywords: [
      'svelte',
      'component',
      'render',
      'props',
      'state',
      'binding',
      'reactive',
      'ui',
    ],
    baseConfidence: 0.80,
  },
  {
    domainId: 'graph_reasoning',
    keywords: ['neo4j', 'cypher', 'graph', 'traversal', 'kag', 'relationship'],
    baseConfidence: 0.85,
  },
  {
    domainId: 'testing',
    keywords: ['test', 'spec', 'fixture', 'mock', 'validation', 'gate', 'assert'],
    baseConfidence: 0.75,
  },
  {
    domainId: 'caching',
    keywords: ['redis', 'cache', 'bitfrost', 'l1', 'l2', 'ttl', 'expiration'],
    baseConfidence: 0.80,
  },
  {
    domainId: 'documentation',
    keywords: ['readme', 'docs', 'spec', 'architecture', 'guide', 'example'],
    antiKeywords: ['code', 'function', 'class'],
    baseConfidence: 0.70,
  },
];

// ===== IMPLEMENTATIONS =====

/**
 * Classify packet based on content
 * Returns array of domains with confidence scores
 */
export interface ClassificationResult {
  label: string;
  confidence: number;
  source: string;
  matchedKeywords: string[];
}

export async function classifyPacketContent(
  content: string,
  minConfidence: number = 0.5
): Promise<ClassificationResult[]> {
  const contentLower = content.toLowerCase();
  const results: ClassificationResult[] = [];

  for (const rule of CLASSIFICATION_RULES) {
    const matchedKeywords = rule.keywords.filter((kw) =>
      contentLower.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length === 0) continue;

    // Check anti-keywords
    let hasAntiKeyword = false;
    if (rule.antiKeywords) {
      hasAntiKeyword = rule.antiKeywords.some((kw) =>
        contentLower.includes(kw.toLowerCase())
      );
    }

    if (hasAntiKeyword) continue;

    // Boost confidence based on number of matched keywords
    const boost = Math.min(matchedKeywords.length * 0.05, 0.15);
    const confidence = Math.min(rule.baseConfidence + boost, 1.0);

    if (confidence >= minConfidence) {
      results.push({
        label: rule.domainId,
        confidence,
        source: 'baseline_classifier',
        matchedKeywords,
      });
    }
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Initialize domain taxonomy in database
 * Seed with canonical domains
 */
export async function seedDomainTaxonomy(): Promise<number> {
  let created = 0;

  for (const domain of CANONICAL_DOMAINS) {
    // Check if already exists
    const existing = await db
      .select()
      .from(domainTaxonomy)
      .where(
        and(
          eq(domainTaxonomy.domainId, domain.domainId),
          eq(domainTaxonomy.version, 1)
        )
      );

    if (existing.length > 0) {
      continue; // Already exists
    }

    await db.insert(domainTaxonomy).values({
      label: domain.label,
      domainId: domain.domainId,
      version: 1,
      active: true,
      description: domain.description,
      parentDomainId: domain.parentDomainId,
    });

    created++;
  }

  return created;
}

/**
 * Get all active domain labels
 */
export async function getActiveDomains(): Promise<
  Array<{ domainId: string; label: string; description?: string }>
> {
  const domains = await db
    .select({
      domainId: domainTaxonomy.domainId,
      label: domainTaxonomy.label,
      description: domainTaxonomy.description,
    })
    .from(domainTaxonomy)
    .where(eq(domainTaxonomy.active, true))
    .orderBy(domainTaxonomy.label);

  return domains;
}

/**
 * Deprecate a domain label (soft delete)
 * Marks it as inactive and records replacement
 */
export async function deprecateDomain(
  domainId: string,
  reason: string,
  replacedBy?: string
): Promise<boolean> {
  const updated = await db
    .update(domainTaxonomy)
    .set({
      active: false,
      deprecatedAt: new Date(),
      deprecationReason: reason,
      replacedBy: replacedBy || null,
      updatedAt: new Date(),
    })
    .where(eq(domainTaxonomy.domainId, domainId));

  return updated.rowCount > 0;
}

/**
 * Create new domain version (taxonomy evolution)
 */
export async function createDomainVersion(
  domainId: string,
  updates: Partial<typeof CANONICAL_DOMAINS[0]>
): Promise<{ id: string; version: number } | null> {
  // Get current version
  const current = await db
    .select({ version: domainTaxonomy.version })
    .from(domainTaxonomy)
    .where(eq(domainTaxonomy.domainId, domainId))
    .orderBy(domainTaxonomy.version);

  if (current.length === 0) {
    return null; // Domain doesn't exist
  }

  const newVersion = current[current.length - 1].version + 1;

  const result = await db
    .insert(domainTaxonomy)
    .values({
      label: updates.label || '',
      domainId,
      version: newVersion,
      active: true,
      description: updates.description,
      parentDomainId: updates.parentDomainId,
    })
    .returning({ id: domainTaxonomy.id, version: domainTaxonomy.version });

  return result.length > 0
    ? { id: result[0].id as any, version: result[0].version }
    : null;
}

/**
 * Classify and cache result
 * Combines classification logic with caching for performance
 */
export async function classifyAndCache(
  subjectId: string,
  content: string,
  cacheMs: number = 86400000 // 24 hours
): Promise<ClassificationResult[]> {
  // TODO: Add Redis caching layer when ready
  // const cacheKey = `domain:classification:${subjectId}`;
  // const cached = await redis.get(cacheKey);
  // if (cached) return JSON.parse(cached);

  const results = await classifyPacketContent(content);

  // TODO: Cache result
  // await redis.setex(cacheKey, Math.floor(cacheMs / 1000), JSON.stringify(results));

  return results;
}
