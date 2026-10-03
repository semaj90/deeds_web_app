import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { canonicalSha256V1 } from '../../sveltekit-frontend/src/lib/server/atlas/prefill/canonical-hash-v1.js';
import { admitCurrentAceContextManifestV1 } from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-context-manifest-admission-v1.js';
import { materializeCandidateOrdinalMap } from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { admitCurrentCandidateFeatureSnapshotV1 } from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import {
  buildAgentActionProposalV1,
  buildAgentReplayManifestV1,
  buildCapabilityRegistryV1,
  contextManifestChecksumV1,
  runReadOnlyAgentReplayV1,
  PrimeAgentRuntimeV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/agentic/agent-execution-spine-v1.js';
import { resolveErrorNeighborhood } from '../../sveltekit-frontend/src/lib/server/atlas/agentic/error-neighborhood-resolver-v1.js';

const sourceRef = 'sveltekit-frontend/src/lib/server/atlas/agentic/error-neighborhood-resolver-v1.ts#symbol:resolveErrorNeighborhood';
const sourceSymbol = 'resolveErrorNeighborhood';
const workspaceRevision = `sha256:${'c'.repeat(64)}`;
const sourceRevisionChecksum = '2'.repeat(64);
const registry = buildCapabilityRegistryV1();
const policy = {
  policyRevision: 'read-only-policy-fixture-v1',
  allowedCapabilityIds: ['RG_EXACT_SEARCH'],
  allowedMutationClasses: ['READ_ONLY'] as const,
  maxToolCalls: 1,
};

const ordinalMap = materializeCandidateOrdinalMap({
  candidates: [{
    canonicalId: 'canonical:agent-execution-fixture',
    packetKey: 'packet:agent-execution-fixture',
    sourceRef,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision,
    sourceRevision: sourceRevisionChecksum,
    graphRevision: 'graph:agent-execution-fixture-v1',
    semanticRevision: 'semantic_768:agent-execution-fixture-v1',
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
  candidateSnapshotRevision: 'candidate-snapshot:agent-execution-fixture-v1',
  workspaceRevision,
  producerRevision: 'agent-execution-fixture-ordinal-map-v1',
});

const featureAdmission = admitCurrentCandidateFeatureSnapshotV1({
  ordinalMap,
  rows: [{
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: 0,
    canonicalId: 'canonical:agent-execution-fixture',
    packetKey: 'packet:agent-execution-fixture',
    sourceRef,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision,
    sourceRevision: sourceRevisionChecksum,
    graphRevision: 'graph:agent-execution-fixture-v1',
    semanticRevision: 'semantic_768:agent-execution-fixture-v1',
    featureRevision: 'feature:agent-execution-fixture-v1',
    laneMask: ['semantic'],
    evidenceRefs: [sourceRef],
  }],
  featureRevision: 'feature:agent-execution-fixture-v1',
  producerRevision: 'agent-execution-fixture-feature-v1',
  sourceRevisionSetChecksum: sourceRevisionChecksum,
  candidateSetChecksum: '3'.repeat(64),
  sourceChunkCohortStatus: 'REVISION_QUALIFIED',
  semanticCohortStatus: 'ADMITTED',
  graphFeatureStatus: 'ADMITTED',
});

const contextAdmission = admitCurrentAceContextManifestV1({
  featureAdmission,
  requestId: 'request:agent-execution-fixture-v1',
  tokenBudget: 256,
  retrievalPolicyRevision: 'retrieval-policy-fixture-v1',
  acePlaybookRevision: 'ace-playbook-fixture-v1',
  representationRevision: 'semantic_768:agent-execution-fixture-v1',
  modelRevision: 'fixture-model-v1',
  promptTemplateRevision: 'fixture-prompt-v1',
  graphRevision: 'graph:agent-execution-fixture-v1',
});
if (contextAdmission.status !== 'ADMITTED' || contextAdmission.manifest === null) {
  throw new Error('FIXTURE_ACE_ADMISSION_FAILED');
}

const contextManifestChecksum = contextManifestChecksumV1(contextAdmission.manifest);
const executionId = 'execution:agent-execution-fixture-v1';
const capability = registry.entries.find((entry) => entry.capabilityId === 'RG_EXACT_SEARCH');
if (!capability) throw new Error('FIXTURE_CAPABILITY_MISSING');

const runtime = PrimeAgentRuntimeV1Schema.parse({
  schema: 'atlas.prime-agent-runtime.v1',
  requestId: 'request:agent-execution-fixture-v1',
  executionId,
  contextManifestChecksum,
  policyRevision: policy.policyRevision,
  capabilityRegistryRevision: registry.registryRevision,
  toolRegistryRevision: registry.toolRegistryRevision,
  maxSteps: 1,
  maxToolCalls: 1,
  maxTokens: 512,
  state: 'PLAN',
  canonicalAuthority: false,
});

const proposal = buildAgentActionProposalV1({
  executionId,
  stepOrdinal: 0,
  capability,
  registry,
  arguments: { sourceRef, sourceSymbol },
  evidenceRefs: [sourceRef],
  proposerModelRevision: 'fixture-model-v1',
  contextManifestChecksum,
});

const replayManifest = buildAgentReplayManifestV1({
  workspaceRevision,
  sourceSnapshotChecksum: `sha256:${contextAdmission.manifest.identityInput.evidenceRevisions.sourceRevision}`,
  contextManifestChecksum,
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
    capabilityId: capability.capabilityId,
    capabilityRevision: capability.capabilityRevision,
    toolId: capability.toolId,
    toolRevision: capability.toolRevision,
    transport: 'local',
  }],
});

const resolvedNeighborhood = resolveErrorNeighborhood({
  errorId: 'error:TS2345-agent-execution-fixture-v1',
  errorClass: 'TS2345',
  sourceOrdinal: 1,
  symbolOrdinal: 2,
  domainOrdinal: 3,
  topologyCell: [0, 0, 0, 0],
  callerOrdinals: [4, 5],
  testOrdinals: [6],
});

const result = await runReadOnlyAgentReplayV1({
  manifest: replayManifest,
  runtime,
  proposal,
  registry,
  policy,
  contextAdmission,
  fixture: {
    sourceRef,
    sourceSymbol,
    directCallers: ['agent-execution-spine-v1.ts', 'agent-execution-spine-v1.spec.ts'],
    tests: ['agent-execution-spine-v1.spec.ts'],
    neighborhood: resolvedNeighborhood,
  },
  now: (() => {
    const timestamps = ['2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.001Z'];
    return () => timestamps.shift()!;
  })(),
});

const reportBody = {
  schema: 'atlas.agent-execution-spine-smoke-receipt.v1',
  replayStatus: 'READ_ONLY_REPLAY_PROVEN_FIXTURE_ONLY',
  replayManifestChecksum: replayManifest.manifestChecksum,
  contextManifestChecksum,
  capabilityRegistryRevision: registry.registryRevision,
  toolRegistryRevision: registry.toolRegistryRevision,
  expectedSequence: replayManifest.expectedSequence,
  finalResult: result,
  ownersReused: {
    candidateOrdinalMap: 'materializeCandidateOrdinalMap',
    candidateFeatureAdmission: 'admitCurrentCandidateFeatureSnapshotV1',
    contextManifestAdmission: 'admitCurrentAceContextManifestV1',
    contextManifestChecksum: 'contextManifestChecksumV1',
    actionRegistry: 'AGENTIC_ACTION_REGISTRY_V1_SEED',
    errorNeighborhood: 'resolveErrorNeighborhood',
    durableRunIdentity: 'WorkflowActionEventV1 (not written by this fixture)',
    durableReceipt: 'AgentWorkReceiptV1 via outcome_ledger (not written by this fixture)',
  },
  externalMcpOrOpenCodeCall: false,
  externalFrameworkDispatch: false,
  datastoreWrites: false,
  sourceOrTaskLedgerWrites: false,
  productionWiring: false,
  canonicalAuthority: false,
};
const report = {
  ...reportBody,
  reportChecksum: `sha256:${canonicalSha256V1(reportBody)}`,
};
const reportPath = resolve(process.cwd(), 'docs/reports/agent-execution-spine-read-only-replay-v1.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ replayStatus: report.replayStatus, reportPath, replayManifestChecksum: report.replayManifestChecksum }));
