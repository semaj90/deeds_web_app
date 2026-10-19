import {
  buildAtlasRankInputV1,
  scoreAtlasRankInputWithFeaturesGemm,
  type AtlasRankInputV1,
  type AtlasRankScoringReceiptV1,
  type ValidateRankInputOptions,
} from './atlas-rank-input-adapter-v1.js';
import {
  buildTopKExecutionV1,
  toAlgorithmExecutionReceiptRowV1,
  verifyTopKExecutionReceiptV1,
  type AlgorithmExecutionReceiptRowV1,
  type TopKExecutionV1,
  type TopKVerificationV1,
} from './topk-execution-receipt-v1.js';
import {
  admitTopKEvidenceToContextManifestV1,
  resolveTopKEvidenceV1,
  type GraphifyLifecycleV1,
  type QualifiedEvidenceV1,
  type RejectedEvidenceV1,
  type SourceFetchPortV1,
  type TopKContextAdmissionV1,
} from './topk-evidence-fetch-v1.js';
import type { CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import { CANDIDATE_SCALAR_FEATURES, type CandidateFeatureColumnarV1 } from '../features/candidate-feature-columnar-v1.js';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import { TILE_CHANNEL_CANONICAL_INDEX } from './atlas-feature-matrix-4x6-v1.js';

export interface SearchRuntimeTopKCallerInputV1 {
  requestId: string;
  queryDigest?: string;
  graphRevision?: string;
  taxonomyRevision?: string;
  featureSchemaRevision?: string;
  evidenceRevision?: string;
  producerRevision?: string;
  tokenBudget?: number;
  retrievalPolicyRevision?: string;
  acePlaybookRevision?: string;
  representationRevision?: string | null;
  ordinalMap: CandidateOrdinalMapV1;
  columnar: CandidateFeatureColumnarV1;
  snapshot: CandidateFeatureSnapshotV1;
  candidateOrdinals?: readonly number[];
  weights?: readonly number[];
  bias?: number;
  k?: number;
  sourceFetchPort: SourceFetchPortV1;
  graphifyLifecycle?: GraphifyLifecycleV1;
}

export interface SearchRuntimeTopKExecutionResultV1 {
  schema: 'atlas.search-runtime-topk-execution-result.v1';
  execution: TopKExecutionV1;
  verification: TopKVerificationV1;
  evidence: {
    qualified: readonly QualifiedEvidenceV1[];
    rejected: readonly RejectedEvidenceV1[];
  };
  contextManifestAdmission: TopKContextAdmissionV1;
  receiptRow: AlgorithmExecutionReceiptRowV1;
  status: 'QUALIFIED_ADMITTED' | 'BLOCKED_EVIDENCE_UNQUALIFIED' | 'BLOCKED_VERIFICATION_FAILED';
  writesPerformed: false;
  canonicalAuthority: false;
}

const DEFAULT_WEIGHTS = [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625];

/**
 * Real SearchRuntime Top-K Execution Caller (DOC-ANALYSIS-TABLES-02).
 *
 * Connects SearchRuntime candidates through the canonical 4-candidate tile/GEMM/Top-K path:
 * 1. Adapts candidates into AtlasRankInputV1.
 * 2. Scores candidates via scoreAtlasRankInputWithFeaturesGemm.
 * 3. Runs CPU exact Top-K and builds TopKExecutionV1.
 * 4. Replays independent verification via verifyTopKExecutionReceiptV1.
 * 5. Resolves exact UTF-8 source byte spans through SourceFetchPortV1.
 * 6. Evaluates ContextManifest admission via admitTopKEvidenceToContextManifestV1.
 * 7. Prepares AlgorithmExecutionReceiptRowV1 for persistence without performing direct DB writes.
 */
export function executeSearchRuntimeTopKV1(
  params: SearchRuntimeTopKCallerInputV1,
): SearchRuntimeTopKExecutionResultV1 {
  const k = params.k ?? 10;
  const graphifyLifecycle = params.graphifyLifecycle ?? 'COMPLETED';
  const queryDigest = params.queryDigest ?? 'query:search-runtime:v1';
  const graphRevision = params.graphRevision ?? 'graph:search-runtime:v1';
  const taxonomyRevision = params.taxonomyRevision ?? 'taxonomy:search-runtime:v1';
  const featureSchemaRevision = params.featureSchemaRevision ?? 'schema:search-runtime:v1';
  const evidenceRevision = params.evidenceRevision ?? 'evidence:search-runtime:v1';
  const producerRevision = params.producerRevision ?? 'sr-topk:v1';
  const tokenBudget = params.tokenBudget ?? 4000;
  const retrievalPolicyRevision = params.retrievalPolicyRevision ?? 'policy:retrieval:v1';
  const acePlaybookRevision = params.acePlaybookRevision ?? 'playbook:ace:v1';
  const representationRevision = params.representationRevision ?? params.columnar.featureRevision;

  const ordinals = params.candidateOrdinals ?? params.ordinalMap.candidates.map((c) => c.candidateOrdinal);

  // 1. Adapt candidates into rank input
  const input: AtlasRankInputV1 = buildAtlasRankInputV1({
    queryDigest,
    graphRevision,
    ordinalMap: params.ordinalMap,
    columnar: params.columnar,
    candidateOrdinals: ordinals,
    taxonomyRevision,
    featureSchemaRevision,
    evidenceRevision,
  });

  // Construct canonical linear scoring head
  const headWeightsArray = new Array<number>(CANDIDATE_SCALAR_FEATURES.length).fill(0);
  const activeWeights = params.weights ?? DEFAULT_WEIGHTS;
  TILE_CHANNEL_CANONICAL_INDEX.forEach((featureIdx, channelIdx) => {
    headWeightsArray[featureIdx] = activeWeights[channelIdx] ?? 0;
  });

  const head = {
    headId: `head:sr-topk:${producerRevision}`,
    featureRevision: params.columnar.featureRevision,
    featureCount: CANDIDATE_SCALAR_FEATURES.length,
    headCount: 1,
    weights: [headWeightsArray],
    bias: [params.bias ?? 0.1],
  };

  const validationOptions: ValidateRankInputOptions = {
    ordinalMap: params.ordinalMap,
    expectedWorkspaceRevision: params.ordinalMap.workspaceRevision,
    expectedGraphRevision: graphRevision,
    expectedOrdinalMapRevision: params.ordinalMap.ordinalMapChecksum,
    expectedTaxonomyRevision: taxonomyRevision,
    expectedFeatureSchemaRevision: featureSchemaRevision,
    expectedEvidenceRevision: evidenceRevision,
  };

  // 2. Score with canonical features GEMM
  const scored: AtlasRankScoringReceiptV1 = scoreAtlasRankInputWithFeaturesGemm({
    input,
    options: validationOptions,
    columnar: params.columnar,
    head,
    producerRevision,
    topK: k,
  });

  // 3. Build deterministic CPU exact Top-K execution receipt
  const execution: TopKExecutionV1 = buildTopKExecutionV1({
    requestId: params.requestId,
    input,
    scored,
    ordinalMap: params.ordinalMap,
    k,
  });

  // 4. Format receipt row
  const receiptRow: AlgorithmExecutionReceiptRowV1 = toAlgorithmExecutionReceiptRowV1(execution);

  // 5. Independently replay and verify execution from the receipt row
  const verification: TopKVerificationV1 = verifyTopKExecutionReceiptV1({
    row: receiptRow,
    ordinalMap: params.ordinalMap,
    columnar: params.columnar,
    head,
    options: validationOptions,
    producerRevision,
    queryDigest,
  });

  // 6. Fetch and qualify live source byte spans
  const { qualified, rejected } = resolveTopKEvidenceV1({
    ordinalMap: params.ordinalMap,
    selected: execution.selected,
    port: params.sourceFetchPort,
    maxItems: k,
  });

  // 7. Connect to ContextManifest admission
  const contextManifestAdmission: TopKContextAdmissionV1 = admitTopKEvidenceToContextManifestV1({
    execution,
    verification,
    snapshot: params.snapshot,
    qualified,
    requestId: params.requestId,
    tokenBudget,
    retrievalPolicyRevision,
    acePlaybookRevision,
    representationRevision,
    graphRevision,
    graphifyLifecycle,
  });

  let status: SearchRuntimeTopKExecutionResultV1['status'] = 'BLOCKED_EVIDENCE_UNQUALIFIED';
  if (verification.status !== 'VERIFIED_PASS') {
    status = 'BLOCKED_VERIFICATION_FAILED';
  } else if (contextManifestAdmission.status === 'ADMITTED') {
    status = 'QUALIFIED_ADMITTED';
  }

  return {
    schema: 'atlas.search-runtime-topk-execution-result.v1',
    execution,
    verification,
    evidence: {
      qualified,
      rejected,
    },
    contextManifestAdmission,
    receiptRow,
    status,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}
