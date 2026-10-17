import { z } from 'zod';
import {
  verifyCandidateFeatureSelectionSnapshotV1,
  type CandidateFeatureSelectionSnapshotV1,
} from '../features/candidate-feature-selection-snapshot-v1.js';
import type { CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import type { CandidateOrdinalSelectionV1 } from '../features/candidate-ordinal-selection-v1.js';
import {
  recommendHelpersV1,
  LowRankHelperArtifactV1Schema,
  type LowRankHelperArtifactV1,
} from './low-rank-helper-recommender-v1.js';
import {
  rankContextualCandidatesV1,
  type ContextualRankerWeights,
} from './contextual-ranker-v1.js';
import type { RecommendationBatchV1, RecommendationProposalKind } from './recommendation-contract-v1.js';

export const RecommendationHelperCandidateBindingV1Schema = z.object({
  schema: z.literal('atlas.recommendation.helper-candidate-binding.v1'),
  catalogRevision: z.string().min(1),
  helperId: z.string().min(1),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  workspaceRevision: z.string().min(1),
  semanticRevision: z.string().min(1),
  kind: z.enum(['helper', 'tool', 'module', 'next_step']),
  action: z.string().min(1),
  rationale: z.string().min(1),
  requiresApproval: z.boolean(),
}).strict();

export type RecommendationHelperCandidateBindingV1 = z.infer<
  typeof RecommendationHelperCandidateBindingV1Schema
>;

export interface RecommendationCompositionResultV1 {
  status: 'ADVISORY' | 'ABSTAINED';
  batch: RecommendationBatchV1;
  rejectedBindings: Array<{ helperId: string; reason: string }>;
  featureSelectionChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
}

function normalizeRelativeScores(scores: readonly number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 0.5);
  return scores.map((score) => (score - min) / (max - min));
}

function candidateBindingMismatch(
  binding: RecommendationHelperCandidateBindingV1,
  row: CandidateFeatureSelectionSnapshotV1['rows'][number],
  expectedCatalogRevision: string,
): string | null {
  if (binding.catalogRevision !== expectedCatalogRevision) return 'HELPER_CATALOG_REVISION_MISMATCH';
  if (row.degradedIdentity) return 'CANDIDATE_IDENTITY_DEGRADED';
  if (!row.packetKey || row.packetKey !== binding.packetKey) return 'PACKET_KEY_MISMATCH';
  if (row.canonicalId !== binding.canonicalId) return 'CANONICAL_ID_MISMATCH';
  if (row.sourceRef !== binding.sourceRef) return 'SOURCE_REF_MISMATCH';
  if (row.sourceRevision !== binding.sourceRevision) return 'SOURCE_REVISION_MISMATCH';
  if (row.workspaceRevision !== binding.workspaceRevision) return 'WORKSPACE_REVISION_MISMATCH';
  if (!row.semanticRevision || row.semanticRevision !== binding.semanticRevision) return 'SEMANTIC_REVISION_MISMATCH';
  if (!row.laneMask.includes('semantic') || row.semanticRelevance === null) return 'SEMANTIC_FEATURE_MISSING';
  if (row.evidenceRefs.length === 0) return 'EVIDENCE_REFS_MISSING';
  return null;
}

export function composeContextualRecommendationsV1(input: {
  requestId: string;
  queryIntent: string;
  taskFamily: string;
  helperCatalogRevision: string;
  bindings: readonly RecommendationHelperCandidateBindingV1[];
  artifact: LowRankHelperArtifactV1;
  ordinalMap: CandidateOrdinalMapV1;
  selection: CandidateOrdinalSelectionV1;
  featureSelection: CandidateFeatureSelectionSnapshotV1;
  contextManifestChecksum: string;
  weights?: Partial<ContextualRankerWeights>;
  maxProposals?: number;
}): RecommendationCompositionResultV1 {
  if (input.requestId !== input.selection.requestId || input.requestId !== input.featureSelection.requestId) {
    throw new Error('RECOMMENDATION_REQUEST_ID_MISMATCH');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(input.featureSelection.workspaceRevision)) {
    throw new Error('RECOMMENDATION_WORKSPACE_REVISION_UNQUALIFIED');
  }
  if (!/^[0-9a-f]{64}$/.test(input.contextManifestChecksum)) {
    throw new Error('RECOMMENDATION_CONTEXT_MANIFEST_CHECKSUM_INVALID');
  }

  verifyCandidateFeatureSelectionSnapshotV1({
    ordinalMap: input.ordinalMap,
    selection: input.selection,
    snapshot: input.featureSelection,
  });

  const artifact = LowRankHelperArtifactV1Schema.parse(input.artifact);
  const bindings = input.bindings.map((binding) => RecommendationHelperCandidateBindingV1Schema.parse(binding));
  const helperIds = bindings.map((binding) => binding.helperId);
  if (new Set(helperIds).size !== helperIds.length) throw new Error('RECOMMENDATION_DUPLICATE_HELPER_BINDING');

  const rowsByCanonicalId = new Map(input.featureSelection.rows.map((row) => [row.canonicalId, row]));
  const acceptedBindings: RecommendationHelperCandidateBindingV1[] = [];
  const rejectedBindings: Array<{ helperId: string; reason: string }> = [];

  for (const binding of bindings) {
    const row = rowsByCanonicalId.get(binding.canonicalId);
    if (!row) {
      rejectedBindings.push({ helperId: binding.helperId, reason: 'CANDIDATE_NOT_IN_SELECTED_FEATURE_SNAPSHOT' });
      continue;
    }
    const mismatch = candidateBindingMismatch(binding, row, input.helperCatalogRevision);
    if (mismatch) {
      rejectedBindings.push({ helperId: binding.helperId, reason: mismatch });
      continue;
    }
    acceptedBindings.push(binding);
  }

  const lowRank = recommendHelpersV1({
    artifact,
    taskFamily: input.taskFamily,
    allowedHelpers: acceptedBindings.map((binding) => binding.helperId),
    maxHelpers: Math.max(1, acceptedBindings.length),
  });
  const normalized = normalizeRelativeScores(lowRank.map((recommendation) => recommendation.score));
  const bindingByHelperId = new Map(acceptedBindings.map((binding) => [binding.helperId, binding]));
  const contextualCandidates = lowRank.flatMap((recommendation, index) => {
    const binding = bindingByHelperId.get(recommendation.helperId);
    if (!binding) return [];
    const candidate = rowsByCanonicalId.get(binding.canonicalId);
    if (!candidate) return [];
    return [{
      candidate,
      kind: binding.kind as RecommendationProposalKind,
      action: binding.action,
      rationale: binding.rationale,
      lowRankScore: normalized[index] ?? 0,
      factorArtifactId: artifact.artifactRevision,
      requiresApproval: binding.requiresApproval,
    }];
  });

  const batch = rankContextualCandidatesV1({
    requestId: input.requestId,
    queryIntent: input.queryIntent,
    candidates: contextualCandidates,
    weights: input.weights,
    maxProposals: input.maxProposals,
    contextManifestChecksum: input.contextManifestChecksum,
    rankerRevision: `contextual-ranker-v1+${artifact.artifactRevision}`,
  });

  return {
    status: batch.proposals.length > 0 ? 'ADVISORY' : 'ABSTAINED',
    batch,
    rejectedBindings,
    featureSelectionChecksum: input.featureSelection.snapshotChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
