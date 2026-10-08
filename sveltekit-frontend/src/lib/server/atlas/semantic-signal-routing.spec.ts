import { describe, expect, it } from 'vitest';
import {
  analyzeSemanticQuery,
  buildContinuityCheckpoint,
  buildLoopObservation,
  buildRecommendationFromAnalysis,
  buildRetrievalPlanFromAnalysis,
  buildSemanticSignalPacket,
  buildTraversalBudgetFromAnalysis,
  selectPreAgentStages,
  buildRetrievalParameterPlan,
} from './semantic-signal-routing.js';

describe('buildRetrievalParameterPlan (PARAM-PLAN-01)', () => {
  const base = { subjectId: 's', workspaceId: 'w', workspaceRevision: 'r', producer: 't', producerRevision: 'p' };
  const build = (query: string) => {
    const a = analyzeSemanticQuery({ ...base, query });
    const plan = buildRetrievalPlanFromAnalysis(a);
    return { a, plan, params: buildRetrievalParameterPlan(query, a, plan, selectPreAgentStages(a)) };
  };

  it('symbol query gets no semantic parameters; values come from the bounded plan', () => {
    const { params } = build('Where is buildLearningOutcomeV1 defined');
    expect(params.semantic).toBeUndefined();
    expect(params.sources).toContain('STATIC_POLICY');
    expect(params.policyRevision).toBe('static-policy-v1');
    expect(params.queryChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(params.canonicalAuthority).toBe(false);
  });

  it('conceptual query carries semantic topK/candidateCap equal to the plan limits, and is deterministic', () => {
    const { plan, params } = build('how does retrieval caching work');
    expect(params.semantic).toEqual({ topK: plan.final_evidence_limit, candidateCap: plan.candidate_limits.dense });
    expect(build('how does retrieval caching work').params.queryChecksum).toBe(params.queryChecksum);
  });
});

describe('selectPreAgentStages (CTX-PREAGENT-01)', () => {
  const base = { subjectId: 's', workspaceId: 'w', workspaceRevision: 'r', producer: 't', producerRevision: 'p' };

  it('named symbol query skips the semantic route and always brackets with analysis/cache and packet/handoff', () => {
    const a = analyzeSemanticQuery({ ...base, query: 'Where is buildLearningOutcomeV1 defined' });
    const plan = selectPreAgentStages(a);
    expect(plan.stages.slice(0, 2)).toEqual(['QUERY_ANALYSIS', 'CACHE_LOOKUP']);
    expect(plan.stages.slice(-2)).toEqual(['ACE_PACKET_ASSEMBLY', 'AGENT_HANDOFF']);
    expect(plan.stages).toContain('LEXICAL');
    expect(plan.stages).toContain('AST');
    expect(plan.stages).toContain('AST_STRUCTURAL_REFINE');
    expect(plan.stages).not.toContain('SEMANTIC_ROUTE');
    expect(plan.canonicalAuthority).toBe(false);
  });

  it('a plain conceptual query adds the semantic route and has no duplicate stages', () => {
    const a = analyzeSemanticQuery({ ...base, query: 'how does retrieval caching work' });
    const plan = selectPreAgentStages(a);
    expect(plan.stages).toContain('SEMANTIC_ROUTE');
    expect(new Set(plan.stages).size).toBe(plan.stages.length);
  });
});

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
