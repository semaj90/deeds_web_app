import { describe, expect, it } from 'vitest';

import { materializeActiveToolRegistryManifestV1, type ActiveToolRegistryEntryV1 } from './active-tool-registry-v1.js';
import { buildPrefillExecutionPlanFromRoutingV1 } from './prefill-routing-adapter-v1.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function registryEntry(overrides: Partial<ActiveToolRegistryEntryV1> = {}): ActiveToolRegistryEntryV1 {
  return {
    schema: 'atlas.active-tool-registry-entry.v1',
    entryId: 'trace:atlas.packet_search',
    toolId: 'atlas.packet_search',
    owner: 'trace-mcp',
    handlerId: 'trace:atlas.packet_search',
    dispatchSurface: 'TRACE_MCP',
    lane: 'identity',
    operationKind: 'READ',
    targetScopes: ['NONE'],
    permissions: ['code:read'],
    proofStatus: 'PROVEN',
    schemaListed: true,
    canonicalOwner: true,
    routingEligible: true,
    duplicateGroup: null,
    cachePolicy: { mode: 'SERVER_TTL', scope: 'private' },
    producerRevision: 'registry-producer:v1',
    ...overrides,
  };
}

function registry(entries = [registryEntry()]) {
  return materializeActiveToolRegistryManifestV1({
    registryRevision: 'tool-registry:v1',
    generatedAt: '2026-08-22T21:00:00.000Z',
    entries,
  });
}

function routingSnapshot() {
  return {
    requestId: 'request:1',
    toolRegistryRevision: 'tool-registry:v1',
    queryText: 'Find the authoritative packet for this source',
    deterministicFeatures: {
      tokenCount: 8,
      identifiers: [],
      filePaths: [],
      symbols: [],
      errorCodes: [],
      languages: ['typescript'],
      astKinds: [],
      requestedActions: ['SEARCH' as const],
      negations: [],
      temporalTerms: [],
      capabilityMask: 'search',
      priorActionMask: 'none',
      activeFileIds: [],
    },
    candidateTools: [{
      toolId: 'atlas.packet_search',
      eligible: true,
      exclusionReasonCodes: [],
      signals: { lexicalExact: 1, lexicalSparse: 0.5, semantic: 0.8, ast: 0.4, graph: 0.2, hyperedge: 0 },
      intentProbability: 0.95,
      domainProbability: 0.9,
      capabilityMatch: 1,
      hammingMaskMatch: 1,
      historicalSuccessRate: 0.9,
      historicalFailureRate: 0.1,
      evidenceCoverage: 0.8,
      revisionFreshness: 1,
      estimatedLatencyMs: 15,
      estimatedVramBytes: 0,
      requiresWrite: false,
      requiresApproval: false,
      evidenceRefs: ['registry:atlas.packet_search', 'profile:packet-search:v1'],
    }],
    checksum: HASH_A,
  };
}

function routingReceipt(selectedToolIds = ['atlas.packet_search']) {
  return {
    requestId: 'request:1',
    snapshotChecksum: HASH_A,
    selectedToolIds,
    checksum: HASH_B,
  };
}

