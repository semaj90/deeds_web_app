import { describe, expect, it } from 'vitest';
import {
  analyzeSemanticQuery,
  buildContinuityCheckpoint,
  buildLoopObservation,
  buildRecommendationFromAnalysis,
  buildRetrievalPlanFromAnalysis,
  buildSemanticSignalPacket,
  buildTraversalBudgetFromAnalysis,
} from './semantic-signal-routing.js';

describe('semantic signal routing', () => {
  it('produces bounded query analysis and lane plans', () => {
    const analysis = analyzeSemanticQuery({
      query: 'qdrant retrieval schema graph traversal for postgres content_hash validation',
      subjectId: 'packet-1',
      workspaceId: 'workspace-1',
      workspaceRevision: 'rev-1',
      producer: 'test',
      producerRevision: 'rev-model-1',
    });

    const plan = buildRetrievalPlanFromAnalysis(analysis, {
      tokenBudget: 4096,
      allowedFilters: ['workspace_revision'],
    });
    const traversal = buildTraversalBudgetFromAnalysis(analysis, plan, 4096);

    expect(analysis.intent_probabilities[0]?.intent).toBeDefined();
    expect(analysis.recommended_lanes.length).toBeGreaterThan(0);
    expect(analysis.recommended_lanes).toContain('dense');
    expect(plan.lanes.length).toBeGreaterThan(0);
    expect(plan.graph_limits.max_nodes).toBeLessThanOrEqual(40);
    expect(plan.final_evidence_limit).toBeLessThanOrEqual(20);
    expect(plan.allowed_filters).toContain('workspace_revision');
    expect(traversal.max_hops).toBeLessThanOrEqual(3);
    expect(traversal.max_nodes).toBeLessThanOrEqual(40);
  });

  it('creates compact continuity and recommendation packets', () => {
    const packet = buildSemanticSignalPacket({
      query: 'Need a bounded plan for qdrant retrieval and context assembly',
      subjectId: 'packet-2',
      workspaceId: 'workspace-1',
      workspaceRevision: 'rev-2',
      producer: 'test',
      producerRevision: 'rev-model-1',
      activeGoal: 'keep context bounded',
      currentPlanStep: 'retrieve',
      problem: 'Context window pressure',
      proposedAction: 'Use compact semantic signals',
      validationCriteria: ['bounded lanes', 'evidence refs preserved'],
      rollbackPlan: ['fall back to current runtime route'],
      status: 'RUNTIME_PROOF_PENDING',
      loopState: 'PLAN',
      loopTool: 'atlas.inspect_runtime',
      loopResult: 'PASS',
      loopEvidenceCoverage: 0.4,
      loopTokenPressure: 0.2,
    });

    expect(packet.compactSummary.signal_version).toContain('semantic_signal');
    expect(packet.continuityCheckpoint.active_goal).toContain('bounded');
    expect(packet.loopObservation.state).toBe('PLAN');
    expect(packet.loopObservation.result).toBe('PASS');
    expect(packet.recommendation.lifecycle_state).toBe('PROPOSED');
    expect(packet.proofManifest.status).toBe('RUNTIME_PROOF_PENDING');
  });

  it('supports explicit checkpoint and loop observation construction', () => {
    const checkpoint = buildContinuityCheckpoint({
      query: 'graph routing continuity',
      subjectId: 'packet-3',
      workspaceId: 'workspace-1',
      workspaceRevision: 'rev-3',
      producer: 'test',
      producerRevision: 'rev-model-1',
      activeGoal: 'retain decisions',
      currentPlanStep: 'validate',
      acceptedDecisions: ['use Postgres as authority'],
      rejectedHypotheses: ['round robin across unlike lanes'],
    });

    const observation = buildLoopObservation({
      state: 'VALIDATE',
      tool: 'atlas.validate_change',
      result: 'WARN',
      subjectId: 'packet-3',
      workspaceRevision: 'rev-3',
      producer: 'test',
      producerRevision: 'rev-model-1',
      evidenceCoverage: 0.8,
      tokenPressure: 0.3,
      unsupportedClaimCount: 1,
    });

    const recommendation = buildRecommendationFromAnalysis({
      query: 'graph routing continuity',
      subjectId: 'packet-3',
      workspaceId: 'workspace-1',
      workspaceRevision: 'rev-3',
      producer: 'test',
      producerRevision: 'rev-model-1',
      activeGoal: 'retain decisions',
      currentPlanStep: 'validate',
      problem: 'Need a rollback-safe continuity policy',
      proposedAction: 'Persist checkpoints before compaction',
      validationCriteria: ['checkpoint retained', 'evidence ids persisted'],
      rollbackPlan: ['revert to prior checkpoint'],
    });

    expect(checkpoint.accepted_decisions).toContain('use Postgres as authority');
    expect(observation.validation_state).toBe('WARN');
    expect(recommendation.validation_plan.criteria).toContain('checkpoint retained');
  });
});
