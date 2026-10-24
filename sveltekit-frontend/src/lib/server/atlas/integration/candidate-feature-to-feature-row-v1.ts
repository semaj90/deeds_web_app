import {
  pickPageRankAuthorityScore,
  type PageRankAuthorityLike,
} from '../../topology/pagerank-authority.js';
import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';
import type { CandidateFeatureRowV1 } from '../features/candidate-feature-row-v1.js';
import { assertRepresentationBindingSet } from '../features/canonical-candidate-v1.js';
import { buildFeatureRowV1, type FeatureRowV1 } from '../ranking/feature-row-v1.js';
import {
  assertSemanticRecipeCompatibilityV1,
  type SemanticEmbeddingRecipeV1,
} from '../../embedding/semantic-recipe-compatibility-v1.js';
import type { LexicalInputProofV1 } from '../contracts/lexical-input-proof-v1.js';
import { sha256Stable } from '../agentic-file-compiler/contracts.js';
import type { AtlasCanonicalAstEvidenceV1 } from './atlas-ast-evidence-reader-v1.js';
import {
  verifyOntologyObservationTupleV1,
  type OntologyObservationTupleV1,
} from '../evidence/ontology-observation-tuple-v1.js';
import {
  isGenuineQualifiedEvidenceV1,
  type QualifiedEvidenceV1,
} from '../execution/topk-evidence-fetch-v1.js';

export interface PromotedPageRankAuthorityV1 extends PageRankAuthorityLike {
  runId?: string | null;
  graphRevision?: string | null;
  status?: string | null;
  didConverge?: boolean | null;
}

export interface PromoteCandidateFeatureRowV1Input {
  candidate: CandidateFeatureRowV1;
  locator: EvidenceLocatorV1;
  pagerank: PromotedPageRankAuthorityV1;
  lexicalEvidence?: LexicalInputProofV1;
  astEvidence?: AtlasCanonicalAstEvidenceV1 & { sourceEvidence: QualifiedEvidenceV1 };
  ontologyEvidence?: readonly OntologyObservationTupleV1[];
  semanticEvidence?: {
    packetKey: string;
    canonicalId: string;
    sourceRef: string;
    workspaceRevision: string;
    sourceRevision: string;
    queryRecipe: SemanticEmbeddingRecipeV1;
    documentRecipe: SemanticEmbeddingRecipeV1;
  };
  rrf: number;
  freshness: number;
  /**
   * When true (default), strictly verifies that the PageRank data originates
   * from a converged, promoted run matching the candidate's graphRevision.
   */
  requirePromoted?: boolean;
}

function normalizeSha256(value: string): string {
  return value.replace(/^sha256:/i, '').toLowerCase();
}

/**
 * Promotion boundary between the nullable/raw candidate feature envelope and the
 * normalized FeatureRowV1 used by ranking/eval. The adapter joins ONLY
 * promoted and revision-qualified PageRank authority, failing closed on
 * unpromoted, unconverged, corrupt, or revision-mismatched data.
 */
