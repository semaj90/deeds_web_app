import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import {
  FeatureDefinitionV1Schema,
  type FeatureDefinitionV1,
  type OkfEvidenceKind,
} from './okf-evidence-feature-v1.js';

export const CANDIDATE_FEATURE_REGISTRY_REVISION = 'atlas.candidate-feature-registry.c25.v1' as const;

const DEFINITIONS: Record<(typeof CANDIDATE_FEATURE_NAMES)[number], {
  definition: string;
  compilerId: string;
  allowedEvidenceKinds: OkfEvidenceKind[];
}> = {
  semantic_similarity_768: {
    definition: 'Query-candidate semantic similarity from the selected semantic representation executor.',
    compilerId: 'atlas.semantic-similarity-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  lexical_score: {
    definition: 'Query-candidate lexical retrieval score from a proven lexical executor.',
    compilerId: 'atlas.lexical-score-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  exact_symbol_match: {
    definition: 'Exact canonical symbol/name match evidence for the candidate.',
    compilerId: 'atlas.exact-symbol-compiler',
    allowedEvidenceKinds: ['AST', 'EXECUTION'],
  },
  ast_signal: {
    definition: 'Structural compatibility derived from Tree-sitter/GIS-owned structural evidence.',
    compilerId: 'atlas.ast-signal-compiler',
    allowedEvidenceKinds: ['AST'],
  },
  authority_norm: {
    definition: 'Normalized graph/process authority score bound to a revisioned graph receipt.',
    compilerId: 'atlas.authority-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  community_fit: {
    definition: 'Fit between query context and revisioned graph/community membership.',
    compilerId: 'atlas.community-fit-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  domain_fit_query: {
    definition: 'Compatibility between query domain classification and candidate domain evidence.',
    compilerId: 'atlas.domain-fit-compiler',
    allowedEvidenceKinds: ['CLASSIFIER', 'LANGEXTRACT', 'AST', 'HUMAN'],
  },
  concept_fit: {
    definition: 'Query-candidate concept compatibility from revisioned ontology evidence.',
    compilerId: 'atlas.concept-fit-compiler',
    allowedEvidenceKinds: ['LANGEXTRACT', 'CLASSIFIER', 'HUMAN'],
  },
  nary_relation_fit: {
    definition: 'Fit against relevant multi-entity process/event hyperedges.',
    compilerId: 'atlas.nary-relation-fit-compiler',
    allowedEvidenceKinds: ['AST', 'LANGEXTRACT', 'EXECUTION', 'HUMAN'],
  },
  kmeans_centroid_similarity: {
    definition: 'Similarity to a revisioned routing centroid; routing evidence only.',
    compilerId: 'atlas.kmeans-centroid-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  kmeans_cluster_rank: {
    definition: 'Rank of the candidate routing cluster for the current query.',
    compilerId: 'atlas.kmeans-rank-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  som_distance: {
    definition: 'Distance in the revisioned SOM routing projection.',
    compilerId: 'atlas.som-distance-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  som_neighbor_radius: {
    definition: 'Discrete SOM neighborhood radius used during bounded routing expansion.',
    compilerId: 'atlas.som-radius-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  hilbert_locality: {
    definition: 'Locality feature derived from revisioned Hilbert ordering of routing coordinates.',
    compilerId: 'atlas.hilbert-locality-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  summary_quality: {
    definition: 'Quality estimate for candidate summary evidence.',
    compilerId: 'atlas.summary-quality-compiler',
    allowedEvidenceKinds: ['LANGEXTRACT', 'CLASSIFIER', 'HUMAN', 'EXECUTION'],
  },
  summary_provenance: {
    definition: 'Confidence that summary evidence has complete producer/source lineage.',
    compilerId: 'atlas.summary-provenance-compiler',
    allowedEvidenceKinds: ['LANGEXTRACT', 'EXECUTION', 'HUMAN'],
  },
  recency: {
    definition: 'Revision-aware freshness/recency score; never substitutes for source identity.',
    compilerId: 'atlas.recency-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  retrieval_frequency: {
    definition: 'Observed retrieval reuse frequency from execution telemetry.',
    compilerId: 'atlas.retrieval-frequency-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
  execution_utility: {
    definition: 'Observed downstream usefulness from validated execution outcomes.',
    compilerId: 'atlas.execution-utility-compiler',
    allowedEvidenceKinds: ['EXECUTION', 'HUMAN'],
  },
  graph_distance: {
    definition: 'Bounded graph distance from query seeds to candidate under a revisioned projection.',
    compilerId: 'atlas.graph-distance-compiler',
    allowedEvidenceKinds: ['EXECUTION', 'AST'],
  },
  process_fit: {
    definition: 'Compatibility with a typed process/workflow relation graph.',
    compilerId: 'atlas.process-fit-compiler',
    allowedEvidenceKinds: ['AST', 'LANGEXTRACT', 'EXECUTION', 'HUMAN'],
  },
  dependency_fanout: {
    definition: 'Normalized dependency/call/import fanout derived from structural graph evidence.',
    compilerId: 'atlas.dependency-fanout-compiler',
    allowedEvidenceKinds: ['AST', 'EXECUTION'],
  },
  feature_label_confidence: {
    definition: 'Confidence of the feature/domain label used for candidate filtering or ranking.',
    compilerId: 'atlas.feature-label-confidence-compiler',
    allowedEvidenceKinds: ['CLASSIFIER', 'LANGEXTRACT', 'HUMAN'],
  },
  source_revision_match: {
    definition: 'Whether candidate evidence matches the requested/current source revision contract.',
    compilerId: 'atlas.source-revision-match-compiler',
    allowedEvidenceKinds: ['AST', 'EXECUTION'],
  },
  representation_revision_match: {
    definition: 'Whether candidate representation lineage matches the query/runtime representation revision.',
    compilerId: 'atlas.representation-revision-match-compiler',
    allowedEvidenceKinds: ['EXECUTION'],
  },
};

export const CANDIDATE_FEATURE_REGISTRY_V1: readonly FeatureDefinitionV1[] = CANDIDATE_FEATURE_NAMES.map((featureName) =>
  FeatureDefinitionV1Schema.parse({
    schema: 'atlas.feature-definition.v1',
    featureName,
    scope: 'QUERY_CANDIDATE',
    definition: DEFINITIONS[featureName].definition,
    compilerId: DEFINITIONS[featureName].compilerId,
    compilerRevision: `${DEFINITIONS[featureName].compilerId}.v1`,
    featureMappingRevision: CANDIDATE_FEATURE_REGISTRY_REVISION,
    allowedEvidenceKinds: DEFINITIONS[featureName].allowedEvidenceKinds,
    canonicalWritesAllowed: false,
  }),
);

export function assertCandidateFeatureRegistryComplete(): void {
  if (CANDIDATE_FEATURE_REGISTRY_V1.length !== CANDIDATE_FEATURE_NAMES.length) {
    throw new Error('CANDIDATE_FEATURE_REGISTRY_WIDTH_MISMATCH');
  }
  for (let i = 0; i < CANDIDATE_FEATURE_NAMES.length; i += 1) {
    if (CANDIDATE_FEATURE_REGISTRY_V1[i]?.featureName !== CANDIDATE_FEATURE_NAMES[i]) {
      throw new Error(`CANDIDATE_FEATURE_REGISTRY_ORDER_MISMATCH:${i}`);
    }
  }
}
