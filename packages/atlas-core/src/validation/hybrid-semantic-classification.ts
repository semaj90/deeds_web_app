/**
 * Hybrid Semantic Classification Schema
 *
 * Multi-label probabilistic domain classification with evidence tracking.
 * Combines lexical, semantic, graph, and validation sources.
 *
 * Phase 2 Implementation: July 28, 2026
 */

import { z } from 'zod';

/**
 * Evidence source enumeration
 * Defines where domain scores originate
 */
export const evidenceSourceEnum = z.enum([
  'LEXICAL_KEYWORD',           // Keyword matching on source_ref, file_path, feature_id
  'SEMANTIC_NEIGHBOR',         // Qdrant cosine similarity to domain centroids
  'GRAPH_COMMUNITY',           // Neo4j community detection (PageRank)
  'EXTERNAL_VALIDATION',       // Manual or external domain authority label
  'TEMPORAL_PATTERN',          // Changelog frequency analysis (future)
  'EXTERNAL_LABEL',            // Manual labels from external systems
]);

export type EvidenceSource = z.infer<typeof evidenceSourceEnum>;

/**
 * Evidence flags (bitmask encoding for fast predicates)
 * Do NOT use for evidence storage — only for quick boolean checks
 */
export const enum EvidenceFlags {
  HasEmbedding = 1 << 0,           // 0b0001
  HasLexicalEvidence = 1 << 1,     // 0b0010
  HasGraphEvidence = 1 << 2,       // 0b0100
  HasRuntimeProof = 1 << 3,        // 0b1000
  HasExternalValidation = 1 << 4,  // 0b10000
}

/**
 * Domain score (single classification evidence)
 * Part of multi-label probabilistic output
 */
export const domainScoreSchema = z.object({
  domain: z.string().min(1).max(100),                    // 'auth', 'retrieval', 'embedding', 'graph', 'storage', etc.
  score: z.number().min(0).max(1),                       // Confidence [0, 1]
  source: evidenceSourceEnum,                            // Which lane produced this score
  explanation: z.string().optional(),                    // Human-readable evidence (optional)
});

export type DomainScore = z.infer<typeof domainScoreSchema>;

/**
 * Entity domain evidence (full classification result)
 * Hybrid semantic output: multi-label with confidence per label
 */
