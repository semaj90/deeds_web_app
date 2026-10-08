import { createHash } from 'node:crypto';
import { buildAdaptiveDagPlanV1 } from '../../packages/parent-atlas/src/core/adaptive-dag-plan-v1.js';
import { buildKernelBoundDagAdapterRegistryV1, executeWithKernelBoundDagAdapterRegistryV1 } from '../../packages/parent-atlas/src/core/kernel-bound-dag-adapter-registry-v1.js';
import { buildKernelDagExecutionBindingV1, checksumKernelDagBoundArguments } from '../../packages/parent-atlas/src/core/kernel-dag-execution-binding-v1.js';
import { createOakFailureContextDagAdapterV1, OAK_FAILURE_CONTEXT_ADAPTER_V1 } from '../../packages/parent-atlas/src/core/oak-failure-context-dag-adapter-v1.js';
import { buildOakCodeRepairTypeMismatchProfileV1 } from '../../packages/parent-atlas/src/core/oak-task-profile-v1.js';
import type { OakFailureContextReceiptV1 } from '../../packages/parent-atlas/src/core/oak-find-failure-context-v1.js';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const revision = (value: string) => `sha256:${sha256(value)}`;

const profile = buildOakCodeRepairTypeMismatchProfileV1({
  taxonomyRevision: 'taxonomy:fixture-v1',
  allowedConceptIds: ['concept:type-error'],
  allowedRelationIds: ['relation:SUPPORTED_BY'],
  allowedFunctionIds: ['fn:find_failure_context'],
  validatorIds: ['validator:typecheck'],
});
const taskRef = 'fixture/openspec/tasks.md#L1';
const sourceRef = 'fixture/src/example.ts';
const workspaceRevision = 'workspace:fixture-v1';
const sourceRevision = revision('fixture source bytes');
const taskRevision = revision('fixture task claim');
const evidenceCard = {
  schema: 'atlas.evidence-card.v1', taskRef, checksum: revision('fixture evidence card'),
  proofState: 'PROVEN', proofUsable: true, sourceRef, sourceRevision, workspaceRevision,
};
const taskCard = {
  stableKey: 'task:fixture/EX-01', taskRef, canonicalTaskRef: 'task:fixture/EX-01', taskRevision,
  sourceRevision, workspaceRevision, retrievalState: 'CURRENT', evidenceState: 'PROVEN',
  reviewReasons: [], canonicalAuthority: false as const,
};
const fact = {
  schema: 'atlas.grounded-nlp-fact.v1', factId: 'fact:fixture/EX-01', taskRef,
  canonicalTaskRef: taskCard.canonicalTaskRef, taskRevision, evidenceCardChecksum: evidenceCard.checksum,
  sourceRef, sourceRevision, workspaceRevision, featureKind: 'failure_class',
  proposedLabel: 'TYPE_MISMATCH', surfaceText: 'type mismatch',
  evidenceSpan: { byteStart: 0, byteEnd: 13, textSha256: sha256('type mismatch') },
  canonicalAuthority: false as const, ontologyPromotionAllowed: false as const,
};
const projection = {
  schema: 'atlas.grounded-nlp-ontology-projection.v1', factId: fact.factId,
  workspaceRevision, sourceRevision, canonicalAuthority: false as const, writesPerformed: false as const,
  tuple: {
    tupleId: 'tuple:fixture/EX-01', evidenceRefs: [fact.factId], evidenceState: 'GATED',
    provenance: { workspaceRevision, sourceRevision },
  },
};
const boundArguments = {
  requestId: 'request:oak-fixture-v1', profile, taskCard, evidenceCard,
  groundedFacts: [fact], ontologyProjections: [projection],
};
const action = {
  actionId: 'action:oak-failure-context', actionKind: 'BUILD_CONTEXT' as const,
  parentActionIds: [], inputArtifactRefs: ['fixture:admitted-evidence'], inputChecksum: sha256('fixture input'),
  parameterArtifactRef: null, parameterChecksum: checksumKernelDagBoundArguments(boundArguments),
  outputContract: OAK_FAILURE_CONTEXT_ADAPTER_V1.outputContract, mutationPolicy: 'READ_ONLY' as const,
  timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' as const,
};
const plan = buildAdaptiveDagPlanV1({
  planId: 'plan:oak-failure-context-fixture-v1', queryId: boundArguments.requestId,
  dagRevision: 'dag:fixture-v1', plannerRevision: 'planner:fixture-v1',
  classificationRevision: 'classification:fixture-v1', actions: [action],
});
const binding = buildKernelDagExecutionBindingV1({
  action: plan.actions[0], functionId: 'fn:find_failure_context', stepId: 'step:oak-failure-context',
  operatorId: OAK_FAILURE_CONTEXT_ADAPTER_V1.operatorId, operatorKind: OAK_FAILURE_CONTEXT_ADAPTER_V1.operatorKind,
  implementationRef: OAK_FAILURE_CONTEXT_ADAPTER_V1.implementationRef, boundArguments,
  expectedOutputSchemaId: OAK_FAILURE_CONTEXT_ADAPTER_V1.outputContract,
});

let functionReceipt: OakFailureContextReceiptV1 | undefined;
const adapter = createOakFailureContextDagAdapterV1();
const observingAdapter = Object.assign(async (input: Parameters<typeof adapter>[0]) => {
  const result = await adapter(input);
  functionReceipt = result as OakFailureContextReceiptV1;
  return result;
}, OAK_FAILURE_CONTEXT_ADAPTER_V1);
const executionReceipt = await executeWithKernelBoundDagAdapterRegistryV1({
  plan,
  registry: buildKernelBoundDagAdapterRegistryV1([observingAdapter]),
  bindings: [binding],
});

if (!functionReceipt || functionReceipt.status !== 'AVAILABLE') {
  throw new Error(`OAK_FIXTURE_NOT_AVAILABLE:${functionReceipt?.unavailableReason ?? 'NO_FUNCTION_RECEIPT'}`);
}

process.stdout.write(`${JSON.stringify({
  status: 'FIXTURE_EXECUTION_PROVEN',
  functionId: functionReceipt.functionId,
  functionStatus: functionReceipt.status,
  sourceRefs: functionReceipt.sourceRefs,
  evidenceRefs: functionReceipt.evidenceRefs,
  functionOutputChecksum: functionReceipt.outputChecksum,
  executionReceiptChecksum: executionReceipt.receiptChecksum,
  canonicalAuthority: executionReceipt.canonicalAuthority,
  writesPerformed: executionReceipt.writesPerformed,
}, null, 2)}\n`);
