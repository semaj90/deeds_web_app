#!/usr/bin/env node

/** Read-only KERNEL-DAG-GROUNDED-01 proof and fail-closed integration cases. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGroundedKernelDagAdmission } from './lib/grounded-kernel-dag-admission-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, 'docs/reports', name), 'utf8'));
const [claim, synthesis, context, map] = await Promise.all([
  read('ornith-grounded-claim-validation-v1.json'),
  read('ornith-external-evidence-synthesis-replay-v1.json'),
  read('gpu-feature-ace-context-manifest-replay-v1.json'),
  JSON.parse(await fs.readFile(path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'), 'utf8')),
]);
const graphRevision = synthesis.evidenceRefs[0].match(/^graph:(sha256:[a-f0-9]{64}):/)[1];
const validator = {
  kernel: { kernelRevision: 'kernel:grounded-admission-v1', workspaceRevision: map.workspaceRevision, graphRevision, semanticRevision: 'semantic_768:graph-feature-replay', kernelChecksum: 'grounded-kernel-v1', functions: [
    { functionId: 'consume_context_manifest', mutationClass: 'READ', cost: 1, argumentSchema: { type: 'object', required: ['contextManifestChecksum'], properties: { contextManifestChecksum: { type: 'string' } } } },
    { functionId: 'verify_grounded_claim', mutationClass: 'READ', cost: 1, requiredValidators: ['claim-verification'], argumentSchema: { type: 'object', required: ['receiptId'], properties: { receiptId: { type: 'string' } } } },
    { functionId: 'apply_patch', mutationClass: 'WRITE', cost: 1, requiredValidators: ['post-patch-check'], argumentSchema: { type: 'object', required: ['target'], properties: { target: { type: 'string' } } } },
  ], relations: [], validators: ['claim-verification'] },
  runtime: { runtimeCapabilityRevision: 'runtime:grounded-admission-v1', availableFunctionIds: ['consume_context_manifest', 'verify_grounded_claim'] },
  policy: { permissionPolicyRevision: 'policy:read-only-v1', resourceBudgetRevision: 'budget:grounded-admission-v1', permissions: [], allowedMutationClasses: ['READ'], resourceBudget: { maxNodes: 2, maxCost: 2 } },
  ordinalMap: { candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, ordinals: map.candidates.map((candidate) => candidate.candidateOrdinal) },
  graphOrdinalMap: { graphRevision, ordinals: [] },
};
const baseCandidate = { kernelRevision: validator.kernel.kernelRevision, workspaceRevision: map.workspaceRevision, graphRevision, semanticRevision: 'semantic_768:graph-feature-replay', candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, decoderRevision: 'decoder:grounded-admission-v1', nodes: [
  { nodeId: 'context', functionId: 'consume_context_manifest', arguments: { contextManifestChecksum: context.manifestChecksum }, candidateOrdinals: synthesis.candidateOrdinals, graphNodeOrdinals: [], relationIds: [], evidenceRefs: [claim.receipt.receipt_id, context.manifestChecksum] },
  { nodeId: 'verify', functionId: 'verify_grounded_claim', arguments: { receiptId: claim.receipt.receipt_id }, candidateOrdinals: synthesis.candidateOrdinals, graphNodeOrdinals: [], relationIds: [], evidenceRefs: [claim.receipt.receipt_id, context.manifestChecksum] },
], edges: [{ from: 'context', to: 'verify' }] };
const shared = { groundedClaimReceipt: claim, synthesisReceipt: synthesis, contextManifest: context, validator };
const accepted = validateGroundedKernelDagAdmission({ ...shared, candidate: baseCandidate });
const cases = { accepted: accepted.status === 'GROUNDED_TYPED_DAG_ADMISSION_PROVEN' };
const expectReject = (changeInput) => { try { const result = validateGroundedKernelDagAdmission(changeInput({ ...shared, candidate: baseCandidate })); return result.status === 'GROUNDED_TYPED_DAG_ADMISSION_REJECTED'; } catch { return true; } };
cases.contextChecksumMismatch = expectReject((input) => ({ ...input, synthesisReceipt: { ...input.synthesisReceipt, contextManifestChecksum: 'sha256:stale' } }));
cases.staleOrdinalMap = expectReject((input) => ({ ...input, validator: { ...input.validator, ordinalMap: { ...input.validator.ordinalMap, ordinalMapChecksum: 'f'.repeat(64) } } }));
cases.unknownTool = expectReject((input) => ({ ...input, candidate: { ...input.candidate, nodes: input.candidate.nodes.map((node) => node.nodeId === 'verify' ? { ...node, functionId: 'delete_database' } : node) } }));
cases.mutationDenied = expectReject((input) => ({ ...input, candidate: { ...input.candidate, nodes: input.candidate.nodes.map((node) => node.nodeId === 'verify' ? { ...node, functionId: 'apply_patch', arguments: { target: 'src/example.ts' } } : node) } }));
cases.runtimeUnavailable = expectReject((input) => ({ ...input, validator: { ...input.validator, runtime: { ...input.validator.runtime, availableFunctionIds: ['consume_context_manifest'] } } }));
const output = { schema: 'atlas.grounded-kernel-dag-admission-proof.v1', mode: 'READ_ONLY_KERNEL_DAG_GROUNDED_01', status: accepted.status === 'GROUNDED_TYPED_DAG_ADMISSION_PROVEN' && Object.values(cases).every(Boolean) ? 'GROUNDED_TYPED_DAG_ADMISSION_PROVEN' : 'GROUNDED_TYPED_DAG_ADMISSION_BLOCKED', accepted, failClosedCases: cases, controls: { mutationRequested: false, executionPerformed: false, writesPerformed: false, canonicalAuthority: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false } };
const reportPath = path.join(root, 'docs/reports/grounded-kernel-dag-admission-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, failClosedCases: cases, validatedDagChecksum: accepted.validatedDagChecksum, reportPath }, null, 2));
if (output.status !== 'GROUNDED_TYPED_DAG_ADMISSION_PROVEN') process.exitCode = 1;