export const entityDomainEvidenceSchema = z.object({
  schemaVersion: z.literal('1.0.0'),                     // For future evolution

  // Identity
  entityId: z.string().uuid(),                           // Postgres entity identifier

  // Multi-label probabilistic output
  domains: z.array(domainScoreSchema)
    .min(1)                                              // At least one domain classification
    .max(10),                                            // Reasonable cap (no unbounded growth)

  // Aggregate metrics
  maxScore: z.number().min(0).max(1),                    // Highest confidence among all domains
  aggregateConfidence: z.number().min(0).max(1),         // Blended confidence across all sources
  sourceCount: z.number().int().min(1).max(5),           // How many lanes voted

  // Provenance
  algorithmVersion: z.string(),                          // Algorithm identifier (e.g., "hybrid-semantic:v1.0")
  workspaceRevision: z.string(),                         // Feature snapshot version
  contentHash: z.string().length(64).regex(/^[a-f0-9]+$/), // SHA256 for determinism proof

  // Evidence tracking (do NOT bit-pack; store full evidence)
  evidenceFlags: z.number().int().min(0),                // Bitmask for quick predicates
  evidenceDetails: z.object({
    lexical: z.array(domainScoreSchema).default([]),
    semantic: z.array(domainScoreSchema).default([]),
    graph: z.array(domainScoreSchema).default([]),
    external: z.array(domainScoreSchema).default([]),
  }),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type EntityDomainEvidence = z.infer<typeof entityDomainEvidenceSchema>;

/**
 * Hybrid semantic classification request
 * Input contract for classification pipeline
 */
export const classificationRequestSchema = z.object({
  entityId: z.string().uuid(),
  sourceRef: z.string().optional(),                      // For lexical lane
  sourceData: z.object({}).optional(),                   // Flexible context (metadata, etc.)
  lanes: z.object({
    includeLexical: z.boolean().default(true),
    includeSemantic: z.boolean().default(true),
    includeGraph: z.boolean().default(false),            // Optional (Neo4j may not be ready)
    includeExternal: z.boolean().default(false),         // Optional (manual labels only)
  }).optional(),
  topK: z.number().int().min(1).max(10).default(5),      // Top-K domains to return
});

export type ClassificationRequest = z.infer<typeof classificationRequestSchema>;

/**
 * Hybrid semantic classification response
 * Output contract for classification results
 */
export const classificationResponseSchema = z.object({
  success: z.boolean(),
  result: entityDomainEvidenceSchema.optional(),
  error: z.string().optional(),
  executionTimeMs: z.number(),
  lanesExecuted: z.array(z.enum(['lexical', 'semantic', 'graph', 'external'])),
});

export type ClassificationResponse = z.infer<typeof classificationResponseSchema>;

/**
 * Batch classification request
 * Process multiple entities in a single call
 */
export const batchClassificationRequestSchema = z.object({
  entities: z.array(classificationRequestSchema).min(1).max(100),
  options: z.object({
    parallel: z.boolean().default(true),
    stopOnFirstError: z.boolean().default(false),
  }).optional(),
});

export type BatchClassificationRequest = z.infer<typeof batchClassificationRequestSchema>;

/**
 * Batch classification response
 */
export const batchClassificationResponseSchema = z.object({
  results: z.array(classificationResponseSchema),
  summary: z.object({
    total: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    totalExecutionTimeMs: z.number(),
  }),
});

export type BatchClassificationResponse = z.infer<typeof batchClassificationResponseSchema>;

/**
 * Domain ontology entry
 * Defines valid domains and their properties
 */
export const domainOntologySchema = z.object({
  domain: z.string().min(1).max(100),
  label: z.string(),
  description: z.string().optional(),
  category: z.enum(['core', 'infrastructure', 'optional', 'experimental']).default('core'),
  authority: z.number().min(0).max(1).default(0.5),      // Prior authority score
  parentDomains: z.array(z.string()).default([]),        // Taxonomy hierarchy
});

export type DomainOntology = z.infer<typeof domainOntologySchema>;

/**
 * Canonical domain definitions for deeds-web-app
 * @see memory/ATLAS-ARCHITECTURE-TERMINOLOGY-CLARIFICATION.md Phase 2
 */
export const CANONICAL_DOMAINS: Record<string, DomainOntology> = {
  auth: {
    domain: 'auth',
    label: 'Authentication & Authorization',
    description: 'User authentication, session management, role-based access control',
    category: 'core',
    parentDomains: [],
    authority: 0.95,
  },
  retrieval: {
    domain: 'retrieval',
    label: 'Retrieval & Search',
    description: 'Vector search, keyword search, Qdrant integration',
    category: 'core',
    parentDomains: [],
    authority: 0.95,
  },
  embedding: {
    domain: 'embedding',
    label: 'Embeddings & Vectorization',
    description: 'Vector generation, embedding models, dimensional reduction',
    category: 'core',
    parentDomains: [],
    authority: 0.90,
  },
  graph: {
    domain: 'graph',
    label: 'Graph & Topology',
    description: 'Neo4j operations, graph traversal, topology analysis',
    category: 'core',
    parentDomains: [],
    authority: 0.90,
  },
  storage: {
    domain: 'storage',
    label: 'Data Storage & Persistence',
    description: 'Database operations, cache management, data durability',
    category: 'core',
    parentDomains: [],
    authority: 0.90,
  },
  ai_analysis: {
    domain: 'ai_analysis',
    label: 'AI Analysis & Synthesis',
    description: 'LLM operations, inference, reasoning',
    category: 'core',
    parentDomains: [],
    authority: 0.85,
  },
  ui_components: {
    domain: 'ui_components',
    label: 'UI Components & Rendering',
    description: 'Svelte components, frontend rendering, user interface',
    category: 'infrastructure',
    parentDomains: [],
    authority: 0.80,
  },
  api_routes: {
    domain: 'api_routes',
    label: 'API Routes & Handlers',
    description: 'SvelteKit routes, API endpoints, request handling',
    category: 'infrastructure',
    parentDomains: [],
    authority: 0.85,
  },
  testing: {
    domain: 'testing',
    label: 'Testing & Validation',
    description: 'Unit tests, integration tests, validation logic',
    category: 'infrastructure',
    parentDomains: [],
    authority: 0.75,
  },
  documentation: {
    domain: 'documentation',
    label: 'Documentation & Metadata',
    description: 'Comments, documentation, type annotations',
    category: 'optional',
    parentDomains: [],
    authority: 0.65,
  },
};

/**
 * Validation gates for hybrid semantic classification
 * Define success criteria for Phase 2 implementation
 */
export const CLASSIFICATION_VALIDATION_GATES = {
  G1_SourceCoverage: {
    name: 'Source Coverage',
    description: 'At least 80% of entities receive classifications',
    threshold: 0.80,
  },
  G2_ConfidenceVariance: {
    name: 'Confidence Variance',
    description: 'Average confidence variation across lanes < 0.30',
    threshold: 0.30,
  },
  G3_SourceDiversity: {
    name: 'Source Diversity',
    description: 'Each entity classified from at least 2 lanes',
    threshold: 2,
  },
  G4_DomainAgreement: {
    name: 'Domain Agreement',
    description: 'Top domain from each lane agrees (cosine > 0.7)',
    threshold: 0.70,
  },
  G5_Determinism: {
    name: 'Determinism Proof',
    description: 'Same input → same contentHash within workspace revision',
    threshold: 1.0,  // 100% determinism required
  },
};

export type ClassificationValidationGate = typeof CLASSIFICATION_VALIDATION_GATES;

/**
 * Lexical classification lane
 * Keyword-based domain assignment from source_ref and file structure
 */
export const lexicalLaneSchema = z.object({
  entityId: z.string().uuid(),
  sourceRef: z.string(),
  keywords: z.array(z.string()).default([]),
  matchedDomains: z.array(domainScoreSchema),
  confidence: z.number().min(0).max(1),
});

export type LexicalLane = z.infer<typeof lexicalLaneSchema>;

/**
 * Semantic classification lane
 * Qdrant vector similarity to domain centroids
 */
export const semanticLaneSchema = z.object({
  entityId: z.string().uuid(),
  embeddingDim: z.number().int().min(64).max(1024),
  domainCentroids: z.record(z.string(), z.array(z.number())),  // domain → [768-dim vector]
  scores: z.array(domainScoreSchema),
  confidence: z.number().min(0).max(1),
});

export type SemanticLane = z.infer<typeof semanticLaneSchema>;

/**
 * Graph classification lane
 * Neo4j community membership and pagerank-based authority
 */
export const graphLaneSchema = z.object({
  entityId: z.string().uuid(),
  communityIds: z.array(z.string()).default([]),
  pageRankScore: z.number().min(0).default(0),
  neighborDomains: z.array(domainScoreSchema),
  confidence: z.number().min(0).max(1),
});

export type GraphLane = z.infer<typeof graphLaneSchema>;




