import { describe, expect, it } from 'vitest';

import {
  assertToolNominationAllowed,
  createPrefillExecutionPlanV1,
  LlmPrefillEnvelopeV1Schema,
  PrefillExecutionPlanV1Schema,
  type PrefillExecutionPlanInputV1,
} from './prefill-execution-plan-v1.js';

const HASH = 'a'.repeat(64);

function baseInput(): PrefillExecutionPlanInputV1 {
  return {
    requestId: 'req:prefill:1',
    workflowId: 'workflow:prefill:1',
    workflowRevision: 1,
    userQuery: 'Find the packet owner and explain the source path',
    queryIntent: 'SEARCH',
    allowedOperationKinds: ['READ', 'AUDIT'],
    mutationAuthorized: false,
    humanApprovalPresent: false,
    selectedToolIds: ['atlas.packet_search', 'trace.validate_ace_hit'],
    selectedDagNodeIds: ['classify', 'prefill', 'search', 'validate', 'synthesize'],
    requiredStages: [
      'QUERY_CLASSIFICATION',
      'PREFILL',
      'TOOL_SELECTION',
      'RETRIEVAL',
      'TOOL_EXECUTION',
      'VALIDATION',
      'SYNTHESIS',
    ],
    advisoryDecoder: {
      source: 'HMM_VITERBI',
      state: 'RETRIEVE',
      confidence: 0.82,
      evidenceRefs: ['hmm:transition:v1', 'viterbi:path:v1'],
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
      evidenceBudgetTokens: 24_000,
      instructionBudgetTokens: 4_000,
      selectedToolIds: ['atlas.packet_search', 'trace.validate_ace_hit'],
      selectedEvidenceRefs: ['packet:1'],
      packetManifestChecksum: null,
      routingReceiptChecksum: HASH,
      cacheKey: 'prefill:workspace:v1:query:v1:registry:v1',
      cacheable: true,
    },
    exactPromotionRequired: true,
    validationRequired: true,
    canonicalWritesAllowed: false,
    producerRevision: 'prefill-planner:v1',
  };
}

describe('PrefillExecutionPlanV1', () => {
  it('materializes a deterministic read-only plan with advisory HMM/Viterbi state', () => {
    const first = createPrefillExecutionPlanV1(baseInput());
    const second = createPrefillExecutionPlanV1(baseInput());

    expect(first.checksum).toBe(second.checksum);
    expect(first.queryHash).toBe(second.queryHash);
    expect(first.advisoryDecoder.authorizesExecution).toBe(false);
    expect(first.allowedOperationKinds).toEqual(['READ', 'AUDIT']);
    expect(first.canonicalWritesAllowed).toBe(false);
  });

  it('rejects prefill token budgets that exceed the model context window', () => {
    const input = baseInput();
    expect(() => LlmPrefillEnvelopeV1Schema.parse({
      ...input.prefill,
      contextWindowTokens: 8_192,
      evidenceBudgetTokens: 8_192,
    })).toThrow('prefill token budgets exceed model context window');
  });

  it('rejects APPLY when mutation authority is absent', () => {
    const input = baseInput();
    expect(() => createPrefillExecutionPlanV1({
      ...input,
      allowedOperationKinds: ['READ', 'PROPOSE', 'APPLY'],
    })).toThrow('APPLY requires mutationAuthorized=true');
  });

  it('rejects canonical writes without human approval', () => {
    const input = baseInput();
    expect(() => createPrefillExecutionPlanV1({
      ...input,
      allowedOperationKinds: ['READ', 'PROPOSE', 'APPLY'],
      mutationAuthorized: true,
      canonicalWritesAllowed: true,
      humanApprovalPresent: false,
    })).toThrow('canonical writes require APPLY + mutation authorization + human approval');
  });

  it('allows PROPOSE without granting APPLY', () => {
    const input = baseInput();
    const plan = createPrefillExecutionPlanV1({
      ...input,
      allowedOperationKinds: ['READ', 'AUDIT', 'PROPOSE'],
    });

    expect(() => assertToolNominationAllowed({
      plan,
      toolId: 'atlas.packet_search',
      operationKind: 'PROPOSE',
    })).not.toThrow();

    expect(() => assertToolNominationAllowed({
      plan,
      toolId: 'atlas.packet_search',
      operationKind: 'APPLY',
    })).toThrow('OPERATION_KIND_NOT_AUTHORIZED:APPLY');
  });

  it('rejects a tool nomination that was not selected during prefill', () => {
    const plan = createPrefillExecutionPlanV1(baseInput());
    expect(() => assertToolNominationAllowed({
      plan,
      toolId: 'atlas.patch.apply',
      operationKind: 'READ',
    })).toThrow('TOOL_NOT_PREFILL_AUTHORIZED:atlas.patch.apply');
  });

  it('rejects any mismatch between router-selected and prefilled tool IDs', () => {
    const input = baseInput();
    expect(() => createPrefillExecutionPlanV1({
      ...input,
      prefill: {
        ...input.prefill,
        selectedToolIds: ['atlas.packet_search'],
      },
    })).toThrow('prefill selected tools must exactly match plan selected tools');
  });

  it('accepts APPLY only after explicit mutation authority and human approval', () => {
    const input = baseInput();
    const plan = createPrefillExecutionPlanV1({
      ...input,
      selectedToolIds: ['atlas.patch.apply'],
      prefill: { ...input.prefill, selectedToolIds: ['atlas.patch.apply'], cacheable: false },
      allowedOperationKinds: ['APPLY'],
      mutationAuthorized: true,
      humanApprovalPresent: true,
      canonicalWritesAllowed: true,
    });

    expect(PrefillExecutionPlanV1Schema.parse(plan).canonicalWritesAllowed).toBe(true);
    expect(() => assertToolNominationAllowed({
      plan,
      toolId: 'atlas.patch.apply',
      operationKind: 'APPLY',
    })).not.toThrow();
  });
});
