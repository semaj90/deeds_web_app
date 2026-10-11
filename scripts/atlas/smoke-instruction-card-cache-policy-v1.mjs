#!/usr/bin/env node
/**
 * Read-only smoke for MIRROR-02 / MIRROR-03 / EXEC-SMOKE-06 (policy cases).
 * Loads compiled packages/parent-atlas/dist and exercises InstructionCardV1
 * (build, stale revision, tamper, authority escalation, card->workflow event)
 * and decideMemoryActionV1 guards (stale, lease, GPU admission, duplicate
 * determinism). No stores, network, GPU or writes.
 * Status: FIXTURE_ONLY on pass, BLOCKED if dist lacks the exports, FAILED otherwise.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (rel) => import(pathToFileURL(path.join(root, 'packages/parent-atlas/dist/core', rel)).href).catch(() => ({}));
const [card, cache, adapters, binding, manifestMod, dag] = await Promise.all([
  load('instruction-card-v1.js'), load('cache-recommendation-v1.js'), load('workflow-action-adapters.js'),
  load('kernel-dag-execution-binding-v1.js'), load('algorithm-execution-manifest.js'), load('adaptive-dag-plan-v1.js'),
]);

if (!card.buildInstructionCardV1 || !cache.decideMemoryActionV1 || !adapters.instructionCardToWorkflowAction) {
  console.log(JSON.stringify({ status: 'BLOCKED', reason: 'DIST_MISSING_EXPORT', hint: 'build packages/parent-atlas (tsc -p)' }));
  process.exit(2);
}

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };
const throws = (fn, needle) => { try { fn(); return false; } catch (e) { return !needle || String(e.message).includes(needle); } };

const inputChecksum = createHash('sha256').update('input').digest('hex');
const args = { symbol: 'foo', maxDepth: 2 };
const action = dag.buildAdaptiveDagPlanV1({
  planId: 'plan:smoke', queryId: 'q:smoke', dagRevision: 'dag:v1', plannerRevision: 'p:v1', classificationRevision: 'c:v1',
  actions: [{
    actionId: 'plan:smoke:step:1', actionKind: 'FETCH_POSTGRES', parentActionIds: [], inputArtifactRefs: ['evidence:1'],
    inputChecksum, parameterArtifactRef: null, parameterChecksum: binding.checksumKernelDagBoundArguments(args),
    outputContract: 'rows:v1', mutationPolicy: 'READ_ONLY', timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED',
  }],
}).actions[0];
const bound = binding.buildKernelDagExecutionBindingV1({
  action, functionId: 'fn:smoke', stepId: 'step:1', operatorId: 'op:smoke', operatorKind: 'LOOKUP_SYMBOL',
  implementationRef: 'postgres:read-symbol', boundArguments: args, expectedOutputSchemaId: 'rows:v1',
});
const manifest = (o = {}) => manifestMod.algorithmExecutionManifestSchema.parse({
  execution_id: 'exec:smoke', action_id: 'plan:smoke:step:1', dag_node_id: 'dag:semantic', stage: 'semantic_nomination',
  logical_lane: 'semantic', algorithm_class: 'exact_reference', algorithm: 'exact_gemm', geometry: 'cosine_hypersphere',
  metric: 'cosine', dimensions: 768, dtype: 'float32', compute_backend: 'pytorch_eager', compute_backend_revision: 'torch:ref',
  compilation_mode: 'eager', transport: 'local', serialization: 'numpy', cache_backend: 'none',
  source_snapshot_revision: 'snapshot:1', input_checksum: inputChecksum, device: { kind: 'cpu' }, mutation: {},
  producer_revision: 'smoke:v1', ...o,
});
const input = () => ({
  instructionCardId: 'card:smoke', descriptorRevision: 'card:v1', binding: bound, bindingRef: 'binding:smoke',
  manifest: manifest(), manifestRef: 'manifest:smoke', packetKey: 'pk:smoke', workspaceRevision: 'ws:1',
  sourceRevision: 'snapshot:1', requiredCapabilityIds: ['cpu.mmap'], availableCapabilityIds: ['cpu.mmap'], resourcePolicyRef: 'policy:cpu',
});

// --- InstructionCardV1
const built = card.buildInstructionCardV1(input());
check('card:not-admitted', built.admissionStatus === 'NOT_ADMITTED' && built.executionAuthorized === false);
check('card:no-bound-args', !JSON.stringify(built).includes('maxDepth'));
check('card:deterministic', JSON.stringify(built) === JSON.stringify(card.buildInstructionCardV1(input())));
check('card:stale-build', throws(() => card.buildInstructionCardV1({ ...input(), sourceRevision: 'snapshot:2' }), 'STALE_SOURCE_REVISION'));
check('card:stale-verify', throws(() => card.verifyInstructionCardV1(built, bound, manifest(), 'snapshot:2'), 'STALE_SOURCE_REVISION'));
check('card:tamper', throws(() => card.verifyInstructionCardV1(built, { ...bound, implementationRef: 'x' }, manifest(), 'snapshot:1'), 'BINDING_CHECKSUM_MISMATCH'));
check('card:capability', throws(() => card.buildInstructionCardV1({ ...input(), availableCapabilityIds: [] }), 'CAPABILITY_MISSING'));
check('card:escalation', throws(() => card.instructionCardV1Schema.parse({ ...built, executionAuthorized: true })));
const ev = adapters.instructionCardToWorkflowAction({
  identity: { runId: 'run:smoke', workflowId: 'wf:smoke', workflowRevision: 1, actionId: 'plan:smoke:step:1', dagNodeId: 'n:1', attempt: 1 },
  sequence: 0, card: built, producer_revision: 'smoke:v1',
});
check('card:workflow-scheduled', ev.kind === 'scheduled' && ev.metadata.admission_status === 'NOT_ADMITTED');

// --- decideMemoryActionV1
const block = (o = {}) => ({
  materializationId: 'mat:1', canonicalId: 'pk:1', sourceRevision: 'src:1', representationRevision: 'rep:1', residentBytes: 1000,
  predictedReuse: 0.99, estimatedRecomputeMs: 500, currentlyLeased: false, tier: 'CPU', recomputable: true, ...o,
});
const decide = (advisoryAction, b = block(), gpuAdmissibleBytes = 1e6) =>
  cache.decideMemoryActionV1({ block: b, currentSourceRevision: 'src:1', currentRepresentationRevision: 'rep:1', gpuAdmissibleBytes, advisoryAction });
check('cache:stale-overrides-score', decide('PROMOTE_GPU', block({ sourceRevision: 'src:0' })).action === 'REJECT_STALE');
check('cache:stale-leased-waits', decide('EVICT_RECOMPUTABLE', block({ sourceRevision: 'src:0', currentlyLeased: true })).action === 'WAIT_FOR_LEASE');
check('cache:lease-blocks-evict', decide('EVICT_RECOMPUTABLE', block({ currentlyLeased: true })).action === 'KEEP_RESIDENT');
check('cache:gpu-oom-fallback', decide('PROMOTE_GPU', block({ tier: 'NONE', residentBytes: 10 }), 5).action === 'PREFETCH_CPU');
check('cache:duplicate-deterministic', JSON.stringify(decide('KEEP_RESIDENT')) === JSON.stringify(decide('KEEP_RESIDENT')));

const status = failures.length ? 'FAILED' : 'FIXTURE_ONLY';
console.log(JSON.stringify({ schema: 'atlas.instruction-card-cache-policy-smoke.v1', status, failures, writesPerformed: false }));
process.exit(failures.length ? 1 : 0);
