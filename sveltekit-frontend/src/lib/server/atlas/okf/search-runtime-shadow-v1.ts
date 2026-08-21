import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CandidateProjectionInput } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';
import {
  compileDerivedFeatureMatrixV1,
  OkfEvidenceRefV1Schema,
  OkfRevisionSetV1Schema,
  type DerivedFeatureMatrixV1,
  type OkfEvidenceRefV1,
  type RetrievalFeatureRowV1,
} from './okf-evidence-feature-v1.js';
import { compileRetrievalFeatureRowV1 } from './retrieval-feature-row-compiler-v1.js';
import {
  AtlasPairJudgmentV1Schema,
  type AtlasPairJudgmentV1,
} from './atlas-learning-recommendation-v1.js';

export const SEARCH_RUNTIME_SHADOW_SCHEMA = 'atlas.search-runtime-shadow.v1' as const;
export const SEARCH_RUNTIME_SHADOW_COMPILER_REVISION = 'atlas.search-runtime-shadow-compiler.v1' as const;
export const SEARCH_RUNTIME_SHADOW_LABEL_REVISION = 'atlas.pair-label.shadow-unlabeled.v1' as const;

const LogicalLaneSchema = z.enum(['dense', 'lexical', 'exact', 'ast', 'schema', 'rg', 'bm42']);

export const SearchRuntimeLaneEvidenceV1Schema = z.object({
  lane: LogicalLaneSchema,
  bestRank: z.number().int().positive(),
  bestScore: z.number().finite(),
  supportingHitCount: z.number().int().nonnegative().default(1),
  evidenceRef: z.string().min(1),
}).strict();

export const SearchRuntimeShadowCandidateV1Schema = z.object({
  candidateCanonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1).nullable(),
  identityStatus: z.enum(['canonical', 'degraded']),
  initialRank: z.number().int().positive(),
  scoreSource: z.string().min(1),
  rawScore: z.number().finite().nullable(),
  fusionScore: z.number().finite(),
  blendedScore: z.number().finite().nullable(),
  pageRankScore: z.number().finite().nullable(),
  laneEvidence: z.array(SearchRuntimeLaneEvidenceV1Schema).default([]),
  evidenceRefs: z.array(OkfEvidenceRefV1Schema).min(1),
}).strict();
export type SearchRuntimeShadowCandidateV1 = z.infer<typeof SearchRuntimeShadowCandidateV1Schema>;

