import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';
import { algorithmExecutionManifestSchema } from './algorithm-execution-manifest.js';
import { buildKernelDagExecutionBindingV1, checksumKernelDagBoundArguments } from './kernel-dag-execution-binding-v1.js';
import { buildInstructionCardV1, instructionCardV1Schema, verifyInstructionCardV1 } from './instruction-card-v1.js';

const inputChecksum = createHash('sha256').update('input').digest('hex');
const args = { symbol: 'foo', maxDepth: 2 };

function makeAction() {
  return buildAdaptiveDagPlanV1({
    planId: 'plan:binding',
    queryId: 'query:binding',
    dagRevision: 'dag:v1',
    plannerRevision: 'planner:v1',
    classificationRevision: 'class:v1',
    actions: [{
      actionId: 'plan:binding:step:1',
      actionKind: 'FETCH_POSTGRES',
      parentActionIds: [],
      inputArtifactRefs: ['evidence:1'],
      inputChecksum,
      parameterArtifactRef: null,
      parameterChecksum: checksumKernelDagBoundArguments(args),
      outputContract: 'rows:v1',
      mutationPolicy: 'READ_ONLY',
      timeoutMs: 1000,
      failurePolicy: 'FAIL_CLOSED',
    }],
  }).actions[0];
}

function makeBinding() {
  return buildKernelDagExecutionBindingV1({
    action: makeAction(),
    functionId: 'function:f',
    stepId: 'step:1',
    operatorId: 'operator:o',
    operatorKind: 'LOOKUP_SYMBOL',
    implementationRef: 'postgres:read-symbol',
    boundArguments: args,
    expectedOutputSchemaId: 'rows:v1',
  });
}

function makeManifest(overrides: Record<string, unknown> = {}) {
  return algorithmExecutionManifestSchema.parse({
    execution_id: 'exec:1',
    action_id: 'plan:binding:step:1',
    dag_node_id: 'dag:semantic',
    stage: 'semantic_nomination',
    logical_lane: 'semantic',
    algorithm_class: 'exact_reference',
    algorithm: 'exact_gemm',
    geometry: 'cosine_hypersphere',
    metric: 'cosine',
    dimensions: 768,
    dtype: 'float32',
    compute_backend: 'pytorch_eager',
    compute_backend_revision: 'torch:reference',
    compilation_mode: 'eager',
    transport: 'local',
    serialization: 'numpy',
    cache_backend: 'none',
    source_snapshot_revision: 'snapshot:1',
    input_checksum: inputChecksum,
    device: { kind: 'cpu' },
    mutation: {},
    producer_revision: 'producer:r1',
    ...overrides,
  });
}

const base = () => ({
  instructionCardId: 'card:1',
  descriptorRevision: 'card:v1',
  binding: makeBinding(),
  bindingRef: 'binding:1',
  manifest: makeManifest(),
  manifestRef: 'manifest:1',
  packetKey: 'pk:1',
  workspaceRevision: 'ws:1',
  sourceRevision: 'snapshot:1',
  requiredCapabilityIds: ['cpu.mmap'],
  availableCapabilityIds: ['cpu.mmap'],
  resourcePolicyRef: 'policy:cpu',
});

describe('instruction card v1', () => {
  it('builds a NOT_ADMITTED reference card with no authority and no bound arguments', () => {
    const card = buildInstructionCardV1(base());
    expect(card.admissionStatus).toBe('NOT_ADMITTED');
    expect(card.executionAuthorized).toBe(false);
    expect(card.canonicalSourceAuthority).toBe(false);
    expect(JSON.stringify(card)).not.toContain('maxDepth');
    expect(verifyInstructionCardV1(card, base().binding, base().manifest, 'snapshot:1')).toEqual(card);
  });

  it('rejects stale source revision at build and at verify', () => {
    expect(() => buildInstructionCardV1({ ...base(), sourceRevision: 'snapshot:2' })).toThrow('STALE_SOURCE_REVISION');
    const card = buildInstructionCardV1(base());
    expect(() => verifyInstructionCardV1(card, base().binding, base().manifest, 'snapshot:2')).toThrow('STALE_SOURCE_REVISION');
  });

  it('rejects input checksum and action mismatches', () => {
    const other = createHash('sha256').update('x').digest('hex');
    expect(() => buildInstructionCardV1({ ...base(), manifest: makeManifest({ input_checksum: other }) })).toThrow('INPUT_CHECKSUM_MISMATCH');
    expect(() => buildInstructionCardV1({ ...base(), manifest: makeManifest({ action_id: 'other' }) })).toThrow('ACTION_MISMATCH');
  });

  it('rejects missing capabilities', () => {
    expect(() => buildInstructionCardV1({ ...base(), availableCapabilityIds: [] })).toThrow('CAPABILITY_MISSING:cpu.mmap');
  });

  it('rejects non read-only bindings and mutating manifests', () => {
    const b = base().binding;
    expect(() => buildInstructionCardV1({
      ...base(),
      binding: { ...b, action: { ...b.action, mutationPolicy: 'PROPOSE_ONLY' } },
    })).toThrow('NOT_READ_ONLY');
    expect(() => buildInstructionCardV1({ ...base(), manifest: makeManifest({ mutation: { mutates_cache: true } }) })).toThrow('MUTATES_STATE');
  });

  it('detects tampered referenced contracts', () => {
    const card = buildInstructionCardV1(base());
    const b = base().binding;
    expect(() => verifyInstructionCardV1(card, { ...b, implementationRef: 'other' }, base().manifest, 'snapshot:1')).toThrow('BINDING_CHECKSUM_MISMATCH');
    expect(() => verifyInstructionCardV1(card, b, makeManifest({ producer_revision: 'producer:r2' }), 'snapshot:1')).toThrow('MANIFEST_CHECKSUM_MISMATCH');
  });

  it('schema refuses authority escalation and embedded arguments', () => {
    const card = buildInstructionCardV1(base());
    expect(() => instructionCardV1Schema.parse({ ...card, executionAuthorized: true })).toThrow();
    expect(() => instructionCardV1Schema.parse({ ...card, admissionStatus: 'ADMITTED' })).toThrow();
    expect(() => instructionCardV1Schema.parse({ ...card, boundArguments: args })).toThrow();
  });
});

describe('instruction card to workflow action', () => {
  const identity = { runId: 'run:1', workflowId: 'wf:1', workflowRevision: 1, actionId: 'plan:binding:step:1', dagNodeId: 'node:1', attempt: 1 };
  it('emits a scheduled event that carries NOT_ADMITTED and no bound arguments', async () => {
    const { instructionCardToWorkflowAction } = await import('./workflow-action-adapters.js');
    const card = buildInstructionCardV1(base());
    const ev = instructionCardToWorkflowAction({ identity, sequence: 0, card, producer_revision: 'test:v1' });
    expect(ev.kind).toBe('scheduled');
    expect(ev.metadata.admission_status).toBe('NOT_ADMITTED');
    expect(JSON.stringify(ev)).not.toContain('maxDepth');
    expect(ev.revisions?.source).toBe('snapshot:1');
  });
  it('rejects an action id that differs from the card', async () => {
    const { instructionCardToWorkflowAction } = await import('./workflow-action-adapters.js');
    const card = buildInstructionCardV1(base());
    expect(() => instructionCardToWorkflowAction({ identity: { ...identity, actionId: 'other' }, sequence: 0, card, producer_revision: 'test:v1' })).toThrow('ACTION_MISMATCH');
  });
});
