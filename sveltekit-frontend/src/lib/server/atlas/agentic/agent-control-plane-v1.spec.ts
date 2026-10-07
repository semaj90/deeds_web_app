import { describe, expect, it } from 'vitest';
import {
  GepaShadowInputV1Schema,
  GroupRelativeCandidateEvalV1Schema,
  NextActionProposalV1Schema,
  agentControlPlaneOwnerAuditV1,
  buildGepaShadowInputV1,
  buildGroupRelativeCandidateEvalV1,
  buildNextActionProposalV1,
  buildQueryExecutionPlanV1,
  buildExecutorRequestV1,
  QueryExecutionPlanV1Schema,
  ExecutorRequestV1Schema,
  AgentMoveDescriptorV1Schema,
  buildAgentMoveDescriptorV1,
} from './agent-control-plane-v1.js';

const digest = `sha256:${'a'.repeat(64)}`;

describe('NextActionProposalV1', () => {
  it('accepts a bounded read-only next-action proposal', () => {
    const value = buildNextActionProposalV1({
      executionId: 'exec:1',
      stepOrdinal: 2,
      unresolvedQuestion: 'Which exact source revision owns this symbol?',
      proposedCapabilityId: 'RG_EXACT_SEARCH',
      parameters: { query: 'buildCandidatePlan' },
      evidenceNeeded: ['source_revision', 'symbol_span'],
      expectedInformationGain: 0.8,
      estimatedTokenCost: 256,
      estimatedToolCalls: 1,
      remainingTokenBudget: 2_048,
      remainingToolBudget: 3,
      stopCondition: 'Stop once one exact same-revision symbol binding is found.',
      plannerRevision: 'planner:v1',
      policyRevision: 'policy:v1',
      contextManifestChecksum: digest,
    });
    expect(value.canonicalAuthority).toBe(false);
  });

  it('fails closed when the proposal exceeds remaining budgets', () => {
    expect(() => buildNextActionProposalV1({
      executionId: 'exec:1',
      stepOrdinal: 2,
      unresolvedQuestion: 'Need more evidence.',
      proposedCapabilityId: 'RG_EXACT_SEARCH',
      parameters: {},
      evidenceNeeded: ['source_revision'],
      expectedInformationGain: 0.5,
      estimatedTokenCost: 2_049,
      estimatedToolCalls: 4,
      remainingTokenBudget: 2_048,
      remainingToolBudget: 3,
      stopCondition: 'Stop on exact evidence.',
      plannerRevision: 'planner:v1',
      policyRevision: 'policy:v1',
      contextManifestChecksum: digest,
    })).toThrow();
  });

  it('rejects authority escalation', () => {
    const parsed = NextActionProposalV1Schema.safeParse({
      schema: 'atlas.next-action-proposal.v1',
      executionId: 'exec:1',
      stepOrdinal: 0,
      unresolvedQuestion: 'x',
      proposedCapabilityId: 'RG_EXACT_SEARCH',
      parameters: {},
      evidenceNeeded: ['source'],
      expectedInformationGain: 0.1,
      estimatedTokenCost: 0,
      estimatedToolCalls: 0,
      remainingTokenBudget: 1,
      remainingToolBudget: 1,
      stopCondition: 'x',
      plannerRevision: 'p',
      policyRevision: 'q',
      contextManifestChecksum: digest,
      canonicalAuthority: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('GroupRelativeCandidateEvalV1', () => {
  it('ranks candidates only from validator-owned reward values', () => {
    const value = buildGroupRelativeCandidateEvalV1({
      groupId: 'group:1',
      executionId: 'exec:1',
      validatorRevision: 'validator:v1',
      policyRevision: 'policy:v1',
      candidates: [
        { candidateId: 'a', validatorReward: 0.4, validationReceiptRefs: ['receipt:a'], tokenCost: 50 },
        { candidateId: 'b', validatorReward: 0.9, validationReceiptRefs: ['receipt:b'], tokenCost: 100 },
        { candidateId: 'c', validatorReward: 0.9, validationReceiptRefs: ['receipt:c'], tokenCost: 20 },
      ],
    });
    expect(value.selectedCandidateId).toBe('c');
    expect(value.candidates.map((candidate) => [candidate.candidateId, candidate.relativeRank])).toEqual([
      ['c', 1],
      ['b', 2],
      ['a', 3],
    ]);
    expect(value.trainingMode).toBe('NO_WEIGHT_UPDATE');
    expect(value.canonicalAuthority).toBe(false);
  });

  it('rejects malformed winner/rank claims', () => {
    const parsed = GroupRelativeCandidateEvalV1Schema.safeParse({
      schema: 'atlas.group-relative-candidate-eval.v1',
      groupId: 'group:1',
      executionId: 'exec:1',
      validatorRevision: 'validator:v1',
      policyRevision: 'policy:v1',
      candidates: [
        {
          candidateId: 'a',
          validatorReward: 1,
          validationReceiptRefs: ['r:a'],
          learningOutcomeRef: null,
          tokenCost: 0,
          latencyMs: 0,
          mutationSize: 0,
          relativeRank: 2,
        },
        {
          candidateId: 'b',
          validatorReward: 0,
          validationReceiptRefs: ['r:b'],
          learningOutcomeRef: null,
          tokenCost: 0,
          latencyMs: 0,
          mutationSize: 0,
          relativeRank: 1,
        },
      ],
      selectedCandidateId: 'a',
      trainingMode: 'NO_WEIGHT_UPDATE',
      canonicalAuthority: false,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('GepaShadowInputV1', () => {
  it('is shadow-only and cannot promote or write', () => {
    const value = buildGepaShadowInputV1({
      promptProgramRevision: 'prompt:v1',
      heldOutEvalRevision: 'eval:v1',
      learningOutcomeRefs: ['outcome:1'],
      validatorFeedbackRefs: ['validator:1'],
      metricRevision: 'metric:v1',
      optimizerRevision: 'gepa:v1',
    });
    expect(value.mode).toBe('SHADOW_ONLY');
    expect(value.promotionAllowed).toBe(false);
    expect(value.writesAllowed).toBe(false);
    expect(value.canonicalAuthority).toBe(false);
  });

  it('rejects a promoted optimizer envelope', () => {
    expect(GepaShadowInputV1Schema.safeParse({
      schema: 'atlas.gepa-shadow-input.v1',
      promptProgramRevision: 'prompt:v1',
      heldOutEvalRevision: 'eval:v1',
      learningOutcomeRefs: ['outcome:1'],
      validatorFeedbackRefs: ['validator:1'],
      metricRevision: 'metric:v1',
      optimizerRevision: 'gepa:v1',
      mode: 'SHADOW_ONLY',
      promotionAllowed: true,
      writesAllowed: false,
      canonicalAuthority: false,
    }).success).toBe(false);
  });
});

describe('owner audit', () => {
  it('declares reuse of existing owners and no new authority', () => {
    expect(agentControlPlaneOwnerAuditV1.retrievalParameterOwner).toContain('RetrievalParameterPlanV1');
    expect(agentControlPlaneOwnerAuditV1.traversalBudgetOwner).toContain('TraversalBudgetV1');
    expect(agentControlPlaneOwnerAuditV1.actionProposalOwner).toContain('AgentActionProposalV1');
    expect(agentControlPlaneOwnerAuditV1.thisModuleOwnsCanonicalEvidence).toBe(false);
    expect(agentControlPlaneOwnerAuditV1.thisModuleOwnsModelWeights).toBe(false);
    expect(agentControlPlaneOwnerAuditV1.thisModuleOwnsPolicyPromotion).toBe(false);
  });
});


describe('QueryExecutionPlanV1', () => {
  const base = {
    requestId: 'req:1',
    queryChecksum: digest,
    workspaceRevision: 'workspace:v1',
    policyRevision: 'policy:v1',
    taxonomyRevision: 'taxonomy:v1',
    retrievalParameterPlanRef: 'artifact:retrieval-plan',
    traversalBudgetRef: 'artifact:traversal-budget',
    contextManifestChecksum: digest,
    stopConditions: ['stop when evidence is sufficient'],
  };

  it('accepts an acyclic bounded helper plan', () => {
    const plan = buildQueryExecutionPlanV1({
      ...base,
      nodes: [
        {
          nodeId: 'lexical',
          helperId: 'RG_EXACT_SEARCH',
          required: true,
          dependsOn: [],
          executorClass: 'TS_CPU_WORKER',
          transport: 'LOCAL',
          parametersChecksum: digest,
          inputArtifactRefs: [],
          evidenceRefs: ['evidence:q'],
          outputSchemaRef: 'atlas.lexical-observation.v1',
          maxTokens: 128,
          timeoutMs: 2_000,
        },
        {
          nodeId: 'gpu-rerank',
          helperId: 'GPU_FEATURE_RERANK',
          required: false,
          dependsOn: ['lexical'],
          executorClass: 'FASTAPI_GPU',
          transport: 'HTTP_JSON',
          parametersChecksum: digest,
          inputArtifactRefs: ['artifact:arrow:candidate-features'],
          evidenceRefs: ['evidence:q'],
          outputSchemaRef: 'atlas.rerank-observation.v1',
          maxTokens: 0,
          timeoutMs: 10_000,
        },
      ],
    });
    expect(plan.nodes).toHaveLength(2);
    expect(plan.canonicalAuthority).toBe(false);
  });

  it('rejects cyclic dependency graphs', () => {
    const parsed = QueryExecutionPlanV1Schema.safeParse({
      schema: 'atlas.query-execution-plan.v1',
      ...base,
      nodes: [
        {
          nodeId: 'a',
          helperId: 'A',
          required: true,
          dependsOn: ['b'],
          executorClass: 'LOCAL_READ_ONLY',
          transport: 'LOCAL',
          parametersChecksum: digest,
          inputArtifactRefs: [],
          evidenceRefs: [],
          outputSchemaRef: 'x',
          maxTokens: 0,
          timeoutMs: 1000,
        },
        {
          nodeId: 'b',
          helperId: 'B',
          required: true,
          dependsOn: ['a'],
          executorClass: 'LOCAL_READ_ONLY',
          transport: 'LOCAL',
          parametersChecksum: digest,
          inputArtifactRefs: [],
          evidenceRefs: [],
          outputSchemaRef: 'y',
          maxTokens: 0,
          timeoutMs: 1000,
        },
      ],
      canonicalAuthority: false,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('ExecutorRequestV1', () => {
  const base = {
    requestId: 'req:1',
    executionId: 'exec:1',
    nodeId: 'gpu-rerank',
    helperId: 'GPU_FEATURE_RERANK',
    workspaceRevision: 'workspace:v1',
    policyRevision: 'policy:v1',
    parametersChecksum: digest,
    evidenceRefs: ['evidence:q'],
    expectedOutputSchemaRef: 'atlas.rerank-observation.v1',
    timeoutMs: 10_000,
  };

  it('requires RTX/GPU execution to consume artifact references', () => {
    expect(() => buildExecutorRequestV1({
      ...base,
      executorClass: 'FASTAPI_GPU',
      transport: 'HTTP_JSON',
      inputArtifactRefs: [],
    })).toThrow();

    const request = buildExecutorRequestV1({
      ...base,
      executorClass: 'FASTAPI_GPU',
      transport: 'HTTP_JSON',
      inputArtifactRefs: ['artifact:mmap:feature-matrix'],
    });
    expect(request.payloadPolicy).toBe('REFERENCES_ONLY');
    expect(request.canonicalAuthority).toBe(false);
  });

  it('rejects gRPC executors sent over non-gRPC transports', () => {
    expect(ExecutorRequestV1Schema.safeParse({
      schema: 'atlas.executor-request.v1',
      ...base,
      executorClass: 'GRPC_GPU',
      transport: 'HTTP_JSON',
      inputArtifactRefs: ['artifact:arrow:matrix'],
      payloadPolicy: 'REFERENCES_ONLY',
      canonicalAuthority: false,
    }).success).toBe(false);
  });
});


describe('AgentMoveDescriptorV1', () => {
  it('builds a bounded read move with a complete domain-classification binding', () => {
    const move = buildAgentMoveDescriptorV1({
      moveId: 'move:inspect-symbol',
      moveRevision: 'move:v1',
      capabilityId: 'RG_EXACT_SEARCH',
      inputSchemaRef: 'atlas.search-request.v1',
      outputSchemaRef: 'atlas.lexical-observation.v1',
      policyRevision: 'policy:v1',
      permissionClass: 'READ',
      approvalRequired: false,
      estimatedCost: { tokenCost: 64, toolCalls: 1, latencyMs: 50 },
      traversalBudgetRef: 'artifact:traversal-budget',
      domainClassificationRef: 'artifact:domain-classification',
      domainConfidenceFloor: 0.7,
      classifierRevision: 'sklearn-nb-lr:v1',
    });
    expect(move.canonicalAuthority).toBe(false);
    expect(move.permissionClass).toBe('READ');
  });

  it('rejects partial classifier bindings', () => {
    expect(AgentMoveDescriptorV1Schema.safeParse({
      schema: 'atlas.agent-move-descriptor.v1',
      moveId: 'move:x',
      moveRevision: 'move:v1',
      capabilityId: 'RG_EXACT_SEARCH',
      inputSchemaRef: 'in',
      outputSchemaRef: 'out',
      policyRevision: 'policy:v1',
      permissionClass: 'READ',
      approvalRequired: false,
      estimatedCost: { tokenCost: 0, toolCalls: 0, latencyMs: 0 },
      traversalBudgetRef: null,
      domainClassificationRef: 'artifact:domain-classification',
      domainConfidenceFloor: null,
      classifierRevision: null,
      canonicalAuthority: false,
    }).success).toBe(false);
  });

  it('requires approval for WRITE and ADMIN moves', () => {
    expect(() => buildAgentMoveDescriptorV1({
      moveId: 'move:write',
      moveRevision: 'move:v1',
      capabilityId: 'APPLY_PATCH',
      inputSchemaRef: 'in',
      outputSchemaRef: 'out',
      policyRevision: 'policy:v1',
      permissionClass: 'WRITE',
      approvalRequired: false,
      estimatedCost: { tokenCost: 0, toolCalls: 1, latencyMs: 1 },
      traversalBudgetRef: null,
      domainClassificationRef: null,
      domainConfidenceFloor: null,
      classifierRevision: null,
    })).toThrow();
  });

  it('keeps legacy execution nodes compatible by defaulting move to null', () => {
    const parsed = QueryExecutionPlanV1Schema.parse({
      schema: 'atlas.query-execution-plan.v1',
      requestId: 'req:legacy',
      queryChecksum: digest,
      workspaceRevision: 'workspace:v1',
      policyRevision: 'policy:v1',
      taxonomyRevision: 'taxonomy:v1',
      retrievalParameterPlanRef: 'artifact:retrieval-plan',
      traversalBudgetRef: 'artifact:traversal-budget',
      contextManifestChecksum: digest,
      nodes: [{
        nodeId: 'lexical',
        helperId: 'RG_EXACT_SEARCH',
        required: true,
        dependsOn: [],
        executorClass: 'TS_CPU_WORKER',
        transport: 'LOCAL',
        parametersChecksum: digest,
        inputArtifactRefs: [],
        evidenceRefs: [],
        outputSchemaRef: 'atlas.lexical-observation.v1',
        maxTokens: 0,
        timeoutMs: 1000,
      }],
      stopConditions: ['done'],
      canonicalAuthority: false,
    });
    expect(parsed.nodes[0]?.move).toBeNull();
  });

  it('rejects an executor whose move capability does not match helperId', () => {
    const result = ExecutorRequestV1Schema.safeParse({
      schema: 'atlas.executor-request.v1',
      requestId: 'req:1',
      executionId: 'exec:1',
      nodeId: 'n1',
      helperId: 'RG_EXACT_SEARCH',
      executorClass: 'TS_CPU_WORKER',
      transport: 'LOCAL',
      workspaceRevision: 'workspace:v1',
      policyRevision: 'policy:v1',
      parametersChecksum: digest,
      inputArtifactRefs: [],
      evidenceRefs: [],
      expectedOutputSchemaRef: 'atlas.lexical-observation.v1',
      move: {
        schema: 'atlas.agent-move-descriptor.v1',
        moveId: 'move:mismatch',
        moveRevision: 'move:v1',
        capabilityId: 'GRAPH_EXPAND',
        inputSchemaRef: 'in',
        outputSchemaRef: 'out',
        policyRevision: 'policy:v1',
        permissionClass: 'READ',
        approvalRequired: false,
        estimatedCost: { tokenCost: 0, toolCalls: 1, latencyMs: 1 },
        traversalBudgetRef: null,
        domainClassificationRef: null,
        domainConfidenceFloor: null,
        classifierRevision: null,
        canonicalAuthority: false,
      },
      timeoutMs: 1000,
      payloadPolicy: 'REFERENCES_ONLY',
      canonicalAuthority: false,
    });
    expect(result.success).toBe(false);
  });
});
