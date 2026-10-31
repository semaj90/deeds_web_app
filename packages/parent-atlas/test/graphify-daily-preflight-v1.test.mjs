import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATLAS_DIAGNOSTIC_CAPABILITIES_V1,
  buildGraphifyDailyPreflightPlanV1,
  hostPreflightReceiptV1Schema,
  resolveAtlasDiagnosticCapabilityV1,
} from '../dist/index.js';

const pass = (name) => ({ status: 'PASS', evidenceRefs: [`receipt:${name}`], revision: `rev:${name}` });
const unverified = (name) => ({ status: 'UNVERIFIED', evidenceRefs: [], revision: null });

function input(overrides = {}) {
  return {
    workflowId: 'workflow:daily-graphify',
    runId: 'run:2026-10-30',
    workspaceRevision: pass('workspace'),
    sourceRevision: pass('source'),
    repositoryIdentity: pass('repo-root'),
    membershipAdmission: pass('membership'),
    scopePolicy: pass('scope-policy'),
    executionAuthority: pass('owner'),
    graphSnapshotRevision: pass('snapshot'),
    topologyBindings: pass('topology'),
    astLineage: pass('ast'),
    packetChunkLineage: pass('packet-chunk'),
    schemaOwnership: pass('schema'),
    lexicalLane: pass('lexical'),
    hostResources: pass('host'),
    gpuResources: pass('gpu'),
    ...overrides,
  };
}

function hostPreflightReceipt(overrides = {}) {
  return {
    schema: 'atlas.host-preflight.v1',
    observedAtUtc: '2026-10-30T12:00:00.000Z',
    host: {
      status: 'AVAILABLE', osVersion: '10.0', osCaption: 'Windows', freeRamMiB: 4096,
      cpu: [], disks: [], topProcesses: [],
    },
    gpu: { status: 'AVAILABLE', output: ['RTX 3060 Ti, 580.88, 8192, 4096, 0'] },
    docker: {
      containers: { status: 'AVAILABLE', output: [] },
      stats: { status: 'AVAILABLE', output: [] },
    },
    wsl: {
      runningDistributions: { status: 'AVAILABLE', output: ['docker-desktop'] },
      configuredLimits: { status: 'UNVERIFIED', source: 'C:/Users/test/.wslconfig', memory: null, processors: null, swap: null },
      runtimeResourceUsage: { status: 'UNVERIFIED', reason: 'No stopped distro is started for telemetry.' },
    },
    authority: 'DIAGNOSTIC_ONLY_NO_ADMISSION_OR_EXECUTION_AUTHORITY',
    ...overrides,
  };
}

test('host preflight receipt validates the complete strict diagnostic envelope', () => {
  assert.equal(hostPreflightReceiptV1Schema.parse(hostPreflightReceipt()).schema, 'atlas.host-preflight.v1');
  assert.equal(hostPreflightReceiptV1Schema.safeParse({ ...hostPreflightReceipt(), approved: true }).success, false);
  assert.equal(hostPreflightReceiptV1Schema.safeParse({ ...hostPreflightReceipt(), schema: 'wrong' }).success, false);
});

test('G7/G8 failures block graph projection without disabling independent lexical retrieval', () => {
  const plan = buildGraphifyDailyPreflightPlanV1(input({
    repositoryIdentity: unverified('repositoryIdentity'),
    graphSnapshotRevision: { status: 'FAIL', evidenceRefs: ['audit:g8'], revision: null },
  }));
  assert.equal(plan.graphProjection, 'BLOCKED');
  assert.deepEqual(plan.blockers, ['repositoryIdentity:UNVERIFIED', 'graphSnapshotRevision:FAIL']);
  assert.equal(plan.lexicalRetrieval, 'AVAILABLE');
});

test('a fully evidenced diagnostic plan is checksummed but never grants apply authority', () => {
  const plan = buildGraphifyDailyPreflightPlanV1(input());
  assert.equal(plan.graphProjection, 'ELIGIBLE_FOR_REVIEW');
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
  assert.equal('apply' in plan, false);
});

test('missing GPU resources are reported separately from graph identity and lexical availability', () => {
  const plan = buildGraphifyDailyPreflightPlanV1(input({
    gpuResources: { status: 'FAIL', evidenceRefs: ['health:gpu'], revision: null },
  }));
  assert.equal(plan.compute, 'UNAVAILABLE');
  assert.equal(plan.lexicalRetrieval, 'AVAILABLE');
  assert.equal(plan.graphProjection, 'ELIGIBLE_FOR_REVIEW');
});

test('passing gates without evidence or a revision are rejected', () => {
  assert.throws(() => buildGraphifyDailyPreflightPlanV1(input({
    graphSnapshotRevision: { status: 'PASS', evidenceRefs: [], revision: null },
  })));
});

test('unknown input fields are rejected instead of entering the plan', () => {
  assert.throws(() => buildGraphifyDailyPreflightPlanV1({ ...input(), command: 'arbitrary shell' }));
});

test('capability IDs resolve to fixed shell-free commands and argument lists', () => {
  const capability = resolveAtlasDiagnosticCapabilityV1('graphify.snapshot.contract-tests');
  assert.equal(capability.executable, 'node');
  assert.equal(capability.mutationClass, 'READ_ONLY_TEST');
  assert.equal(ATLAS_DIAGNOSTIC_CAPABILITIES_V1.some((item) => 'shell' in item), false);
  assert.throws(() => resolveAtlasDiagnosticCapabilityV1(
    'graphify.snapshot.contract-tests',
    ['--test', 'anything-that-agent-invented.mjs'],
  ), /ATLAS_CAPABILITY_ARGUMENTS_MISMATCH/);
  assert.throws(() => resolveAtlasDiagnosticCapabilityV1('arbitrary-command'), /ATLAS_CAPABILITY_UNKNOWN/);
});

test('every registered diagnostic capability declares an owner, authority, proof, and bounded read-only policy', () => {
  const ids = new Set();
  for (const capability of ATLAS_DIAGNOSTIC_CAPABILITIES_V1) {
    assert.equal(ids.has(capability.id), false, `duplicate capability ${capability.id}`);
    ids.add(capability.id);
    assert.ok(capability.owner);
    assert.ok(capability.executionIdentity);
    assert.ok(capability.inputAuthority);
    assert.ok(capability.requiredProofs.length > 0);
    assert.equal(capability.databaseAccess, 'NONE');
    assert.equal(capability.approvalRequirement, 'NONE_READ_ONLY');
    assert.ok(capability.timeoutMs > 0);
    assert.ok(capability.maxOutputBytes > 0);
    assert.ok(capability.maxMemoryMiB > 0);
  }
});

test('capability registry and nested command arguments are immutable at runtime', () => {
  const capability = ATLAS_DIAGNOSTIC_CAPABILITIES_V1[0];
  assert.equal(Object.isFrozen(ATLAS_DIAGNOSTIC_CAPABILITIES_V1), true);
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(Object.isFrozen(capability.args), true);
  assert.equal(Object.isFrozen(capability.requiredProofs), true);
  assert.throws(() => { capability.executable = 'powershell.exe'; }, TypeError);
  assert.throws(() => { capability.args[0] = '-Command'; }, TypeError);
  assert.throws(() => { ATLAS_DIAGNOSTIC_CAPABILITIES_V1.push(capability); }, TypeError);
});
