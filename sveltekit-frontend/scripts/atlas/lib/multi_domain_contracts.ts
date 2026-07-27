import { z } from 'zod';

/**
 * Phase 1.5: Multi-Domain Probabilistic Membership Contracts
 *
 * Extends Phase 1 single-domain labels with probabilistic multi-domain membership.
 * Each packet can belong to multiple CS/engineering/math/programming domains with
 * independent confidence scores. Used for Naive Bayes query routing and evidence lane weighting.
 */

// ============================================================================
// Tier 1: Domain Taxonomy (CS hierarchy)
// ============================================================================

export const CS_DOMAINS = z.enum([
  'algorithms',
  'os',
  'networking',
  'distributed',
  'database',
  'retrieval',
  'compilers',
  'machine_learning',
  'graphics',
  'cuda',
  'simd',
  'linear_algebra',
  'optimization',
  'probability',
  'typescript',
  'go',
  'python',
  'docker',
  'ci_cd',
]);

export type CSDomain = z.infer<typeof CS_DOMAINS>;

// ============================================================================
// Tier 2: Probabilistic Domain Membership
// ============================================================================

export const DomainMembershipsSchema = z.record(
  CS_DOMAINS,
  z.number().min(0).max(1).describe('Probability [0, 1]'),
).describe('Domain -> Confidence mapping. Sum should be ~1.0 (±0.15 tolerance).');

export type DomainMemberships = z.infer<typeof DomainMembershipsSchema>;

// ============================================================================
// Tier 3: Multi-Domain Packet Envelope
// ============================================================================

