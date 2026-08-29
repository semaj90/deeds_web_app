#!/usr/bin/env node

/** Read-only proof: synthesis cannot authorize a WRITE DAG or bypass validation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildKernelDagCandidate, validateKernelDagCandidate } from './lib/kernel-dag-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const revisions = { kernel: 'kernel:mutation-barrier-v1', workspace: 'workspace:mutation-barrier-v1', graph: 'graph:mutation-barrier-v1', semantic: 'semantic_768:mutation-barrier-v1', snapshot: 'snapshot:mutation-barrier-v1', ordinal: 'a'.repeat(64) };
const base = { kernelRevision: revisions.kernel, workspaceRevision: revisions.workspace, graphRevision: revisions.graph, semanticRevision: revisions.semantic, candidateSnapshotRevision: revisions.snapshot, ordinalMapChecksum: revisions.ordinal, decoderRevision: 'decoder:mutation-barrier-v1', nodes: [{ nodeId: 'mutate', functionId: 'apply_patch', arguments: { target: 'src/example.ts' }, candidateOrdinals: [1], graphNodeOrdinals: [], relationIds: [], evidenceRefs: ['receipt:verified-claim'] }], edges: [] };
const kernel = { kernelRevision: revisions.kernel, workspaceRevision: revisions.workspace, graphRevision: revisions.graph, semanticRevision: revisions.semantic, kernelChecksum: hash('kernel'), functions: [{ functionId: 'apply_patch', mutationClass: 'WRITE', cost: 1, requiredValidators: ['post-patch-check'] }], relations: [], validators: [] };
const runtime = { runtimeCapabilityRevision: 'runtime:mutation-barrier-v1', availableFunctionIds: ['apply_patch'] };
const policy = { permissionPolicyRevision: 'policy:read-only-v1', resourceBudgetRevision: 'budget:mutation-barrier-v1', permissions: [], allowedMutationClasses: ['READ'], resourceBudget: { maxNodes: 1, maxCost: 1 } };
const ordinalMap = { candidateSnapshotRevision: revisions.snapshot, ordinalMapChecksum: revisions.ordinal, ordinals: [1] };
const graphOrdinalMap = { graphRevision: revisions.graph, ordinals: [] };
const candidate = buildKernelDagCandidate(base);
const receipt = validateKernelDagCandidate({ candidate, kernel, runtime, policy, ordinalMap, graphOrdinalMap });
const output = { schema: 'atlas.mutation-authorization-barrier-proof.v1', mode: 'READ_ONLY_MUTATION_AUTHORIZATION_PROBE', status: receipt.status === 'REJECTED' && receipt.unauthorizedMutations.length > 0 && receipt.missingValidators.length > 0 ? 'MUTATION_AUTHORIZATION_BARRIER_PROVEN' : 'MUTATION_AUTHORIZATION_BARRIER_BLOCKED', rejection: { status: receipt.status, unauthorizedMutations: receipt.unauthorizedMutations, missingValidators: receipt.missingValidators }, controls: { synthesisCanAuthorizeWrite: false, writeDagAccepted: false, applyAttempted: false, canonicalAuthority: false, writesPerformed: false } };
const reportPath = path.join(root, 'docs/reports/mutation-authorization-barrier-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, unauthorizedMutations: receipt.unauthorizedMutations, missingValidators: receipt.missingValidators, reportPath }, null, 2));
if (output.status !== 'MUTATION_AUTHORIZATION_BARRIER_PROVEN') process.exitCode = 1;