function build(overrides: Record<string, unknown> = {}) {
  return buildPrefillExecutionPlanFromRoutingV1({
    routingSnapshot: routingSnapshot(),
    routingReceipt: routingReceipt(),
    toolRegistry: registry(),
    workflowId: 'workflow:1',
    workflowRevision: 1,
    allowedOperationKinds: ['READ', 'AUDIT'],
    allowedTargetScopes: ['NONE'],
    mutationAuthorized: false,
    humanApprovalPresent: false,
    selectedDagNodeIds: ['classify', 'prefill', 'search', 'validate', 'synthesize'],
    requiredStages: ['QUERY_CLASSIFICATION', 'PREFILL', 'TOOL_SELECTION', 'RETRIEVAL', 'TOOL_EXECUTION', 'VALIDATION', 'SYNTHESIS'],
    advisoryDecoder: {
      source: 'HMM_VITERBI',
      state: 'RETRIEVE',
      confidence: 0.8,
      evidenceRefs: ['hmm:v1'],
      authorizesExecution: false,
    },
    model: {
      provider: 'llama-server',
      modelId: 'hforf.gguf',
      endpoint: 'http://127.0.0.1:8090/v1',
      contextWindowTokens: 65_536,
      reservedOutputTokens: 4_096,
      toolSchemaBudgetTokens: 4_000,
      evidenceBudgetTokens: 24_000,
      instructionBudgetTokens: 4_000,
    },
    packetManifestChecksum: null,
    exactPromotionRequired: true,
    validationRequired: true,
    producerRevision: 'prefill-routing-adapter:v1',
    ...overrides,
  } as Parameters<typeof buildPrefillExecutionPlanFromRoutingV1>[0]);
}

describe('buildPrefillExecutionPlanFromRoutingV1', () => {
  it('binds deterministic routing, registry authority, evidence and model prefill', () => {
    const plan = build();
    expect(plan.queryIntent).toBe('SEARCH');
    expect(plan.selectedToolIds).toEqual(['atlas.packet_search']);
    expect(plan.prefill.modelId).toBe('hforf.gguf');
    expect(plan.prefill.selectedEvidenceRefs).toEqual(['profile:packet-search:v1', 'registry:atlas.packet_search']);
    expect(plan.prefill.cacheable).toBe(true);
    expect(plan.advisoryDecoder.authorizesExecution).toBe(false);
  });

  it('fails when the routing receipt is not bound to the same snapshot checksum', () => {
    expect(() => build({ routingReceipt: { ...routingReceipt(), snapshotChecksum: 'c'.repeat(64) } })).toThrow(
      'PREFILL_ROUTING_SNAPSHOT_CHECKSUM_MISMATCH',
    );
  });

  it('fails when the query snapshot and active registry revisions disagree', () => {
    const mismatchedRegistry = materializeActiveToolRegistryManifestV1({
      registryRevision: 'tool-registry:v2',
      generatedAt: '2026-08-22T21:00:00.000Z',
      entries: [registryEntry()],
    });
    expect(() => build({ toolRegistry: mismatchedRegistry })).toThrow('PREFILL_TOOL_REGISTRY_REVISION_MISMATCH');
  });

  it('fails closed when neural routing selects a registry-blocked tool', () => {
    const blocked = registryEntry({
      proofStatus: 'QUARANTINED',
      routingEligible: false,
    });
    expect(() => build({ toolRegistry: registry([blocked]) })).toThrow(
      'PREFILL_SELECTED_TOOL_NOT_REGISTRY_ROUTABLE:atlas.packet_search',
    );
  });

  it('fails when selected tool operation authority exceeds the request', () => {
    const apply = registryEntry({
      operationKind: 'APPLY',
      targetScopes: ['WORKTREE_SOURCE'],
      permissions: ['code:write'],
    });
    expect(() => build({ toolRegistry: registry([apply]) })).toThrow(
      'PREFILL_SELECTED_TOOL_OPERATION_NOT_AUTHORIZED:atlas.packet_search:APPLY',
    );
  });

  it('makes proposal prefill non-cacheable and permits only ephemeral target state', () => {
    const proposed = registryEntry({
      operationKind: 'PROPOSE',
      targetScopes: ['EPHEMERAL_WORKSPACE'],
      lane: 'synthesis',
      cachePolicy: { mode: 'NONE', scope: null },
    });
    const plan = build({
      toolRegistry: registry([proposed]),
      allowedOperationKinds: ['READ', 'AUDIT', 'PROPOSE'],
      allowedTargetScopes: ['NONE', 'EPHEMERAL_WORKSPACE'],
    });
    expect(plan.prefill.cacheable).toBe(false);
    expect(plan.canonicalWritesAllowed).toBe(false);
  });
});