export function promoteCandidateFeatureRowV1(input: PromoteCandidateFeatureRowV1Input): FeatureRowV1 {
  const { candidate, locator, pagerank } = input;
  const requirePromoted = input.requirePromoted ?? true;

  if (candidate.canonicalId !== locator.canonicalId) {
    throw new Error(`CANDIDATE_FEATURE_CANONICAL_ID_MISMATCH:${candidate.canonicalId}:${locator.canonicalId}`);
  }
  if (!candidate.packetKey || candidate.packetKey !== locator.packetKey) {
    throw new Error(`CANDIDATE_FEATURE_PACKET_KEY_MISMATCH:${candidate.packetKey ?? ''}:${locator.packetKey ?? ''}`);
  }
  if (!candidate.sourceRef || candidate.sourceRef !== locator.sourceRef) {
    throw new Error(`CANDIDATE_FEATURE_SOURCE_REF_MISMATCH:${candidate.sourceRef ?? ''}:${locator.sourceRef}`);
  }
  if (candidate.workspaceRevision !== locator.workspaceRevision) {
    throw new Error('CANDIDATE_FEATURE_REVISION_MISMATCH:workspace');
  }
  if (candidate.sourceRevision !== locator.sourceRevision) {
    throw new Error('CANDIDATE_FEATURE_REVISION_MISMATCH:source');
  }
  if (candidate.laneMask.includes('lexical') || candidate.lexicalRelevance !== null) {
    const lexicalEvidence = input.lexicalEvidence;
    if (!lexicalEvidence) throw new Error('CANDIDATE_FEATURE_LEXICAL_EVIDENCE_REQUIRED');
    if (lexicalEvidence.packetKey !== candidate.packetKey || lexicalEvidence.packetKey !== locator.packetKey) {
      throw new Error('CANDIDATE_FEATURE_LEXICAL_PACKET_KEY_MISMATCH');
    }
    if (lexicalEvidence.sourceRef !== candidate.sourceRef || lexicalEvidence.sourceRef !== locator.sourceRef) {
      throw new Error('CANDIDATE_FEATURE_LEXICAL_SOURCE_REF_MISMATCH');
    }
    if (lexicalEvidence.workspaceRevision !== candidate.workspaceRevision || lexicalEvidence.workspaceRevision !== locator.workspaceRevision) {
      throw new Error('CANDIDATE_FEATURE_LEXICAL_WORKSPACE_REVISION_MISMATCH');
    }
    if (lexicalEvidence.sourceRevision !== candidate.sourceRevision || lexicalEvidence.sourceRevision !== locator.sourceRevision) {
      throw new Error('CANDIDATE_FEATURE_LEXICAL_SOURCE_REVISION_MISMATCH');
    }
    const { inputChecksum, ...lexicalBody } = lexicalEvidence;
    if (sha256Stable(lexicalBody) !== inputChecksum) {
      throw new Error('CANDIDATE_FEATURE_LEXICAL_PROOF_CHECKSUM_MISMATCH');
    }
    if (!lexicalEvidence.eligible || lexicalEvidence.declaredContentHash !== lexicalEvidence.computedContentHash) {
      throw new Error(`CANDIDATE_FEATURE_LEXICAL_PROOF_NOT_ELIGIBLE:${lexicalEvidence.rejectionReason ?? 'CONTENT_HASH_MISMATCH'}`);
    }
    if (normalizeSha256(lexicalEvidence.computedContentHash) !== normalizeSha256(locator.contentHash)) {
      throw new Error('CANDIDATE_FEATURE_LEXICAL_CONTENT_DIGEST_MISMATCH');
    }
  }
  if (candidate.laneMask.includes('ast') || candidate.astAffinity !== null) {
    const astEvidence = input.astEvidence;
    if (!astEvidence) throw new Error('CANDIDATE_FEATURE_AST_EVIDENCE_REQUIRED');
    if (!candidate.treeNodeId || astEvidence.treeNodeId !== candidate.treeNodeId) {
      throw new Error('CANDIDATE_FEATURE_AST_TREE_NODE_MISMATCH');
    }
    if (astEvidence.canonicalId !== candidate.canonicalId || astEvidence.canonicalId !== locator.canonicalId) {
      throw new Error('CANDIDATE_FEATURE_AST_CANONICAL_ID_MISMATCH');
    }
    if (astEvidence.packetKey !== candidate.packetKey || astEvidence.packetKey !== locator.packetKey) {
      throw new Error('CANDIDATE_FEATURE_AST_PACKET_KEY_MISMATCH');
    }
    if (candidate.symbolVersionId && astEvidence.symbolVersionId !== candidate.symbolVersionId) {
      throw new Error('CANDIDATE_FEATURE_AST_SYMBOL_VERSION_MISMATCH');
    }
    if (astEvidence.sourceRef !== candidate.sourceRef || astEvidence.sourceRef !== locator.sourceRef) {
      throw new Error('CANDIDATE_FEATURE_AST_SOURCE_REF_MISMATCH');
    }
    if (astEvidence.workspaceRevision !== candidate.workspaceRevision || astEvidence.workspaceRevision !== locator.workspaceRevision) {
      throw new Error('CANDIDATE_FEATURE_AST_WORKSPACE_REVISION_MISMATCH');
    }
    if (astEvidence.sourceRevision !== candidate.sourceRevision || astEvidence.sourceRevision !== locator.sourceRevision) {
      throw new Error('CANDIDATE_FEATURE_AST_SOURCE_REVISION_MISMATCH');
    }
    const startByte = astEvidence.startByte === null ? NaN : Number(astEvidence.startByte);
    const endByte = astEvidence.endByte === null ? NaN : Number(astEvidence.endByte);
    if (!astEvidence.sourceContentHash || !Number.isInteger(startByte) || !Number.isInteger(endByte) || startByte < 0 || endByte < startByte) {
      throw new Error('CANDIDATE_FEATURE_AST_SPAN_OR_DIGEST_INVALID');
    }
    if (normalizeSha256(astEvidence.sourceContentHash) !== normalizeSha256(locator.contentHash)) {
      throw new Error('CANDIDATE_FEATURE_AST_CONTENT_DIGEST_MISMATCH');
    }
    if (locator.span && (startByte < locator.span.startByte || endByte > locator.span.endByte)) {
      throw new Error('CANDIDATE_FEATURE_AST_SPAN_OUTSIDE_LOCATOR');
    }
    const sourceEvidence = astEvidence.sourceEvidence;
    if (!isGenuineQualifiedEvidenceV1(sourceEvidence)) {
      throw new Error('CANDIDATE_FEATURE_AST_SOURCE_EVIDENCE_UNVERIFIED');
    }
    if (sourceEvidence.canonicalId !== candidate.canonicalId || sourceEvidence.sourceRef !== candidate.sourceRef
      || sourceEvidence.sourceRevision !== candidate.sourceRevision) {
      throw new Error('CANDIDATE_FEATURE_AST_SOURCE_EVIDENCE_IDENTITY_MISMATCH');
    }
    if (startByte < sourceEvidence.byteStart || endByte > sourceEvidence.byteEnd) {
      throw new Error('CANDIDATE_FEATURE_AST_SPAN_OUTSIDE_VERIFIED_SOURCE_EVIDENCE');
    }
  }
  const ontologyEvidence = (input.ontologyEvidence ?? []).map(verifyOntologyObservationTupleV1);
  for (const tuple of ontologyEvidence) {
    if (tuple.subjectCanonicalId !== candidate.canonicalId || tuple.subjectCanonicalId !== locator.canonicalId) {
      throw new Error('CANDIDATE_FEATURE_ONTOLOGY_SUBJECT_MISMATCH');
    }
    if (tuple.sourceRef !== candidate.sourceRef || tuple.sourceRef !== locator.sourceRef) {
      throw new Error('CANDIDATE_FEATURE_ONTOLOGY_SOURCE_REF_MISMATCH');
    }
    if (tuple.workspaceRevision !== candidate.workspaceRevision || tuple.workspaceRevision !== locator.workspaceRevision) {
      throw new Error('CANDIDATE_FEATURE_ONTOLOGY_WORKSPACE_REVISION_MISMATCH');
    }
    if (tuple.sourceRevision !== candidate.sourceRevision || tuple.sourceRevision !== locator.sourceRevision) {
      throw new Error('CANDIDATE_FEATURE_ONTOLOGY_SOURCE_REVISION_MISMATCH');
    }
  }
  if (candidate.graphRevision === null) throw new Error('CANDIDATE_FEATURE_GRAPH_REVISION_REQUIRED');
  if (candidate.semanticRevision === null) throw new Error('CANDIDATE_FEATURE_SEMANTIC_REVISION_REQUIRED');
  assertRepresentationBindingSet(candidate.representationBindings);
  if (candidate.laneMask.includes('semantic') || candidate.semanticRelevance !== null) {
    const semanticEvidence = input.semanticEvidence;
    if (!semanticEvidence) throw new Error('CANDIDATE_FEATURE_SEMANTIC_EVIDENCE_REQUIRED');
    if (semanticEvidence.packetKey !== candidate.packetKey || semanticEvidence.packetKey !== locator.packetKey) {
      throw new Error('CANDIDATE_FEATURE_SEMANTIC_PACKET_KEY_MISMATCH');
    }
    if (semanticEvidence.canonicalId !== candidate.canonicalId || semanticEvidence.sourceRef !== candidate.sourceRef || semanticEvidence.sourceRef !== locator.sourceRef) {
      throw new Error('CANDIDATE_FEATURE_SEMANTIC_IDENTITY_MISMATCH');
    }
    if (semanticEvidence.workspaceRevision !== candidate.workspaceRevision || semanticEvidence.workspaceRevision !== locator.workspaceRevision) {
      throw new Error('CANDIDATE_FEATURE_SEMANTIC_WORKSPACE_REVISION_MISMATCH');
    }
    if (semanticEvidence.sourceRevision !== candidate.sourceRevision || semanticEvidence.sourceRevision !== locator.sourceRevision) {
      throw new Error('CANDIDATE_FEATURE_SEMANTIC_SOURCE_REVISION_MISMATCH');
    }
    if (semanticEvidence.queryRecipe.representationRevision !== candidate.semanticRevision) {
      throw new Error('CANDIDATE_FEATURE_SEMANTIC_REVISION_MISMATCH');
    }
    assertSemanticRecipeCompatibilityV1({ query: semanticEvidence.queryRecipe, document: semanticEvidence.documentRecipe });
    const semantic768 = candidate.representationBindings.find((binding) => binding.representationId === 'semantic_768');
    if (!semantic768?.available) throw new Error('CANDIDATE_FEATURE_SEMANTIC_768_BINDING_REQUIRED');
    if (semantic768.modelRevision !== semanticEvidence.documentRecipe.modelArtifactRevision) {
      throw new Error('CANDIDATE_FEATURE_SEMANTIC_MODEL_REVISION_MISMATCH');
    }
  }
  if (candidate.crossEncoderAvailable && candidate.crossEncoderCalibratedScore === null) {
    throw new Error('CANDIDATE_FEATURE_CALIBRATED_CROSS_ENCODER_REQUIRED');
  }

  // Enforce promoted and revision-qualified PageRank authority join invariants
  if (!pagerank) {
    throw new Error('CANDIDATE_FEATURE_PAGERANK_REQUIRED');
  }
  if (!pagerank.graphRevision?.trim()) {
    throw new Error('PAGERANK_GRAPH_REVISION_REQUIRED');
  }
  if (pagerank.graphRevision !== candidate.graphRevision) {
    throw new Error(`PAGERANK_GRAPH_REVISION_MISMATCH:${pagerank.graphRevision}:${candidate.graphRevision}`);
  }
  if (pagerank.didConverge === false) {
    throw new Error('PAGERANK_RUN_DID_NOT_CONVERGE');
  }
  if (pagerank.didConverge !== true) {
    throw new Error('PAGERANK_CONVERGENCE_UNVERIFIED');
  }
  if (requirePromoted) {
    if (pagerank.status !== 'promoted') {
      throw new Error(`UNPROMOTED_PAGERANK_DATA_REJECTED:${pagerank.status}`);
    }
  }

  // Resolve score via pickPageRankAuthorityScore (fails closed with PAGERANK_L1_CORRUPT_FAIL_CLOSED if corrupt)
  const resolvedPageRank = pickPageRankAuthorityScore(pagerank);
  if (resolvedPageRank === null) {
    throw new Error('PAGERANK_SCORE_MISSING_FAIL_CLOSED');
  }

  return buildFeatureRowV1({
    locator,
    featureRevision: candidate.featureRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    dense: candidate.semanticRelevance ?? 0,
    sparse: candidate.lexicalRelevance ?? 0,
    rrf: input.rrf,
    ast: candidate.astAffinity ?? 0,
    pagerank,
    pprAffinity: candidate.personalizedPageRank,
    domainAffinity: candidate.domainAffinity ?? 0,
    freshness: input.freshness,
    crossEncoder: candidate.crossEncoderAvailable ? candidate.crossEncoderCalibratedScore : null,
    executionUtility: candidate.executionUtility ?? 0,
    evidenceRefs: [...new Set([...candidate.evidenceRefs, ...ontologyEvidence.flatMap((tuple) => tuple.evidenceRefs)])].sort(),
  });
}
