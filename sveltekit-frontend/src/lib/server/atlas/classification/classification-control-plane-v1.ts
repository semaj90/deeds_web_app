import type { CandidateProjectionInput } from '$lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import { classifyEmbeddingGemmaMrlV1, type PrototypeLabel, type MrlClassifierPolicyV1 } from './embeddinggemma-mrl-classifier-v1.js';
import { classifyStructuralCodeRoleV1, type StructuralCodeRoleSignalsV1 } from './structural-code-role-classifier-v1.js';
import { compileClassificationCandidateFeaturesV1 } from './classification-candidate-feature-compiler-v1.js';
import { classificationObservationsToHmmV1 } from './classification-hmm-bridge-v1.js';
import { escalateAmbiguousCandidatesV1, type CrossEncoderEscalationCandidateV1 } from './cross-encoder-escalation-v1.js';
import type { ClassificationObservationV1, ClassificationTaskV1 } from './classification-observation-v1.js';
import type { RecommendationEvidenceBundleV1 } from '../recommendations/recommendation-evidence-bundle-v1.js';

export interface ClassificationControlPlaneCandidateV1 {
  candidate: CandidateProjectionInput;
  document: string;
  structural?: StructuralCodeRoleSignalsV1;
  classifications?: readonly ClassificationObservationV1[];
}

export interface ClassificationControlPlaneResultV1 {
  schema: 'atlas.classification-control-plane.v1';
  queryClassification: ClassificationObservationV1 | null;
  candidates: Array<{
    packetKey: string;
    featurePatch: ReturnType<typeof compileClassificationCandidateFeaturesV1>;
    projectedCandidate: CandidateProjectionInput;
    classifications: ClassificationObservationV1[];
  }>;
  hmm: ReturnType<typeof classificationObservationsToHmmV1>;
  rerank: Awaited<ReturnType<typeof escalateAmbiguousCandidatesV1>>;
  canonicalWritesAllowed: false;
  retrievalVoteAdded: false;
  recommendationEvidence: RecommendationEvidenceBundleV1 | null;
}

export async function runClassificationControlPlaneV1(input: {
  requestId: string;
  workspaceRevision: string;
  query: string;
  queryVector768?: readonly number[] | Float32Array;
  queryTask?: ClassificationTaskV1;
  queryPrototypes?: readonly PrototypeLabel[];
  queryPolicy?: MrlClassifierPolicyV1;
  candidates: readonly ClassificationControlPlaneCandidateV1[];
  maxCrossEncoderCandidates?: number;
  recommendationEvidence?: RecommendationEvidenceBundleV1;
}): Promise<ClassificationControlPlaneResultV1> {
  const queryClassification = input.queryVector768 && input.queryPrototypes?.length
    ? classifyEmbeddingGemmaMrlV1({
        requestId: input.requestId,
        workspaceRevision: input.workspaceRevision,
        task: input.queryTask ?? 'query_intent',
        queryVector768: input.queryVector768,
        prototypes: input.queryPrototypes,
        policy: input.queryPolicy,
        evidenceRefs: [`query:${input.requestId}`],
      }).observation
    : null;

  const compiled = input.candidates.map((row) => {
    const classifications: ClassificationObservationV1[] = [...(row.classifications ?? [])];
    if (row.structural) classifications.push(classifyStructuralCodeRoleV1(row.structural));
    if (queryClassification) classifications.push(queryClassification);
    const featurePatch = compileClassificationCandidateFeaturesV1(classifications);
    return {
      packetKey: row.candidate.packet_key,
      featurePatch,
      classifications,
      projectedCandidate: {
        ...row.candidate,
        domain_fit_query: featurePatch.domain_fit_query ?? row.candidate.domain_fit_query,
        process_fit: featurePatch.process_fit ?? row.candidate.process_fit,
        feature_label_confidence: featurePatch.feature_label_confidence ?? row.candidate.feature_label_confidence,
      },
      document: row.document,
    };
  });

  const hmm = classificationObservationsToHmmV1({
    sequenceId: `classification:${input.requestId}`,
    classifications: [
      ...(queryClassification ? [queryClassification] : []),
      ...compiled.flatMap((row) => row.classifications.filter((obs) => obs.task !== 'query_intent')),
    ],
  });

  const rerankCandidates: CrossEncoderEscalationCandidateV1[] = compiled.map((row) => ({
    id: row.packetKey,
    document: row.document,
    baseScore: row.projectedCandidate.semantic_similarity_768 ?? 0,
    classifierObservations: row.classifications,
  }));
  const rerank = await escalateAmbiguousCandidatesV1({
    query: input.query,
    candidates: rerankCandidates,
    maxEscalationCandidates: input.maxCrossEncoderCandidates ?? 25,
  });

  return {
    schema: 'atlas.classification-control-plane.v1',
    queryClassification,
    candidates: compiled.map(({ document: _document, ...row }) => row),
    hmm,
    rerank,
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
    recommendationEvidence: input.recommendationEvidence ?? null,
  };
}
