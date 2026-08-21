import { describe, expect, it, vi } from 'vitest';
import {
  runParentAtlasDailyCompiler,
  type DailyCompilerPorts,
  type DailyFeatureArtifactV1,
} from './parent-atlas-daily-compiler.js';
import type { CheckpointCommitPayloadV1 } from '$lib/server/queue/event-fabric.js';

function checkpoint(overrides: Partial<CheckpointCommitPayloadV1> = {}): CheckpointCommitPayloadV1 {
  return {
    checkpointId: 'cp-1',
    stream: 'stream-a',
    startOffset: '0',
    endOffset: '2',
    eventCount: 3,
    firstOccurredAt: '2026-08-20T00:00:00.000Z',
    lastOccurredAt: '2026-08-20T00:02:00.000Z',
    merkleRoot: 'root-hex-1',
    schemaRevision: 'rev-1',
    ...overrides,
  };
}

function features(overrides: Partial<DailyFeatureArtifactV1> = {}): DailyFeatureArtifactV1 {
  return {
    artifactId: 'artifact-1',
    analyticsMerkleRoot: 'root-hex-1',
    featureRevision: 'feat-rev-1',
    rowCount: 10,
    artifactRef: 's3://bucket/artifact-1',
    artifactHash: 'artifact-hash-1',
    ...overrides,
  };
}

describe('runParentAtlasDailyCompiler', () => {
  it('refuses to proceed when the feature artifact does not declare the exact checkpoint Merkle root', async () => {
    const ports: DailyCompilerPorts = {
      compileGpuFeatures: vi.fn(async () => features({ analyticsMerkleRoot: 'WRONG-ROOT' })),
      deriveRecommendations: vi.fn(async () => []),
      buildKanbanCandidates: vi.fn(async () => []),
      persistDailyReceipt: vi.fn(async () => {}),
    };

    await expect(
      runParentAtlasDailyCompiler('run-1', checkpoint({ merkleRoot: 'root-hex-1' }), ports),
    ).rejects.toThrow(/does not declare the exact analytics Merkle root/);

    expect(ports.deriveRecommendations).not.toHaveBeenCalled();
    expect(ports.buildKanbanCandidates).not.toHaveBeenCalled();
    expect(ports.persistDailyReceipt).not.toHaveBeenCalled();
  });

  it('runs the full pipeline and persists a PROVEN receipt on the happy path', async () => {
    const recommendation = {
      candidateId: 'rec-1',
      targetType: 'packet' as const,
      targetId: 'pk-1',
      action: 'BOOST' as const,
      sourceEvidenceRefs: [],
    };
    const kanbanCandidate = {
      schemaVersion: 'atlas.kanban-candidate.v1' as const,
      candidateId: 'kb-1',
      title: 'Fix retrieval lane',
      category: 'RETRIEVAL' as const,
      utility: 1,
      confidence: 1,
      impact: 1,
      effort: 1,
      risk: 0,
      sourceEvidenceRefs: [],
      analyticsMerkleRoot: 'root-hex-1',
      featureRevision: 'feat-rev-1',
      recommendationModelRevision: 'model-1',
      proposedGate: 'GATE_X',
    };

    const persistDailyReceipt = vi.fn(async () => {});
    const ports: DailyCompilerPorts = {
      compileGpuFeatures: vi.fn(async (cp) =>
        features({ analyticsMerkleRoot: cp.merkleRoot, sourceRevisionSetHash: 'src-1', graphRevision: 'graph-1' }),
      ),
      deriveRecommendations: vi.fn(async () => [recommendation]),
      buildKanbanCandidates: vi.fn(async () => [kanbanCandidate]),
      persistDailyReceipt,
    };

    const receipt = await runParentAtlasDailyCompiler('run-1', checkpoint(), ports);

    expect(receipt.schemaVersion).toBe('atlas.parent-atlas-daily-receipt.v1');
    expect(receipt.runId).toBe('run-1');
    expect(receipt.analyticsCheckpointId).toBe('cp-1');
    expect(receipt.analyticsMerkleRoot).toBe('root-hex-1');
    expect(receipt.featureArtifactRef).toBe('s3://bucket/artifact-1');
    expect(receipt.recommendationCount).toBe(1);
    expect(receipt.kanbanCandidateCount).toBe(1);
    expect(receipt.sourceRevisionSetHash).toBe('src-1');
    expect(receipt.graphRevision).toBe('graph-1');
    expect(receipt.status).toBe('PROVEN');
    expect(receipt.evidenceRefs).toEqual(['s3://bucket/artifact-1']);
    expect(persistDailyReceipt).toHaveBeenCalledWith(receipt);
  });

  it('calls ports in strict order: features -> recommendations -> kanban -> persist', async () => {
    const order: string[] = [];
    const ports: DailyCompilerPorts = {
      compileGpuFeatures: vi.fn(async (cp) => {
        order.push('features');
        return features({ analyticsMerkleRoot: cp.merkleRoot });
      }),
      deriveRecommendations: vi.fn(async () => {
        order.push('recommendations');
        return [];
      }),
      buildKanbanCandidates: vi.fn(async () => {
        order.push('kanban');
        return [];
      }),
      persistDailyReceipt: vi.fn(async () => {
        order.push('persist');
      }),
    };

    await runParentAtlasDailyCompiler('run-1', checkpoint(), ports);
    expect(order).toEqual(['features', 'recommendations', 'kanban', 'persist']);
  });
});