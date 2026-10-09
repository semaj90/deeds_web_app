import { describe, expect, it } from 'vitest';
import {
  AgentActionProposalV1Schema,
  AgentReplayManifestV1Schema,
  PrimeAgentRuntimeV1Schema,
  RlmWorkingStateV1Schema,
  ToolExecutionEnvelopeV1Schema,
  ToolExecutionReceiptV1Schema,
  acceptAgentPlanV1,
  assertAgentActionAllowedAfterPlanAcceptanceV1,
  authorizeAndBuildToolEnvelopeV1,
  buildAgentActionProposalV1,
  buildAgentReplayManifestV1,
  buildCapabilityRegistryV1,
  buildRlmWorkingStateV1,
  closeAgentReplayV1,
  contextManifestChecksumV1,
  executeReadOnlyToolV1,
  runReadOnlyAgentReplayV1,
  verifyAgentReplayManifestV1,
  validateToolExecutionReceiptV1,
  agentExecutionSpineOwnerAuditV1,
  type AgentActionProposalV1,
  type AgentReplayManifestV1,
  type PrimeAgentRuntimeV1,
} from './agent-execution-spine-v1.js';
import { admitCurrentAceContextManifestV1 } from '../context/ace-context-manifest-admission-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { admitCurrentCandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import { resolveErrorNeighborhood } from './error-neighborhood-resolver-v1.js';

const sourceRef = 'src/example.ts#symbol:selectCandidate';
const workspaceRevision = `sha256:${'c'.repeat(64)}`;
const sourceRevision = `sha256:${'1'.repeat(64)}`;
const neighborhood = () => resolveErrorNeighborhood({
  errorId: 'error:TS2345-fixture-v1',
  errorClass: 'TS2345',
  sourceOrdinal: 1,
  symbolOrdinal: 2,
  domainOrdinal: 3,
  topologyCell: [0, 0, 0, 0],
  callerOrdinals: [4, 5],
  testOrdinals: [6],
});
const registry = buildCapabilityRegistryV1();
const ordinalMap = materializeCandidateOrdinalMap({
  candidates: [{
    canonicalId: 'canonical:fixture-ts2345',
    packetKey: 'packet:fixture-ts2345',
    sourceRef,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision,
    sourceRevision,
    graphRevision: 'graph:fixture-v1',
    semanticRevision: 'semantic_768:fixture-v1',
    degradedIdentity: false,
    evidenceRefs: [sourceRef],
    representationBindings: [{
      representationId: 'semantic_768',
      family: 'EMBEDDINGGEMMA_MRL',
      dimensions: 768,
      modelRevision: 'embeddinggemma-fixture-v1',
      projectionKind: 'NONE',
      sourceRepresentationId: null,
      projectionRevision: null,
      normalized: true,
      available: true,
      availabilityReason: null,
    }],
  }],
  candidateSnapshotRevision: 'candidate-snapshot:fixture-ts2345-v1',
  workspaceRevision,
  producerRevision: 'agent-spine-fixture-ordinal-map-v1',
});
const featureAdmission = admitCurrentCandidateFeatureSnapshotV1({
  ordinalMap,
  rows: [{
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: 0,
    canonicalId: 'canonical:fixture-ts2345',
    packetKey: 'packet:fixture-ts2345',
    sourceRef,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision,
    sourceRevision,
    graphRevision: 'graph:fixture-v1',
    semanticRevision: 'semantic_768:fixture-v1',
    featureRevision: 'feature:fixture-ts2345-v1',
    laneMask: ['semantic'],
    evidenceRefs: [sourceRef],
  }],
  featureRevision: 'feature:fixture-ts2345-v1',
  producerRevision: 'agent-spine-fixture-feature-v1',
  sourceRevisionSetChecksum: '2'.repeat(64),
  candidateSetChecksum: '3'.repeat(64),
  sourceChunkCohortStatus: 'REVISION_QUALIFIED',
  semanticCohortStatus: 'ADMITTED',
  graphFeatureStatus: 'ADMITTED',
});
const contextAdmission = admitCurrentAceContextManifestV1({
  featureAdmission,
  requestId: 'request:fixture-ts2345',
  tokenBudget: 256,
  retrievalPolicyRevision: 'retrieval-policy-fixture-v1',
  acePlaybookRevision: 'ace-playbook-fixture-v1',
  representationRevision: 'semantic_768:fixture-v1',
  modelRevision: 'fixture-model-v1',
  promptTemplateRevision: 'fixture-prompt-v1',
  graphRevision: 'graph:fixture-v1',
});
const contextManifest = contextAdmission.manifest;
if (contextManifest === null) throw new Error('FIXTURE_ACE_ADMISSION_FAILED');
const contextChecksum = contextManifestChecksumV1(contextManifest);
const policy = {
  policyRevision: 'read-only-policy-fixture-v1',
  allowedCapabilityIds: ['RG_EXACT_SEARCH'],
  allowedMutationClasses: ['READ_ONLY'] as const,
  maxToolCalls: 1,
};

