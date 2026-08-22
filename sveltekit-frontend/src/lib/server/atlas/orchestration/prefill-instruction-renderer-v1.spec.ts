import { describe, expect, it } from 'vitest';

import { createPrefillExecutionPlanV1, type PrefillExecutionPlanInputV1 } from './prefill-execution-plan-v1.js';
import { renderPrefillExecutionInstructionsV1 } from './prefill-instruction-renderer-v1.js';

const HASH = 'd'.repeat(64);

function input(): PrefillExecutionPlanInputV1 {
  return {
    requestId: 'request:render:1',
    workflowId: 'workflow:render:1',
    workflowRevision: 7,
    userQuery: 'Draft a patch in .tmp but do not apply it',
    queryIntent: 'EDIT',
    allowedOperationKinds: ['READ', 'AUDIT', 'PROPOSE'],
    allowedTargetScopes: ['NONE', 'EPHEMERAL_WORKSPACE'],
    mutationAuthorized: false,
    humanApprovalPresent: false,
    selectedToolIds: ['atlas.packet_search', 'artifact.propose'],
    selectedDagNodeIds: ['classify', 'retrieve', 'propose', 'validate'],
    requiredStages: ['QUERY_CLASSIFICATION', 'PREFILL', 'TOOL_SELECTION', 'RETRIEVAL', 'SYNTHESIS', 'MATERIALIZATION', 'VALIDATION'],
    advisoryDecoder: {
      source: 'HMM_VITERBI',
      state: 'PROPOSE_PATCH',
      confidence: 0.71,
      evidenceRefs: ['decoder:hmm:v1'],
      authorizesExecution: false,
    },
    prefill: {
      schema: 'atlas.llm-prefill-envelope.v1',
      modelProvider: 'llama-server',
      modelId: 'hforf.gguf',
      endpoint: 'http://127.0.0.1:8090/v1',
      contextWindowTokens: 65_536,
      reservedOutputTokens: 4_096,
      toolSchemaBudgetTokens: 4_000,
      evidenceBudgetTokens: 20_000,
      instructionBudgetTokens: 4_000,
      selectedToolIds: ['atlas.packet_search', 'artifact.propose'],
      selectedEvidenceRefs: ['packet:1'],
      packetManifestChecksum: null,
      routingReceiptChecksum: HASH,
      cacheKey: 'prefill:render:v1',
      cacheable: false,
    },
    exactPromotionRequired: true,
    validationRequired: true,
    canonicalWritesAllowed: false,
    producerRevision: 'renderer-test:v1',
  };
}

describe('renderPrefillExecutionInstructionsV1', () => {
  it('renders deterministic model instructions bound to the plan checksum', () => {
    const plan = createPrefillExecutionPlanV1(input());
    const first = renderPrefillExecutionInstructionsV1(plan);
    const second = renderPrefillExecutionInstructionsV1(plan);
    expect(first).toEqual(second);
    expect(first.planChecksum).toBe(plan.checksum);
    expect(first.systemInstructions).toContain('PARENT_ATLAS_PREFILL_EXECUTION_POLICY_V1');
    expect(first.systemInstructions).toContain('artifact.propose');
  });

  it('states that HMM/Viterbi state is advisory rather than authorization', () => {
    const rendered = renderPrefillExecutionInstructionsV1(createPrefillExecutionPlanV1(input()));
    expect(rendered.systemInstructions).toContain('authorization: NONE');
    expect(rendered.systemInstructions).toContain('HMM, Viterbi, FSM, neural scores, and model reasoning are advisory');
  });

  it('distinguishes disposable proposal artifacts from real source apply', () => {
    const rendered = renderPrefillExecutionInstructionsV1(createPrefillExecutionPlanV1(input()));
    expect(rendered.systemInstructions).toContain('PROPOSE may create a disposable artifact only when EPHEMERAL_WORKSPACE is allowed');
    expect(rendered.systemInstructions).toContain('do not reinterpret an EPHEMERAL_WORKSPACE proposal as a source edit');
    expect(rendered.systemInstructions).toContain('canonical_writes_allowed: NO');
  });

  it('carries exact-promotion and validation obligations into model instructions', () => {
    const rendered = renderPrefillExecutionInstructionsV1(createPrefillExecutionPlanV1(input()));
    expect(rendered.systemInstructions).toContain('exact_promotion_required: YES');
    expect(rendered.systemInstructions).toContain('validation_required: YES');
    expect(rendered.systemInstructions).toContain('do not synthesize authoritative evidence from retrieval-only candidates');
  });
});
