import { describe, expect, it } from 'vitest';
import { buildAgentActionEvent } from './agent-action-event-v1.js';
import { buildActionCurrentProjection, decideExecutionReuse } from './temporal-action-index-v1.js';
import { rankNextActions } from './next-action-recommendation-v1.js';

const applicability = {
  workspaceRevision: 'workspace:r1',
  sourceRevisions: ['source:r1'],
  graphRevision: 'graph:r1',
  representationRevision: 'semantic_768:r1',
  producerRevision: 'rg:v1',
  validFromRevision: 'workspace:r1',
  validToRevision: null,
  observedAt: '2026-08-21T18:00:00.000Z',
};

describe('temporal action index v1', () => {
  it('reuses a finalized exact success for the same execution key', () => {
    const completed = buildAgentActionEvent({
      actionId: 'A1', dagId: 'D1', taskId: 'T1', opcode: 'RG_SEARCH', targetCanonicalId: 'sym:foo',
      inputHash: 'sha256:input', lifecycleState: 'FINALIZED', outcome: 'SUCCESS_EXACT', applicability,
      resultRef: 'cas:result', evidenceRefs: ['src/foo.ts'], latencyMs: 4, tokenCost: 0, mutationRisk: 0,
      informationGain: 0.9, metadata: {},
    });
    const [current] = buildActionCurrentProjection([completed]);
    const decision = decideExecutionReuse({ executionKey: completed.executionKey, current });
    expect(decision.decision).toBe('HIT');
    expect(decision.reusableResultRef).toBe('cas:result');
  });

  it('blocks an identical failed action until policy or new evidence permits retry', () => {
    const failed = buildAgentActionEvent({
      actionId: 'A2', dagId: 'D1', taskId: 'T1', opcode: 'QDRANT_SEARCH', targetCanonicalId: 'sym:foo',
      inputHash: 'sha256:q', lifecycleState: 'FINALIZED', outcome: 'NO_RESULT', applicability,
      resultRef: null, evidenceRefs: [], latencyMs: 15, tokenCost: 0, mutationRisk: 0, informationGain: 0.1, metadata: {},
    });
    const [current] = buildActionCurrentProjection([failed]);
    expect(decideExecutionReuse({ executionKey: failed.executionKey, current }).decision).toBe('BLOCK');
    expect(decideExecutionReuse({ executionKey: failed.executionKey, current, evidenceFrontierChanged: true }).decision).toBe('RETRY');
  });

  it('prefers high information gain and history over expensive synthesis', () => {
    const rows = [
      { schema: 'atlas.action-feature-row.v1' as const, requestId: 'r1', candidateId: 'rg', opcode: 'RG_SEARCH' as const, targetCanonicalId: 'sym:foo', executionKey: 'exec:rg', workspaceRevision: 'workspace:r1', graphRevision: 'graph:r1', featureRevision: 'f1', features: { semanticAffinity: .7, structuralAffinity: .95, queryClassAffinity: .9, historicalSuccessRate: .95, lastFailureSimilarity: .1, cacheHitProbability: .2, informationGain: .95, executionCost: .1, latencyCost: .1, mutationRisk: 0, tokenSavings: .9, dependencyReadiness: .95 }, evidenceRefs: ['src/foo.ts'] },
      { schema: 'atlas.action-feature-row.v1' as const, requestId: 'r1', candidateId: 'llm', opcode: 'SYNTHESIZE' as const, targetCanonicalId: null, executionKey: 'exec:llm', workspaceRevision: 'workspace:r1', graphRevision: 'graph:r1', featureRevision: 'f1', features: { semanticAffinity: .9, structuralAffinity: .4, queryClassAffinity: .5, historicalSuccessRate: .4, lastFailureSimilarity: .2, cacheHitProbability: 0, informationGain: .2, executionCost: .9, latencyCost: .8, mutationRisk: .1, tokenSavings: .1, dependencyReadiness: .4 }, evidenceRefs: [] },
    ];
    const ranked = rankNextActions({ rows, policyRevision: 'action-rank:v1' });
    expect(ranked[0].candidateId).toBe('rg');
    expect(ranked[0].exactGateRequired).toBe(true);
  });
});