function runtime(): PrimeAgentRuntimeV1 {
  return PrimeAgentRuntimeV1Schema.parse({
    schema: 'atlas.prime-agent-runtime.v1',
    requestId: 'request:fixture-ts2345',
    executionId: 'execution:fixture-ts2345',
    contextManifestChecksum: contextChecksum,
    policyRevision: policy.policyRevision,
    capabilityRegistryRevision: registry.registryRevision,
    toolRegistryRevision: registry.toolRegistryRevision,
    maxSteps: 1,
    maxToolCalls: 1,
    maxTokens: 512,
    state: 'PLAN',
    canonicalAuthority: false,
  });
}

function proposal(overrides: Partial<AgentActionProposalV1> = {}): AgentActionProposalV1 {
  return buildAgentActionProposalV1({
    executionId: 'execution:fixture-ts2345',
    stepOrdinal: 0,
    capability: registry.entries[0]!,
    registry,
    arguments: { sourceRef, sourceSymbol: 'selectCandidate' },
    evidenceRefs: [sourceRef],
    proposerModelRevision: 'fixture-model-v1',
    contextManifestChecksum: contextChecksum,
    ...overrides,
  });
}

function replayManifest(): AgentReplayManifestV1 {
  return buildAgentReplayManifestV1({
    workspaceRevision: `sha256:${'c'.repeat(64)}`,
    sourceSnapshotChecksum: `sha256:${contextManifest.identityInput.evidenceRevisions.sourceRevision}`,
    contextManifestChecksum: contextChecksum,
    capabilityRegistryRevision: registry.registryRevision,
    toolRegistryRevision: registry.toolRegistryRevision,
    primeAgentRevision: 'prime-agent-fixture-v1',
    plannerRevision: 'deterministic-fixture-planner-v1',
    modelRevision: 'fixture-model-v1',
    adapterRevision: 'no-adapter-v1',
    tokenizerRevision: 'fixture-tokenizer-v1',
    policyRevision: policy.policyRevision,
    expectedSequence: [{
      stepOrdinal: 0,
      capabilityId: registry.entries[0]!.capabilityId,
      capabilityRevision: registry.entries[0]!.capabilityRevision,
      toolId: registry.entries[0]!.toolId,
      toolRevision: registry.entries[0]!.toolRevision,
      transport: 'local',
    }],
  });
}

async function execution(action = proposal()) {
  const envelope = authorizeAndBuildToolEnvelopeV1({
    runtime: runtime(), proposal: action, registry, policy, contextAdmission,
  });
  const result = await executeReadOnlyToolV1({
    runtime: runtime(),
    envelope,
    proposal: action,
    registry,
    policy,
    contextAdmission,
    fixture: {
      sourceRef,
      sourceSymbol: 'selectCandidate',
      directCallers: ['buildCandidatePlan', 'resolveCandidate'],
      tests: ['select-candidate.spec.ts'],
      neighborhood: neighborhood(),
    },
    now: (() => {
      const dates = ['2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.001Z'];
      return () => dates.shift()!;
    })(),
  });
  return { action, envelope, ...result };
}

