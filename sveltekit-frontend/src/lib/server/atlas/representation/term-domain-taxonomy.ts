import { z } from 'zod';

/**
 * TermDomainTaxonomyV1 prevents overloaded mathematical/algorithm words from
 * becoming accidental architecture. A term is classified by what kind of
 * object it denotes, what Atlas may use it for, and what it must NOT imply.
 */
export const TermDomainKindSchema = z.enum([
  'VECTOR_GEOMETRY',
  'VECTOR_METRIC',
  'LOW_RANK_DECOMPOSITION',
  'GRAPH_COMMUNITY',
  'GRAPH_TRAVERSAL',
  'GRAPH_RANKING',
  'GRAPH_SEARCH',
  'LOCALITY_ORDER',
  'INTERPOLATION',
  'SELECTION',
  'PROBABILITY_NORMALIZATION',
  'INTEGRITY_LINEAGE',
  'COMBINATORICS',
  'SCALAR_OPTIMIZATION',
  'ROTATION_MANIFOLD',
  'DERIVATIVE_DIAGNOSTIC',
  'EXECUTION_KERNEL',
]);
export type TermDomainKind = z.infer<typeof TermDomainKindSchema>;

export const RelationInferenceRoleSchema = z.enum([
  'NONE',
  'CANDIDATE_PRIOR',
  'SIMILARITY_FEATURE',
  'PARTITION_FEATURE',
  'AUTHORITY_FEATURE',
  'TRAVERSAL_POLICY',
  'LOCALITY_HINT',
  'HARDWARE_RESPONSE_MODEL',
  'INTEGRITY_ONLY',
  'EXECUTION_ONLY',
]);
export type RelationInferenceRole = z.infer<typeof RelationInferenceRoleSchema>;

export const TermDomainEntryV1Schema = z.object({
  canonicalTerm: z.string().min(1),
  aliases: z.array(z.string().min(1)).max(16),
  domain: TermDomainKindSchema,
  mathematicalObject: z.string().min(1),
  relationInferenceRole: RelationInferenceRoleSchema,
  recommendedUses: z.array(z.string().min(1)).min(1).max(12),
  forbiddenClaims: z.array(z.string().min(1)).max(12),
}).strict();
export type TermDomainEntryV1 = z.infer<typeof TermDomainEntryV1Schema>;

