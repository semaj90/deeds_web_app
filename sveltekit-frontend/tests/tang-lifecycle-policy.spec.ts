import { describe, expect, it } from 'vitest';
import { defaultTangLanePolicy } from '../src/lib/server/atlas/tang/lifecycle-policy.js';
import { chooseMtpState } from '../src/lib/server/atlas/tang/decode.js';
import { prioritizeKanbanCandidates } from '../src/lib/server/atlas/tang/kanban.js';
import { prioritizeReadyWorkflowNodes } from '../src/lib/server/atlas/tang/workflow.js';

describe('Tang-inspired lifecycle policies', () => {
  it('keeps reranking exact-promotion gated', () => {
    expect(defaultTangLanePolicy('RERANKING').exactPromotionRequired).toBe(true);
    expect(defaultTangLanePolicy('PREFILL').exactPromotionRequired).toBe(true);
  });

  it('disables MTP when recent acceptance utility is poor', () => {
    expect(chooseMtpState({ acceptanceEma: 0.1, recentZeroAcceptStreak: 3, contextTokens: 8192, batchSize: 1, freeGpuBytes: 1024 ** 3 }).enabled).toBe(false);
  });

  it('never promotes blocked Kanban work above ready work', () => {
    const ordered = prioritizeKanbanCandidates([
      { taskId: 'blocked', priority: 'P0', blockedBy: ['dep'], evidenceCount: 8 },
      { taskId: 'ready', priority: 'P1', blockedBy: [], evidenceCount: 4 },
    ]);
    expect(ordered[0]?.taskId).toBe('ready');
  });

  it('filters workflow nodes through dependency and authorization gates before utility ordering', () => {
    const ready = prioritizeReadyWorkflowNodes({
      completedNodeIds: ['dep'],
      nodes: [
        { nodeId: 'blocked-auth', dependsOn: ['dep'], completed: false, blocked: false, authorizationRequired: true, authorizationGranted: false, exactPromotionRequired: false, exactPromotionSatisfied: false, validationRequired: true },
        { nodeId: 'ready', dependsOn: ['dep'], completed: false, blocked: false, authorizationRequired: false, authorizationGranted: false, exactPromotionRequired: true, exactPromotionSatisfied: true, validationRequired: true },
      ],
    });
    expect(ready.map((node) => node.nodeId)).toEqual(['ready']);
  });
});
