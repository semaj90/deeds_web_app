import assert from 'node:assert/strict';
import { describe, it, todo } from 'node:test';
import {
  buildKernelDagCandidate,
  toTypedRepairDag,
  validateKernelDagCandidate,
} from './lib/kernel-dag-v1.mjs';
import { validateGroundedKernelDagAdmission } from './lib/grounded-kernel-dag-admission-v1.mjs';

// Same fixture shape as prove-kernel-dag-validator-v1.mjs, extended with one WRITE function so the
// mutation barrier can be exercised.
const base = {
  kernelRevision: 'kernel:chain-r1', workspaceRevision: 'workspace:chain-r1', graphRevision: 'graph:chain-r1',
  semanticRevision: 'semantic:768:r1', candidateSnapshotRevision: 'candidate:chain-r1', ordinalMapChecksum: 'a'.repeat(64),
  decoderRevision: 'decoder:chain-r1',
  nodes: [
    { nodeId: 'resolve', functionId: 'resolve_code_evidence', arguments: { query: 'error' }, candidateOrdinals: [1], graphNodeOrdinals: [10], relationIds: ['rel:uses'], evidenceRefs: ['evidence:1'] },
    { nodeId: 'verify', functionId: 'run_verification', arguments: { command: 'npm test' }, candidateOrdinals: [1], graphNodeOrdinals: [10], relationIds: [], evidenceRefs: ['evidence:1'] },
  ],
  edges: [{ from: 'resolve', to: 'verify' }],
};
const kernel = {
  kernelRevision: base.kernelRevision, workspaceRevision: base.workspaceRevision, graphRevision: base.graphRevision,
  semanticRevision: base.semanticRevision, kernelChecksum: 'b'.repeat(64),
  functions: [
    { functionId: 'resolve_code_evidence', mutationClass: 'READ', cost: 1, argumentSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } },
    { functionId: 'run_verification', mutationClass: 'READ', cost: 2, requiredValidators: ['verification-result'], argumentSchema: { type: 'object', required: ['command'], properties: { command: { type: 'string' } } } },
    { functionId: 'apply_patch', mutationClass: 'WRITE', cost: 3, argumentSchema: { type: 'object', required: ['file'], properties: { file: { type: 'string' } } } },
  ],
  relations: [{ relationId: 'rel:uses' }],
  validators: ['verification-result'],
};
const runtime = { runtimeCapabilityRevision: 'runtime:chain-r1', availableFunctionIds: ['resolve_code_evidence', 'run_verification', 'apply_patch'] };
const policy = {
  permissionPolicyRevision: 'policy:chain-r1', resourceBudgetRevision: 'budget:chain-r1', permissions: [],
  allowedMutationClasses: ['READ'], resourceBudget: { maxNodes: 4, maxCost: 10 },
};
const ordinalMap = { candidateSnapshotRevision: base.candidateSnapshotRevision, ordinalMapChecksum: base.ordinalMapChecksum, ordinals: [1] };
const graphOrdinalMap = { graphRevision: base.graphRevision, ordinals: [10] };

function validate(candidate, overrides = {}) {
  return validateKernelDagCandidate({ candidate, kernel, runtime, policy, ordinalMap, graphOrdinalMap, ...overrides });
}

describe('KernelDagCandidate -> validation -> typed DAG (read-only chain)', () => {
  it('accepts the read-only fixture and yields a typed DAG with a validation checksum', () => {
    const candidate = buildKernelDagCandidate(base);
    const receipt = validate(candidate);
    assert.equal(receipt.status, 'ACCEPTED');
    assert.ok(receipt.validatedDagChecksum);
    const typed = toTypedRepairDag(candidate, receipt);
    assert.equal(typed.schema, 'atlas.typed-repair-dag.v1');
    assert.equal(typed.canonicalAuthority, false);
  });

  it('refuses to build a typed DAG from a rejected receipt', () => {
    const candidate = buildKernelDagCandidate({ ...base, workspaceRevision: 'workspace:stale' });
    const receipt = validate(candidate);
    assert.notEqual(receipt.status, 'ACCEPTED');
    assert.throws(() => toTypedRepairDag(candidate, receipt), /TYPED_REPAIR_DAG_REQUIRES_ACCEPTED_VALIDATION/);
  });

  it('rejects a WRITE function when the policy allows only READ (mutation barrier)', () => {
    const writeNode = {
      nodeId: 'patch', functionId: 'apply_patch', arguments: { file: 'a.ts' },
      candidateOrdinals: [1], graphNodeOrdinals: [10], relationIds: [], evidenceRefs: ['evidence:1'],
    };
    const candidate = buildKernelDagCandidate({ ...base, nodes: [...base.nodes, writeNode], edges: [{ from: 'resolve', to: 'verify' }, { from: 'verify', to: 'patch' }] });
    const receipt = validate(candidate);
    assert.equal(receipt.status, 'REJECTED');
    assert.ok(receipt.unauthorizedMutations.length > 0);
  });

  it('accepts the same WRITE node only once the policy explicitly allows WRITE', () => {
    const writeNode = {
      nodeId: 'patch', functionId: 'apply_patch', arguments: { file: 'a.ts' },
      candidateOrdinals: [1], graphNodeOrdinals: [10], relationIds: [], evidenceRefs: ['evidence:1'],
    };
    const candidate = buildKernelDagCandidate({ ...base, nodes: [...base.nodes, writeNode], edges: [{ from: 'resolve', to: 'verify' }, { from: 'verify', to: 'patch' }] });
    const receipt = validate(candidate, { policy: { ...policy, allowedMutationClasses: ['READ', 'WRITE'] } });
    // Policy permits the write class, but the DAG still needs a repair approval before execution.
    assert.equal(receipt.unauthorizedMutations.length, 0);
  });

  it('admission refuses to run without a proven grounded-claim receipt', () => {
    assert.throws(() => validateGroundedKernelDagAdmission({ candidate: base }));
  });
});

describe('approval link (not built yet)', () => {
  todo('an ACCEPTED typed DAG cannot reach a repair execution without a recorded approval whose plan matches the DAG');
  todo('the approved mutation plan is derived from the typed DAG, not written by hand');
});
