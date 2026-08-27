import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildKernelDagCandidate, toTypedRepairDag, validateKernelDagCandidate } from './lib/kernel-dag-v1.mjs';

const base = {
  kernelRevision: 'kernel:fixture-r1', workspaceRevision: 'workspace:fixture-r1', graphRevision: 'graph:fixture-r1', semanticRevision: 'semantic:768:r1',
  candidateSnapshotRevision: 'candidate:fixture-r1', ordinalMapChecksum: 'a'.repeat(64), decoderRevision: 'decoder:fixture-r1',
  nodes: [
    { nodeId: 'resolve', functionId: 'resolve_code_evidence', arguments: { query: 'error' }, candidateOrdinals: [1], graphNodeOrdinals: [10], relationIds: ['rel:uses'], evidenceRefs: ['evidence:1'] },
    { nodeId: 'verify', functionId: 'run_verification', arguments: { command: 'npm test' }, candidateOrdinals: [1], graphNodeOrdinals: [10], relationIds: [], evidenceRefs: ['evidence:1'] },
  ], edges: [{ from: 'resolve', to: 'verify' }],
};
const kernel = {
  kernelRevision: base.kernelRevision, workspaceRevision: base.workspaceRevision, graphRevision: base.graphRevision, semanticRevision: base.semanticRevision, kernelChecksum: 'b'.repeat(64),
  functions: [
    { functionId: 'resolve_code_evidence', mutationClass: 'READ', cost: 1, argumentSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } },
    { functionId: 'run_verification', mutationClass: 'READ', cost: 2, requiredValidators: ['verification-result'], argumentSchema: { type: 'object', required: ['command'], properties: { command: { type: 'string' } } } },
  ], relations: [{ relationId: 'rel:uses' }], validators: ['verification-result'],
};
const runtime = { runtimeCapabilityRevision: 'runtime:fixture-r1', availableFunctionIds: ['resolve_code_evidence', 'run_verification'] };
const policy = { permissionPolicyRevision: 'policy:fixture-r1', resourceBudgetRevision: 'budget:fixture-r1', permissions: [], allowedMutationClasses: ['READ'], resourceBudget: { maxNodes: 4, maxCost: 8 } };
const ordinalMap = { candidateSnapshotRevision: base.candidateSnapshotRevision, ordinalMapChecksum: base.ordinalMapChecksum, ordinals: [1] };
const graphOrdinalMap = { graphRevision: base.graphRevision, ordinals: [10] };

function check(label, candidate, overrides = {}, expected = label === 'accepted' ? 'ACCEPTED' : 'REJECTED') {
  const receipt = validateKernelDagCandidate({ candidate, kernel, runtime, policy, ordinalMap, graphOrdinalMap, ...overrides });
  assert.equal(receipt.status, expected, label);
  return receipt;
}

const acceptedCandidate = buildKernelDagCandidate(base);
const accepted = check('accepted', acceptedCandidate);
const typed = toTypedRepairDag(acceptedCandidate, accepted);
assert.equal(typed.schema, 'atlas.typed-repair-dag.v1');
assert.equal(typed.executable, true);

const cases = {};
cases.accepted = accepted.status === 'ACCEPTED';
cases.cycle = check('cycle', buildKernelDagCandidate({ ...base, edges: [{ from: 'resolve', to: 'verify' }, { from: 'verify', to: 'resolve' }] })).cycleDetected;
cases.unknownFunction = check('unknown function', buildKernelDagCandidate({ ...base, nodes: [{ ...base.nodes[0], functionId: 'delete_database' }, base.nodes[1] ] })).unknownFunctions.includes('delete_database');
cases.forbiddenRelation = check('forbidden relation', buildKernelDagCandidate({ ...base, nodes: [{ ...base.nodes[0], relationIds: ['rel:forbidden'] }, base.nodes[1] ] })).rejectedRelations.includes('rel:forbidden');
cases.staleCandidateOrdinal = check('stale candidate ordinal', buildKernelDagCandidate({ ...base, nodes: [{ ...base.nodes[0], candidateOrdinals: [99] }, base.nodes[1] ] })).argumentIdentityFailures.some((v) => v.includes('candidate:99'));
cases.staleGraphOrdinal = check('stale graph ordinal', buildKernelDagCandidate({ ...base, nodes: [{ ...base.nodes[0], graphNodeOrdinals: [99] }, base.nodes[1] ] })).argumentIdentityFailures.some((v) => v.includes('graph:99'));
cases.workspaceMismatch = check('workspace mismatch', buildKernelDagCandidate({ ...base, workspaceRevision: 'workspace:old' })).revisionMismatches.includes('workspaceRevision');
cases.graphMismatch = check('graph mismatch', buildKernelDagCandidate({ ...base, graphRevision: 'graph:old' })).revisionMismatches.includes('graphRevision');
cases.semanticMismatch = check('semantic mismatch', buildKernelDagCandidate({ ...base, semanticRevision: 'semantic:384:r1' })).revisionMismatches.includes('semanticRevision');
cases.missingEvidence = check('missing evidence', buildKernelDagCandidate({ ...base, nodes: [{ ...base.nodes[0], evidenceRefs: [] }, base.nodes[1]] })).missingEvidence.includes('resolve');
cases.argumentSchema = check('argument schema', buildKernelDagCandidate({ ...base, nodes: [{ ...base.nodes[0], arguments: { query: 42 } }, base.nodes[1]] })).argumentSchemaFailures.length > 0;
cases.unauthorizedMutation = check('unauthorized mutation', buildKernelDagCandidate(base), { policy: { ...policy, allowedMutationClasses: ['WRITE'] } }).unauthorizedMutations.length > 0;
cases.missingValidator = check('missing validator', buildKernelDagCandidate(base), { kernel: { ...kernel, validators: [] } }).missingValidators.length > 0;
cases.runtimeUnavailable = check('runtime unavailable', buildKernelDagCandidate(base), { runtime: { ...runtime, availableFunctionIds: ['resolve_code_evidence'] } }).runtimeCapabilitiesMissing.includes('run_verification');
cases.budgetOverflow = check('budget overflow', buildKernelDagCandidate(base), { policy: { ...policy, resourceBudget: { maxNodes: 1, maxCost: 1 } } }).resourceBudgetExceeded.length > 0;
assert(Object.values(cases).every(Boolean));

const report = {
  schema: 'atlas.kernel-dag-validator-proof-receipt.v1', status: 'PROVEN_FIXTURE_ONLY', readOnly: true, canonicalAuthority: false, writesPerformed: false,
  checks: cases, acceptedValidatedDagChecksum: accepted.validatedDagChecksum, candidateChecksum: acceptedCandidate.checksum,
  contract: { candidateSchema: 'atlas.kernel-dag-candidate.v1', receiptSchema: 'atlas.kernel-dag-validation-receipt.v1', typedRepairSchema: 'atlas.typed-repair-dag.v1', authority: 'model proposes; frozen kernel + lineage + runtime + policy authorize' },
  notProven: ['live lineage-qualified CandidateOrdinal', 'live runtime capability receipt', 'live tool execution', 'neural decoder checkpoint'],
};
const output = path.resolve('docs/reports/kernel-dag-validator-v1.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath: output }, null, 2));
