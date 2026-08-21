import type {
  CheckpointCommitPayloadV1,
  RecommendationSignalPayloadV1,
} from '$lib/server/queue/event-fabric.js';
import type { KanbanCandidateV1 } from './kanban-candidate-scoring.js';

export interface DailyFeatureArtifactV1 {
  artifactId: string;
  analyticsMerkleRoot: string;
  featureRevision: string;
  sourceRevisionSetHash?: string;
  graphRevision?: string;
  rowCount: number;
  artifactRef: string;
  artifactHash: string;
}

export interface ParentAtlasDailyReceiptV1 {
  schemaVersion: 'atlas.parent-atlas-daily-receipt.v1';
  runId: string;
  createdAt: string;
  analyticsCheckpointId: string;
  analyticsMerkleRoot: string;
  featureArtifactRef: string;
  featureArtifactHash: string;
  featureRevision: string;
  recommendationCount: number;
  kanbanCandidateCount: number;
  sourceRevisionSetHash?: string;
  graphRevision?: string;
  status: 'PROVEN' | 'BLOCKED_BY_RUNTIME_DEPENDENCY' | 'FAILED';
  evidenceRefs: string[];
}

export interface DailyCompilerPorts {
  compileGpuFeatures(
    checkpoint: CheckpointCommitPayloadV1,
  ): Promise<DailyFeatureArtifactV1>;

  deriveRecommendations(
    features: DailyFeatureArtifactV1,
  ): Promise<readonly RecommendationSignalPayloadV1[]>;

  buildKanbanCandidates(
    features: DailyFeatureArtifactV1,
    recommendations: readonly RecommendationSignalPayloadV1[],
  ): Promise<readonly KanbanCandidateV1[]>;

  persistDailyReceipt(receipt: ParentAtlasDailyReceiptV1): Promise<void>;
}

export async function runParentAtlasDailyCompiler(
  runId: string,
  checkpoint: CheckpointCommitPayloadV1,
  ports: DailyCompilerPorts,
): Promise<ParentAtlasDailyReceiptV1> {
  const features = await ports.compileGpuFeatures(checkpoint);

  if (features.analyticsMerkleRoot !== checkpoint.merkleRoot) {
    throw new Error(
      'Feature artifact does not declare the exact analytics Merkle root it consumed',
    );
  }

  const recommendations = await ports.deriveRecommendations(features);
  const kanban = await ports.buildKanbanCandidates(features, recommendations);

  const receipt: ParentAtlasDailyReceiptV1 = {
    schemaVersion: 'atlas.parent-atlas-daily-receipt.v1',
    runId,
    createdAt: new Date().toISOString(),
    analyticsCheckpointId: checkpoint.checkpointId,
    analyticsMerkleRoot: checkpoint.merkleRoot,
    featureArtifactRef: features.artifactRef,
    featureArtifactHash: features.artifactHash,
    featureRevision: features.featureRevision,
    recommendationCount: recommendations.length,
    kanbanCandidateCount: kanban.length,
    sourceRevisionSetHash: features.sourceRevisionSetHash,
    graphRevision: features.graphRevision,
    status: 'PROVEN',
    evidenceRefs: [features.artifactRef],
  };

  await ports.persistDailyReceipt(receipt);
  return receipt;
}