describe('read-only PrimeAgent execution spine', () => {
  it('seals one plan acceptance and rejects planning or consumed actions afterward', () => {
    const receipt = acceptAgentPlanV1({
      requestId: 'request:loop-guard',
      executionId: 'execution:loop-guard',
      planRevision: 'plan-r1',
      planChecksum: `sha256:${'a'.repeat(64)}`,
      consumedActionIds: ['build_recommendation'],
      planningActionIds: ['build_recommendation', 'recommendation:plan'],
      allowedNextActionIds: ['read_file', 'run_validator'],
    });
    expect(receipt.toState).toBe('PLAN_VALIDATED');
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(() => assertAgentActionAllowedAfterPlanAcceptanceV1({
      receipt,
      requestId: receipt.requestId,
      executionId: receipt.executionId,
      planRevision: receipt.planRevision,
      planChecksum: receipt.planChecksum,
      actionId: 'read_file',
    })).not.toThrow();
    expect(() => assertAgentActionAllowedAfterPlanAcceptanceV1({
      receipt,
      requestId: receipt.requestId,
      executionId: receipt.executionId,
      planRevision: receipt.planRevision,
      planChecksum: receipt.planChecksum,
      actionId: 'build_recommendation',
    })).toThrow('PLAN_ACTION_ALREADY_CONSUMED');
    expect(() => assertAgentActionAllowedAfterPlanAcceptanceV1({
      receipt,
      requestId: receipt.requestId,
      executionId: receipt.executionId,
      planRevision: 'plan-r2',
      planChecksum: receipt.planChecksum,
      actionId: 'read_file',
    })).toThrow('PLAN_ACCEPTANCE_REVISION_MISMATCH');
  });

  it('rejects plan acceptance with duplicate IDs or planning actions in the next-action mask', () => {
    expect(() => acceptAgentPlanV1({
      requestId: 'request:loop-guard',
      executionId: 'execution:loop-guard',
      planRevision: 'plan-r1',
      planChecksum: `sha256:${'a'.repeat(64)}`,
      consumedActionIds: ['plan', 'plan'],
      planningActionIds: ['plan'],
      allowedNextActionIds: ['read_file'],
    })).toThrow();
    expect(() => acceptAgentPlanV1({
      requestId: 'request:loop-guard',
      executionId: 'execution:loop-guard',
      planRevision: 'plan-r1',
      planChecksum: `sha256:${'a'.repeat(64)}`,
      consumedActionIds: ['plan'],
      planningActionIds: ['plan'],
      allowedNextActionIds: ['plan'],
    })).toThrow('PLANNING_ACTION_CANNOT_FOLLOW_ACCEPTANCE');
  });

  it('replays a checksum-bound manifest deterministically', () => {
    const first = replayManifest();
    const second = replayManifest();
    expect(first.manifestChecksum).toBe(second.manifestChecksum);
    expect(verifyAgentReplayManifestV1(first)).toBe(true);
    expect(AgentReplayManifestV1Schema.safeParse({ ...first, manifestChecksum: `sha256:${'0'.repeat(64)}` }).success).toBe(true);
    expect(verifyAgentReplayManifestV1({ ...first, manifestChecksum: `sha256:${'0'.repeat(64)}` })).toBe(false);
  });

  it('derives repeatable proposal and authorized envelope identities for equal revisions', () => {
    const first = proposal();
    const second = proposal();
    expect(first.proposalId).toBe(second.proposalId);
    const firstEnvelope = authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: first, registry, policy, contextAdmission });
    const secondEnvelope = authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: second, registry, policy, contextAdmission });
    expect(firstEnvelope).toEqual(secondEnvelope);
  });

  it('rejects unknown capabilities and stale capability revisions', () => {
    const unknown = { ...proposal(), capabilityId: 'NOT_REGISTERED', proposalId: 'proposal:unknown' };
    expect(() => authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: unknown, registry, policy: { ...policy, allowedCapabilityIds: ['NOT_REGISTERED'] }, contextAdmission })).toThrow('UNKNOWN_CAPABILITY');
    const stale = { ...proposal(), capabilityRevision: 'agentic-action-registry:old', proposalId: 'proposal:stale' };
    expect(() => authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: stale, registry, policy, contextAdmission })).toThrow('STALE_CAPABILITY_REVISION');
  });

  it('rejects bare ordinals and ordinals qualified by the wrong registry revision', () => {
    const bare = { ...proposal(), capabilityOrdinal: 0, capabilityRegistryRevision: undefined, proposalId: 'proposal:bare-ordinal' };
    expect(AgentActionProposalV1Schema.safeParse(bare).success).toBe(false);
    const wrongRegistry = { ...proposal(), capabilityOrdinal: 0, capabilityRegistryRevision: 'registry:other', proposalId: 'proposal:wrong-registry' };
    expect(() => authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: wrongRegistry, registry, policy, contextAdmission })).toThrow('CAPABILITY_REGISTRY_REVISION_MISMATCH');
  });

  it('rejects ContextManifest checksum drift and evidence outside ACE admission', () => {
    const wrongContext = { ...proposal(), contextManifestChecksum: `sha256:${'e'.repeat(64)}`, proposalId: 'proposal:wrong-context' };
    expect(() => authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: wrongContext, registry, policy, contextAdmission })).toThrow('PROPOSAL_CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
    const outside = buildAgentActionProposalV1({
      executionId: runtime().executionId,
      stepOrdinal: 0,
      capability: registry.entries[0]!,
      registry,
      arguments: { sourceRef, sourceSymbol: 'selectCandidate' },
      evidenceRefs: ['src/other.ts#symbol:other'],
      proposerModelRevision: 'fixture-model-v1',
      contextManifestChecksum: contextChecksum,
    });
    expect(() => authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: outside, registry, policy, contextAdmission })).toThrow('PROPOSAL_EVIDENCE_OUTSIDE_CONTEXT_MANIFEST');
    expect(() => contextManifestChecksumV1({ ...contextManifest, identityChecksum: 'f'.repeat(64) })).toThrow('CONTEXT_MANIFEST_IDENTITY_CHECKSUM_INVALID');
  });

  it('binds runtime request identity and execution policy to the admitted replay', () => {
    const wrongRequestRuntime = { ...runtime(), requestId: 'request:other' };
    expect(() => authorizeAndBuildToolEnvelopeV1({ runtime: wrongRequestRuntime, proposal: proposal(), registry, policy, contextAdmission })).toThrow('RUNTIME_CONTEXT_REQUEST_ID_MISMATCH');
    const { schema: _schema, manifestChecksum: _checksum, canonicalAuthority: _authority, ...manifestInput } = replayManifest();
    const wrongPolicyManifest = buildAgentReplayManifestV1({ ...manifestInput, policyRevision: 'read-only-policy:other' });
    expect(() => closeAgentReplayV1({ manifest: wrongPolicyManifest, runtime: runtime(), registry, receipts: [], executions: [] })).toThrow('REPLAY_RUNTIME_REVISION_MISMATCH');
  });

  it('rejects write-class capabilities and authority claims on ephemeral or transport records', () => {
    const storeWrite = { ...proposal(), mutationClass: 'STORE_WRITE' as const, proposalId: 'proposal:store-write' };
    expect(AgentActionProposalV1Schema.safeParse(storeWrite).success).toBe(true);
    expect(() => authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: storeWrite, registry, policy, contextAdmission })).toThrow('MUTATION_CLASS_NOT_AUTHORIZED');
    expect(RlmWorkingStateV1Schema.safeParse({
      ...buildRlmWorkingStateV1({
        executionId: runtime().executionId,
        stepOrdinal: 0,
        activeGoalRefs: ['goal:fixture'],
        activeEvidenceRefs: [sourceRef],
        priorReceiptRefs: [],
        pendingActionIds: [],
        tokenBudgetRemaining: 100,
        toolBudgetRemaining: 1,
        contextManifestChecksum: contextChecksum,
      }),
      canonicalAuthority: true,
    }).success).toBe(false);
    expect(ToolExecutionEnvelopeV1Schema.safeParse({
      ...authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: proposal(), registry, policy, contextAdmission }),
      transport: 'mcp',
      canonicalAuthority: true,
    }).success).toBe(false);
  });

  it('executes one bounded read-only fixture and emits a receipt bound to its exact input', async () => {
    const result = await execution();
    expect(result.observation.directCallers).toEqual(['buildCandidatePlan', 'resolveCandidate']);
    expect(result.observation.tests).toEqual(['select-candidate.spec.ts']);
    expect(() => validateToolExecutionReceiptV1({
      receipt: { ...result.receipt, inputChecksum: `sha256:${'0'.repeat(64)}` },
      envelope: result.envelope,
      proposal: result.action,
      registry,
    })).toThrow('RECEIPT_INPUT_CHECKSUM_MISMATCH');
    expect(() => validateToolExecutionReceiptV1({
      receipt: { ...result.receipt, toolRevision: 'tool:wrong-revision' },
      envelope: result.envelope,
      proposal: result.action,
      registry,
    })).toThrow('RECEIPT_TOOL_REVISION_MISMATCH');
    expect(ToolExecutionReceiptV1Schema.safeParse({
      ...result.receipt,
      canonicalAuthority: true,
    }).success).toBe(false);
    await expect(executeReadOnlyToolV1({
      runtime: runtime(),
      envelope: { ...result.envelope, authorizationReceiptRef: `sha256:${'0'.repeat(64)}` },
      proposal: result.action,
      registry,
      policy,
      contextAdmission,
      fixture: { sourceRef, sourceSymbol: 'selectCandidate', directCallers: [], tests: [], neighborhood: neighborhood() },
      now: () => '2026-10-01T12:00:00.000Z',
    })).rejects.toThrow('ENVELOPE_AUTHORIZATION_RECHECK_FAILED');
  });

  it('closes replay only when every expected step has its matching valid receipt', async () => {
    const result = await execution();
    const manifest = replayManifest();
    const runtimeValue = runtime();
    expect(closeAgentReplayV1({
      manifest,
      runtime: runtimeValue,
      registry,
      receipts: [result.receipt],
      executions: [{ receipt: result.receipt, envelope: result.envelope, proposal: result.action, observation: result.observation }],
    })).toBe('REPLAY_CLOSED');
    expect(() => closeAgentReplayV1({ manifest, runtime: runtimeValue, registry, receipts: [], executions: [] })).toThrow('REPLAY_STEP_RECEIPT_COVERAGE_INCOMPLETE');
    const badReceipt = { ...result.receipt, outputChecksum: `sha256:${'0'.repeat(64)}` };
    expect(() => closeAgentReplayV1({
      manifest,
      runtime: runtimeValue,
      registry,
      receipts: [badReceipt],
      executions: [{ receipt: badReceipt, envelope: result.envelope, proposal: result.action, observation: result.observation }],
    })).toThrow('RECEIPT_OUTPUT_CHECKSUM_MISMATCH');
  });

  it('reuses the ACE manifest, action-registry, and receipt owners without introducing another compiler', () => {
    expect(agentExecutionSpineOwnerAuditV1.secondContextManifestCompiler).toBe(false);
    expect(agentExecutionSpineOwnerAuditV1.secondCapabilityRegistryAuthority).toBe(false);
    expect(agentExecutionSpineOwnerAuditV1.contextManifestOwner).toContain('CurrentAceContextManifestAdmissionV1');
    expect(agentExecutionSpineOwnerAuditV1.runEventOwner).toBe('WorkflowActionEventV1');
    expect(agentExecutionSpineOwnerAuditV1.canonicalAuthority).toBe(false);
  });

  it('runs the frozen TS2345 neighborhood replay to a bounded final observation', async () => {
    const result = await runReadOnlyAgentReplayV1({
      manifest: replayManifest(),
      runtime: runtime(),
      proposal: proposal(),
      registry,
      policy,
      contextAdmission,
      fixture: {
        sourceRef,
        sourceSymbol: 'selectCandidate',
        directCallers: ['buildCandidatePlan', 'resolveCandidate'],
        tests: ['select-candidate.spec.ts'],
        neighborhood: neighborhood(),
      },
      now: (() => {
        const dates = ['2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.001Z'];
        return () => dates.shift()!;
      })(),
    });
    expect(result.finalState).toBe('COMPLETE');
    expect(result.completedSteps).toBe(1);
    expect(result.finalObservation.sourceSymbol).toBe('selectCandidate');
    expect(result.finalObservation.neighborhoodChecksum).toBe(neighborhood().neighborhoodChecksum);
    expect(result.receipts).toHaveLength(1);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects a bounded observation that does not match the resolved neighborhood cardinality', async () => {
    const action = proposal();
    const envelope = authorizeAndBuildToolEnvelopeV1({ runtime: runtime(), proposal: action, registry, policy, contextAdmission });
    await expect(executeReadOnlyToolV1({
      runtime: runtime(),
      envelope,
      proposal: action,
      registry,
      policy,
      contextAdmission,
      fixture: {
        sourceRef,
        sourceSymbol: 'selectCandidate',
        directCallers: ['one-caller-only'],
        tests: ['select-candidate.spec.ts'],
        neighborhood: neighborhood(),
      },
      now: () => '2026-10-01T12:00:00.000Z',
    })).rejects.toThrow('FIXTURE_NEIGHBORHOOD_CARDINALITY_MISMATCH');
  });
});
