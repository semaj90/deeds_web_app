import { describe, expect, it } from 'vitest';
import {
  GepaShadowInputV1Schema,
  GroupRelativeCandidateEvalV1Schema,
  NextActionProposalV1Schema,
  agentControlPlaneOwnerAuditV1,
  buildGepaShadowInputV1,
  buildGroupRelativeCandidateEvalV1,
  buildNextActionProposalV1,
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