export const SearchRuntimeShadowCaptureV1Schema = z.object({
  schema: z.literal(SEARCH_RUNTIME_SHADOW_SCHEMA),
  queryId: z.string().min(1),
  queryRevision: z.string().min(1),
  queryTextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  revisions: OkfRevisionSetV1Schema,
  candidates: z.array(SearchRuntimeShadowCandidateV1Schema),
  producerId: z.literal('SearchRuntime'),
  producerRevision: z.string().min(1),
  rankingMutationAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type SearchRuntimeShadowCaptureV1 = z.infer<typeof SearchRuntimeShadowCaptureV1Schema>;

export interface SearchRuntimeShadowRejectV1 {
  packetKey: string;
  candidateCanonicalId: string;
  reasonCode: 'DEGRADED_IDENTITY' | 'REPRESENTATION_REVISION_MISMATCH';
}

export interface SearchRuntimeShadowCompilationV1 {
  schema: 'atlas.search-runtime-shadow-compilation.v1';
  compilerRevision: typeof SEARCH_RUNTIME_SHADOW_COMPILER_REVISION;
  queryId: string;
  queryRevision: string;
  acceptedRows: RetrievalFeatureRowV1[];
  rejectedCandidates: SearchRuntimeShadowRejectV1[];
  matrix: DerivedFeatureMatrixV1;
  pairJudgmentSeeds: AtlasPairJudgmentV1[];
  captureSha256: string;
  rankingMutationAllowed: false;
  trainingPromotionAllowed: false;
  canonicalWritesAllowed: false;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (ArrayBuffer.isView(value)) return canonicalJson(Array.from(value as unknown as ArrayLike<number>));
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function bestLane(candidate: SearchRuntimeShadowCandidateV1, lanes: readonly string[]): SearchRuntimeShadowCandidateV1['laneEvidence'][number] | null {
  return candidate.laneEvidence
    .filter((entry) => lanes.includes(entry.lane))
    .sort((a, b) => b.bestScore - a.bestScore || a.bestRank - b.bestRank || a.evidenceRef.localeCompare(b.evidenceRef))[0] ?? null;
}

function featureEvidenceRef(candidate: SearchRuntimeShadowCandidateV1, featureName: string, sourceRef: string): OkfEvidenceRefV1 {
  return {
    evidenceRef: sourceRef,
    evidenceKind: 'EXECUTION',
    producerId: 'SearchRuntime',
    producerRevision: SEARCH_RUNTIME_SHADOW_COMPILER_REVISION,
  };
}

function buildProjectionAndEvidence(input: SearchRuntimeShadowCaptureV1, candidate: SearchRuntimeShadowCandidateV1): {
  projection: CandidateProjectionInput;
  featureEvidenceRefs: Record<string, OkfEvidenceRefV1[]>;
  pairSignals: {
    semanticScore: number | null;
    lexicalScore: number | null;
    astScore: number | null;
    graphScore: number | null;
  };
} {
  const projection: CandidateProjectionInput = { packet_key: candidate.packetKey };
  const featureEvidenceRefs: Record<string, OkfEvidenceRefV1[]> = {};

  const dense = bestLane(candidate, ['dense']);
  if (dense) {
    projection.semantic_similarity_768 = dense.bestScore;
    featureEvidenceRefs.semantic_similarity_768 = [featureEvidenceRef(candidate, 'semantic_similarity_768', dense.evidenceRef)];
  }

  const lexical = bestLane(candidate, ['lexical', 'bm42', 'rg']);
  if (lexical) {
    projection.lexical_score = lexical.bestScore;
    featureEvidenceRefs.lexical_score = [featureEvidenceRef(candidate, 'lexical_score', lexical.evidenceRef)];
  }

  const exact = bestLane(candidate, ['exact']);
  if (exact) {
    projection.exact_symbol_match = 1;
    featureEvidenceRefs.exact_symbol_match = [featureEvidenceRef(candidate, 'exact_symbol_match', exact.evidenceRef)];
  }

  const ast = bestLane(candidate, ['ast']);
  if (ast) {
    projection.ast_signal = ast.bestScore;
    featureEvidenceRefs.ast_signal = [featureEvidenceRef(candidate, 'ast_signal', ast.evidenceRef)];
  }

  if (input.sourceRevision && candidate.sourceRevision) {
    projection.source_revision_match = input.sourceRevision === candidate.sourceRevision ? 1 : 0;
    featureEvidenceRefs.source_revision_match = [featureEvidenceRef(
      candidate,
      'source_revision_match',
      `search-runtime:${input.queryId}:${candidate.packetKey}:source-revision-compare`,
    )];
  }

  if (candidate.representationRevision) {
    projection.representation_revision_match = input.representationRevision === candidate.representationRevision ? 1 : 0;
    featureEvidenceRefs.representation_revision_match = [featureEvidenceRef(
      candidate,
      'representation_revision_match',
      `search-runtime:${input.queryId}:${candidate.packetKey}:representation-revision-compare`,
    )];
  }

  // pageRankScore is intentionally not copied into authority_norm. They are not
  // proven to be the same normalized feature and SearchRuntime itself warns
  // against double-counting graph/PageRank authority signals.

  return {
    projection,
    featureEvidenceRefs,
    pairSignals: {
      semanticScore: dense?.bestScore ?? null,
      lexicalScore: lexical?.bestScore ?? null,
      astScore: ast?.bestScore ?? null,
      graphScore: null,
    },
  };
}

export function compileSearchRuntimeShadowV1(raw: SearchRuntimeShadowCaptureV1): SearchRuntimeShadowCompilationV1 {
  const input = SearchRuntimeShadowCaptureV1Schema.parse(raw);
  const captureSha256 = sha256Text(canonicalJson(input));
  const rejectedCandidates: SearchRuntimeShadowRejectV1[] = [];
  const accepted: Array<{
    candidate: SearchRuntimeShadowCandidateV1;
    row: RetrievalFeatureRowV1;
    pairSignals: ReturnType<typeof buildProjectionAndEvidence>['pairSignals'];
  }> = [];

  for (const candidate of [...input.candidates].sort((a, b) => a.initialRank - b.initialRank || a.packetKey.localeCompare(b.packetKey))) {
    if (candidate.identityStatus !== 'canonical') {
      rejectedCandidates.push({
        packetKey: candidate.packetKey,
        candidateCanonicalId: candidate.candidateCanonicalId,
        reasonCode: 'DEGRADED_IDENTITY',
      });
      continue;
    }
    if (candidate.representationRevision && candidate.representationRevision !== input.representationRevision) {
      rejectedCandidates.push({
        packetKey: candidate.packetKey,
        candidateCanonicalId: candidate.candidateCanonicalId,
        reasonCode: 'REPRESENTATION_REVISION_MISMATCH',
      });
      continue;
    }

    const derived = buildProjectionAndEvidence(input, candidate);
    const absenceEvidenceRef: OkfEvidenceRefV1 = {
      evidenceRef: `search-runtime:${input.queryId}:${candidate.packetKey}:feature-unavailable`,
      evidenceKind: 'EXECUTION',
      producerId: 'SearchRuntime',
      producerRevision: SEARCH_RUNTIME_SHADOW_COMPILER_REVISION,
    };
    const row = compileRetrievalFeatureRowV1({
      queryId: input.queryId,
      candidateCanonicalId: candidate.candidateCanonicalId,
      candidate: derived.projection,
      rowOrdinal: accepted.length,
      workspaceRevision: input.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      representationRevision: input.representationRevision,
      featureRevision: input.featureRevision,
      revisions: input.revisions,
      featureEvidenceRefs: derived.featureEvidenceRefs,
      absenceEvidenceRef,
    });
    accepted.push({ candidate, row, pairSignals: derived.pairSignals });
  }

  const matrix = compileDerivedFeatureMatrixV1({
    queryId: input.queryId,
    rows: accepted.map((entry) => entry.row),
  });

  const pairJudgmentSeeds = accepted.map(({ candidate, pairSignals }, index) => AtlasPairJudgmentV1Schema.parse({
    schema: 'atlas.pair-judgment.v1',
    queryId: input.queryId,
    queryRevision: input.queryRevision,
    candidateCanonicalId: candidate.candidateCanonicalId,
    candidatePacketKey: candidate.packetKey,
    candidateSourceRef: candidate.sourceRef,
    candidateSourceRevision: candidate.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    featureRevision: input.featureRevision,
    revisions: input.revisions,
    evidenceRefs: candidate.evidenceRefs,
    retrieval: {
      initialRank: candidate.initialRank,
      semanticScore: pairSignals.semanticScore,
      lexicalScore: pairSignals.lexicalScore,
      astScore: pairSignals.astScore,
      graphScore: pairSignals.graphScore,
      domainScore: null,
      featureMatrixSha256: matrix.matrixSha256,
    },
    teacher: null,
    exactPromotion: { attempted: false, passed: null, receiptRef: null },
    executionOutcome: {
      attempted: false,
      success: null,
      testPassed: null,
      repairSucceeded: null,
      receiptRefs: [],
    },
    humanRelevanceGrade: null,
    labelRevision: SEARCH_RUNTIME_SHADOW_LABEL_REVISION,
    trainingEligible: false,
    trainingBlockReasons: [
      'TEACHER_SCORE_MISSING',
      'EXACT_PROMOTION_OUTCOME_MISSING',
      'EXECUTION_OUTCOME_MISSING',
    ],
    canonicalWritesAllowed: false,
  }));

  return {
    schema: 'atlas.search-runtime-shadow-compilation.v1',
    compilerRevision: SEARCH_RUNTIME_SHADOW_COMPILER_REVISION,
    queryId: input.queryId,
    queryRevision: input.queryRevision,
    acceptedRows: accepted.map((entry) => entry.row),
    rejectedCandidates,
    matrix,
    pairJudgmentSeeds,
    captureSha256,
    rankingMutationAllowed: false,
    trainingPromotionAllowed: false,
    canonicalWritesAllowed: false,
  };
}

export function sha256QueryText(query: string): string {
  return sha256Text(query);
}