const TERM_ENTRIES: readonly TermDomainEntryV1[] = [
  {
    canonicalTerm: 'hilbert-space', aliases: ['hilbert space'], domain: 'VECTOR_GEOMETRY',
    mathematicalObject: 'complete real/complex inner-product space', relationInferenceRole: 'SIMILARITY_FEATURE',
    recommendedUses: ['dot-product geometry', 'cosine after normalization', 'orthogonal projection', 'PCA/SVD interpretation'],
    forbiddenClaims: ['does not imply infinite dimensionality', 'does not imply quantum semantics', 'does not create structural graph edges'],
  },
  {
    canonicalTerm: 'hilbert-curve', aliases: ['hilbert curve', 'hilbert sort'], domain: 'LOCALITY_ORDER',
    mathematicalObject: 'space-filling locality ordering', relationInferenceRole: 'LOCALITY_HINT',
    recommendedUses: ['tile locality', 'cache ordering', 'spatially coherent traversal'],
    forbiddenClaims: ['not semantic similarity', 'not Hilbert-space inner-product geometry'],
  },
  {
    canonicalTerm: 'cosine', aliases: ['cosine similarity', 'cosine distance'], domain: 'VECTOR_METRIC',
    mathematicalObject: 'normalized inner-product similarity/distance', relationInferenceRole: 'SIMILARITY_FEATURE',
    recommendedUses: ['semantic retrieval', 'rerank feature', 'exact KNN distance/similarity'],
    forbiddenClaims: ['similarity does not prove CALLS/IMPORTS/REFERENCES relations'],
  },
  {
    canonicalTerm: 'manhattan', aliases: ['manhattan distance', 'l1', 'cityblock'], domain: 'VECTOR_METRIC',
    mathematicalObject: 'L1 metric sum_i |x_i-y_i|', relationInferenceRole: 'SIMILARITY_FEATURE',
    recommendedUses: ['robust coordinate-wise distance', 'low-dimensional feature comparison', 'challenger metric evaluation'],
    forbiddenClaims: ['not a graph community algorithm', 'not a structural-relation proof'],
  },
  {
    canonicalTerm: 'pca', aliases: ['principal component analysis'], domain: 'LOW_RANK_DECOMPOSITION',
    mathematicalObject: 'orthogonal low-rank projection from covariance/SVD structure', relationInferenceRole: 'CANDIDATE_PRIOR',
    recommendedUses: ['semantic768 to pca128', 'routing', 'landmark selection', 'tile locality', 'low-rank sampling'],
    forbiddenClaims: ['derived components are not canonical semantic truth unless separately promoted'],
  },
  {
    canonicalTerm: 'svd', aliases: ['singular value decomposition'], domain: 'LOW_RANK_DECOMPOSITION',
    mathematicalObject: 'matrix factorization X=UΣV^T', relationInferenceRole: 'CANDIDATE_PRIOR',
    recommendedUses: ['PCA basis construction', 'rank diagnostics', 'low-rank approximation'],
    forbiddenClaims: ['not a graph traversal algorithm'],
  },
  {
    canonicalTerm: 'leiden', aliases: ['leiden community'], domain: 'GRAPH_COMMUNITY',
    mathematicalObject: 'modularity-optimizing graph partition method with refinement', relationInferenceRole: 'PARTITION_FEATURE',
    recommendedUses: ['community ID feature', 'bounded community fanout', 'graph partition diagnostics'],
    forbiddenClaims: ['community co-membership is not a CALLS/IMPORTS/REFERENCES fact', 'not a vector metric'],
  },
  {
    canonicalTerm: 'louvain', aliases: ['louvain community'], domain: 'GRAPH_COMMUNITY',
    mathematicalObject: 'hierarchical modularity-optimization graph partition method', relationInferenceRole: 'PARTITION_FEATURE',
    recommendedUses: ['reference/challenger community partition', 'modularity diagnostics'],
    forbiddenClaims: ['community co-membership is not a structural relation proof', 'not a distance metric'],
  },
  {
    canonicalTerm: 'pagerank', aliases: ['page rank'], domain: 'GRAPH_RANKING',
    mathematicalObject: 'stationary/iterative link-analysis ranking', relationInferenceRole: 'AUTHORITY_FEATURE',
    recommendedUses: ['graph authority feature', 'candidate prioritization', 'owner-search prior'],
    forbiddenClaims: ['authority is not relevance by itself', 'damping constants are policy parameters not universal laws'],
  },
  {
    canonicalTerm: 'bfs', aliases: ['breadth first search', 'breadth-first search'], domain: 'GRAPH_TRAVERSAL',
    mathematicalObject: 'level-order graph traversal', relationInferenceRole: 'TRAVERSAL_POLICY',
    recommendedUses: ['unweighted shortest-hop reference', 'bounded K-hop fanout'],
    forbiddenClaims: ['does not optimize arbitrary weighted path cost'],
  },
  {
    canonicalTerm: 'dfs', aliases: ['depth first search', 'depth-first search'], domain: 'GRAPH_TRAVERSAL',
    mathematicalObject: 'depth-oriented graph traversal', relationInferenceRole: 'TRAVERSAL_POLICY',
    recommendedUses: ['reachability', 'cycle/SCC helpers', 'exhaustive branch traversal under budget'],
    forbiddenClaims: ['does not guarantee shortest path in a generic graph'],
  },
  {
    canonicalTerm: 'a-star', aliases: ['a*', 'astar', 'a star'], domain: 'GRAPH_SEARCH',
    mathematicalObject: 'best-first shortest-path search ordered by f(n)=g(n)+h(n)', relationInferenceRole: 'TRAVERSAL_POLICY',
    recommendedUses: ['exact path search with admissible lower bound', 'bounded challenger with unproven heuristics'],
    forbiddenClaims: ['unproven PCA/latent/GNN heuristic cannot claim exact optimality'],
  },
  {
    canonicalTerm: 'beam-search', aliases: ['beam', 'beam search'], domain: 'GRAPH_SEARCH',
    mathematicalObject: 'bounded best-first/frontier truncation search', relationInferenceRole: 'TRAVERSAL_POLICY',
    recommendedUses: ['bounded context fanout', 'resource-constrained multihop search'],
    forbiddenClaims: ['beam truncation can remove the globally optimal path'],
  },
  {
    canonicalTerm: 'tricubic', aliases: ['tricubic interpolation', 'cubic grid interpolation'], domain: 'INTERPOLATION',
    mathematicalObject: 'tensor-product/local cubic interpolation on gridded coordinates', relationInferenceRole: 'HARDWARE_RESPONSE_MODEL',
    recommendedUses: ['latency/recall/VRAM response-surface interpolation', 'autotuning estimates on gridded measurements'],
    forbiddenClaims: ['not a nearest-neighbor search algorithm', 'not a semantic manifold proof'],
  },
  {
    canonicalTerm: 'top-k', aliases: ['topk', 'select-k'], domain: 'SELECTION',
    mathematicalObject: 'order-statistic selection of k best key/value pairs', relationInferenceRole: 'CANDIDATE_PRIOR',
    recommendedUses: ['candidate compaction', 'streaming exact merge', 'beam/frontier truncation'],
    forbiddenClaims: ['backend tie order is not canonical identity order'],
  },
  {
    canonicalTerm: 'softmax', aliases: ['soft max'], domain: 'PROBABILITY_NORMALIZATION',
    mathematicalObject: 'normalized exponential map over logits', relationInferenceRole: 'CANDIDATE_PRIOR',
    recommendedUses: ['fanout budget allocation', 'router weights', 'attention normalization'],
    forbiddenClaims: ['softmax mass is not truth probability unless calibrated for that meaning'],
  },
  {
    canonicalTerm: 'merkle', aliases: ['merkel', 'merkle tree'], domain: 'INTEGRITY_LINEAGE',
    mathematicalObject: 'hash tree / content-integrity hierarchy', relationInferenceRole: 'INTEGRITY_ONLY',
    recommendedUses: ['artifact lineage', 'cache verification', 'stage/DAG receipt integrity'],
    forbiddenClaims: ['hash proximity is not semantic similarity'],
  },
  {
    canonicalTerm: 'fibonacci', aliases: ['fibonacci sequence', 'fibonacci search'], domain: 'COMBINATORICS',
    mathematicalObject: 'integer recurrence; optionally a bounded ordered-search schedule', relationInferenceRole: 'NONE',
    recommendedUses: ['1-D ordered search/tuning only when assumptions match', 'diagnostic sequence/tile schedules'],
    forbiddenClaims: ['not a generic graph branching law', 'not a relevance law'],
  },
  {
    canonicalTerm: 'pascal-triangle', aliases: ['pascal triangle', "pascal's triangle"], domain: 'COMBINATORICS',
    mathematicalObject: 'binomial-coefficient recurrence', relationInferenceRole: 'NONE',
    recommendedUses: ['combinatorial counting', 'binomial expansion reasoning'],
    forbiddenClaims: ['not a graph-search policy by itself'],
  },
  {
    canonicalTerm: 'golden-section', aliases: ['golden ratio search', 'golden section search'], domain: 'SCALAR_OPTIMIZATION',
    mathematicalObject: 'bracket-reduction method for a 1-D unimodal objective', relationInferenceRole: 'NONE',
    recommendedUses: ['tune one scalar parameter against a measured objective'],
    forbiddenClaims: ['not a generic graph-search or prime-number law'],
  },
  {
    canonicalTerm: 'quaternion', aliases: ['quaternion s3', 'unit quaternion'], domain: 'ROTATION_MANIFOLD',
    mathematicalObject: 'four-component quaternion; unit quaternions lie on S^3', relationInferenceRole: 'SIMILARITY_FEATURE',
    recommendedUses: ['derived topology/orientation feature', 'absolute-dot angular rerank'],
    forbiddenClaims: ['not a substitute for arbitrary semantic768 geometry'],
  },
  {
    canonicalTerm: 'jacobian', aliases: ['jvp', 'jacobian vector product'], domain: 'DERIVATIVE_DIAGNOSTIC',
    mathematicalObject: 'local derivative/sensitivity operator', relationInferenceRole: 'NONE',
    recommendedUses: ['local sensitivity', 'routing diagnostics', 'JVP without full Jacobian materialization'],
    forbiddenClaims: ['matrix shape does not create routing laws or graph relations'],
  },
  {
    canonicalTerm: 'flashattention', aliases: ['flash attention', 'flashattention-2', 'fa2'], domain: 'EXECUTION_KERNEL',
    mathematicalObject: 'IO-aware exact scaled-dot-product-attention implementation', relationInferenceRole: 'EXECUTION_ONLY',
    recommendedUses: ['attention backend', 'IO-aware tiling design reference'],
    forbiddenClaims: ['does not change attention semantics into a graph-search law'],
  },
];

const INDEX = new Map<string, TermDomainEntryV1>();
for (const entry of TERM_ENTRIES) {
  for (const key of [entry.canonicalTerm, ...entry.aliases]) INDEX.set(normalizeTerm(key), entry);
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
}

export function classifyAtlasTerm(term: string): TermDomainEntryV1 | null {
  return INDEX.get(normalizeTerm(term)) ?? null;
}

export function listAtlasTermTaxonomy(): readonly TermDomainEntryV1[] {
  return TERM_ENTRIES;
}

/**
 * Relation-inference gate: only source/AST/DB facts may create canonical
 * structural relations. Taxonomy terms here may prioritize inspection but do
 * not manufacture CALLS/IMPORTS/REFERENCES/DEFINES facts.
 */
export function mayCreateCanonicalStructuralRelation(term: string): boolean {
  const classified = classifyAtlasTerm(term);
  return classified === null ? false : false;
}
