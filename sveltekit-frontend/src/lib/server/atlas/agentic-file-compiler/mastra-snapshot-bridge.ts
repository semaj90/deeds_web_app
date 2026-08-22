import { sha256Stable } from './contracts.js';

export interface MastraSnapshotRefV1 { schema: 'atlas.mastra-snapshot-ref.v1'; workflowId: string; workflowRevision: number; runId: string; atlasWorkflowChecksum: string; snapshotChecksum: string; suspendedStepIds: string[]; storageRef: string; capturedAt: string; }

export function buildMastraSnapshotRef(input: Omit<MastraSnapshotRefV1, 'schema' | 'snapshotChecksum'> & { snapshot: unknown }): MastraSnapshotRefV1 {
  if (!input.storageRef.trim()) throw new Error('snapshot storageRef is required');
  return {
    schema: 'atlas.mastra-snapshot-ref.v1', workflowId: input.workflowId, workflowRevision: input.workflowRevision,
    runId: input.runId, atlasWorkflowChecksum: input.atlasWorkflowChecksum, snapshotChecksum: sha256Stable(input.snapshot),
    suspendedStepIds: [...new Set(input.suspendedStepIds)].sort(), storageRef: input.storageRef, capturedAt: input.capturedAt,
  };
}

export function assertSnapshotBelongsToWorkflow(ref: MastraSnapshotRefV1, workflowChecksum: string): void {
  if (ref.atlasWorkflowChecksum !== workflowChecksum) throw new Error('Mastra snapshot Atlas workflow checksum mismatch');
}