export const MultiDomainPacketEnvelopeSchema = z.object({
  // Identity (from Phase 1)
  packet_key: z.string().regex(/^ace:packet:.+$/),
  source_ref: z.string(),
  source_ref_key: z.string(),
  feature_id: z.string(),
  feature_label: z.string(),

  // Phase 1 single-domain (backward compatible)
  domain_class: z.string().optional(),
  domain_confidence: z.number().min(0).max(1).optional(),

  // Phase 1.5 multi-domain (new)
  domain_memberships: DomainMembershipsSchema.describe('Multi-domain probabilities'),
  primary_domain: CS_DOMAINS.describe('Highest-probability domain from memberships'),
  primary_domain_confidence: z.number().min(0).max(1),

  // Routing prior for Naive Bayes
  naive_bayes_prior: z.object({
    query_domain: CS_DOMAINS.optional(),
    posterior_distribution: DomainMembershipsSchema.describe('P(domain|query)'),
    top_3_domains: z.array(z.tuple([CS_DOMAINS, z.number()])).describe('[domain, confidence][]'),
  }).optional(),

  // Evidence lane weights (derived from domain membership)
  evidence_lane_weights: z.object({
    semantic_lane: z.number().min(0).max(1).describe('Weight for vector similarity'),
    lexical_lane: z.number().min(0).max(1).describe('Weight for BM25/FTS'),
    structural_lane: z.number().min(0).max(1).describe('Weight for AST/imports'),
    topology_lane: z.number().min(0).max(1).describe('Weight for PageRank/SOM'),
    recency_lane: z.number().min(0).max(1).describe('Weight for freshness'),
  }).optional(),

  // Metadata (from Phase 1)
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type MultiDomainPacketEnvelope = z.infer<typeof MultiDomainPacketEnvelopeSchema>;

// ============================================================================
// Tier 4: Retrieval Query with Domain Context
// ============================================================================

export const MultiDomainQuerySchema = z.object({
  query_text: z.string(),
  query_domain: CS_DOMAINS.optional().describe('User hint about domain (advisory)'),
  detected_keywords: z.array(z.string()).describe('Extracted keywords from query'),
  naive_bayes_prior: z.record(CS_DOMAINS, z.number()).describe('P(domain) before observation'),
  posterior_distribution: z.record(CS_DOMAINS, z.number()).describe('P(domain|query) after Bayes update'),
  top_k_domains: z.array(z.tuple([CS_DOMAINS, z.number()])),
});

export type MultiDomainQuery = z.infer<typeof MultiDomainQuerySchema>;

// ============================================================================
// Tier 5: RRF Fusion with Domain-Weighted Signals
// ============================================================================

export const DomainWeightedRRFCandidateSchema = z.object({
  packet_key: z.string(),
  rrf_score_base: z.number().describe('Standard RRF score across all lanes'),
  domain_boost: z.number().describe('Multiplicative boost from domain matching'),
  final_rrf_score: z.number().describe('rrf_score_base * domain_boost'),
  matching_domains: z.array(z.tuple([CS_DOMAINS, z.number()])).describe('[domain, weight][]'),
  evidence_signals: z.object({
    semantic_score: z.number().optional(),
    lexical_score: z.number().optional(),
    structural_score: z.number().optional(),
    topology_score: z.number().optional(),
    recency_score: z.number().optional(),
  }),
});

export type DomainWeightedRRFCandidate = z.infer<typeof DomainWeightedRRFCandidateSchema>;

// ============================================================================
// Validation & Helper Functions
// ============================================================================

/**
 * Validates domain memberships sum to ~1.0 (allows ±0.15 tolerance for floating-point error)
 */
export function validateDomainMembershipsSum(memberships: DomainMemberships): {
  valid: boolean;
  sum: number;
  error: string | null;
} {
  const sum = Object.values(memberships).reduce((acc, val) => acc + val, 0);
  const valid = sum >= 0.85 && sum <= 1.15;
  const error = valid ? null : `Domain memberships sum to ${sum.toFixed(3)}, expected ~1.0`;

  return { valid, sum, error };
}

/**
 * Derives evidence lane weights from domain membership distribution
 */
export function deriveEvidenceLaneWeights(
  memberships: DomainMemberships,
): z.infer<typeof MultiDomainPacketEnvelopeSchema>['evidence_lane_weights'] {
  // Domain affinity to each evidence lane (heuristic)
  const domainAffinities: Record<CSDomain, Record<string, number>> = {
    algorithms: { semantic: 0.7, lexical: 0.5, structural: 0.8, topology: 0.6, recency: 0.3 },
    os: { semantic: 0.6, lexical: 0.5, structural: 0.7, topology: 0.5, recency: 0.4 },
    networking: { semantic: 0.65, lexical: 0.55, structural: 0.6, topology: 0.7, recency: 0.5 },
    distributed: { semantic: 0.7, lexical: 0.6, structural: 0.65, topology: 0.8, recency: 0.5 },
    database: { semantic: 0.75, lexical: 0.7, structural: 0.7, topology: 0.65, recency: 0.4 },
    retrieval: { semantic: 0.95, lexical: 0.8, structural: 0.5, topology: 0.6, recency: 0.3 },
    compilers: { semantic: 0.6, lexical: 0.65, structural: 0.9, topology: 0.4, recency: 0.2 },
    machine_learning: { semantic: 0.85, lexical: 0.6, structural: 0.5, topology: 0.7, recency: 0.6 },
    graphics: { semantic: 0.7, lexical: 0.4, structural: 0.7, topology: 0.5, recency: 0.4 },
    cuda: { semantic: 0.6, lexical: 0.4, structural: 0.8, topology: 0.3, recency: 0.5 },
    simd: { semantic: 0.5, lexical: 0.4, structural: 0.9, topology: 0.2, recency: 0.4 },
    linear_algebra: { semantic: 0.8, lexical: 0.5, structural: 0.4, topology: 0.6, recency: 0.2 },
    optimization: { semantic: 0.75, lexical: 0.5, structural: 0.4, topology: 0.65, recency: 0.3 },
    probability: { semantic: 0.8, lexical: 0.55, structural: 0.3, topology: 0.7, recency: 0.2 },
    typescript: { semantic: 0.65, lexical: 0.7, structural: 0.85, topology: 0.4, recency: 0.6 },
    go: { semantic: 0.6, lexical: 0.65, structural: 0.8, topology: 0.45, recency: 0.55 },
    python: { semantic: 0.7, lexical: 0.7, structural: 0.75, topology: 0.5, recency: 0.6 },
    docker: { semantic: 0.5, lexical: 0.6, structural: 0.6, topology: 0.4, recency: 0.7 },
    ci_cd: { semantic: 0.55, lexical: 0.6, structural: 0.6, topology: 0.35, recency: 0.75 },
  };

  // Weighted average of lane affinities
  const laneScores = {
    semantic: 0,
    lexical: 0,
    structural: 0,
    topology: 0,
    recency: 0,
  };

  for (const [domain, prob] of Object.entries(memberships)) {
    const affinities = domainAffinities[domain as CSDomain];
    for (const lane of Object.keys(laneScores)) {
      laneScores[lane as keyof typeof laneScores] += (affinities[lane] || 0) * prob;
    }
  }

  // Normalize to sum to 1.0
  const sum = Object.values(laneScores).reduce((a, b) => a + b, 0);
  const normalized = Object.fromEntries(
    Object.entries(laneScores).map(([lane, score]) => [lane, score / sum]),
  );

  return {
    semantic_lane: normalized.semantic,
    lexical_lane: normalized.lexical,
    structural_lane: normalized.structural,
    topology_lane: normalized.topology,
    recency_lane: normalized.recency,
  };
}

/**
 * Computes Naive Bayes posterior P(domain|query) from prior and keyword evidence
 */
export function computeNaiveBayesPosterior(
  prior: DomainMemberships,
  queryKeywords: string[],
  domainKeywordMap: Record<CSDomain, string[]>,
): {
  posterior: DomainMemberships;
  top_3: Array<[CSDomain, number]>;
} {
  const likelihood: Record<string, number> = {};

  // Compute P(keywords|domain) for each domain
  for (const domain of Object.keys(prior) as CSDomain[]) {
    const domainKeywords = new Set(domainKeywordMap[domain] || []);
    const matchCount = queryKeywords.filter(kw => domainKeywords.has(kw)).length;
    likelihood[domain] = (matchCount + 1) / (queryKeywords.length + domainKeywords.size); // Laplace smoothing
  }

  // Bayes rule: P(domain|query) ∝ P(query|domain) * P(domain)
  const unnormalized: Record<string, number> = {};
  let sum = 0;

  for (const domain of Object.keys(prior) as CSDomain[]) {
    unnormalized[domain] = (likelihood[domain] || 0.5) * (prior[domain] || 0.05);
    sum += unnormalized[domain];
  }

  const posterior = Object.fromEntries(
    Object.entries(unnormalized).map(([domain, score]) => [domain, score / sum]),
  ) as DomainMemberships;

  const sorted = Object.entries(posterior).sort(([, a], [, b]) => b - a);
  const top_3 = sorted.slice(0, 3).map(([domain, score]) => [domain as CSDomain, score] as [CSDomain, number]);

  return { posterior, top_3 };
}
