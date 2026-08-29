#!/usr/bin/env node

/** Read-only proof: verified ContextManifest/claim receipt -> accepted bounded DAG. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildKernelDagCandidate, validateKernelDagCandidate } from './lib/kernel-dag-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const map = JSON.parse(await fs.readFile(path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'), 'utf8'));
const synthesis = JSON.parse(await fs.readFile(path.join(root, 'docs/reports/ornith-external-evidence-synthesis-replay-v1.json'), 'utf8'));
const claim = JSON.parse(await fs.readFile(path.join(root, 'docs/reports/ornith-grounded-claim-validation-v1.json'), 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
if (synthesis.status !== 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN') throw new Error('AGENT_DAG_REQUIRES_SYNTHESIS_REPLAY');
if (claim.status !== 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN' || claim.receipt?.verdict !== 'VERIFIED') throw new Error('AGENT_DAG_REQUIRES_VERIFIED_CLAIM');

const graphRevision = String(synthesis.evidenceRefs[0] ?? '').match(/^graph:(sha256:[a-f0-9]{64}):/)?.[1];
if (!graphRevision) throw new Error('AGENT_DAG_GRAPH_REVISION_MISSING');
const evidenceRefs = [claim.receipt.receipt_id, synthesis.contextManifestChecksum];
const selectedOrdinals = [...synthesis.candidateOrdinals].sort((a, b) => a - b);
const base = {
  kernelRevision: 'kernel:ornith-readonly-v1', workspaceRevision: map.workspaceRevision, graphRevision, semanticRevision: 'semantic_768:graph-feature-replay',
  candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, decoderRevision: 'decoder:ornith-json-v1',
  nodes: [
    { nodeId: 'context', functionId: 'consume_context_manifest', arguments: { contextManifestChecksum: synthesis.contextManifestChecksum }, candidateOrdinals: selectedOrdinals, graphNodeOrdinals: [], relationIds: [], evidenceRefs },
    { nodeId: 'verify', functionId: 'verify_grounded_claim', arguments: { receiptId: claim.receipt.receipt_id }, candidateOrdinals: selectedOrdinals, graphNodeOrdinals: [], relationIds: [], evidenceRefs },
  ], edges: [{ from: 'context', to: 'verify' }],
};
const kernel = {
  kernelRevision: base.kernelRevision, workspaceRevision: base.workspaceRevision, graphRevision: base.graphRevision, semanticRevision: base.semanticRevision, kernelChecksum: 'kernel-checksum:ornith-readonly-v1',
  functions: [
    { functionId: 'consume_context_manifest', mutationClass: 'READ', cost: 1, argumentSchema: { type: 'object', required: ['contextManifestChecksum'], properties: { contextManifestChecksum: { type: 'string' } } } },
    { functionId: 'verify_grounded_claim', mutationClass: 'READ', cost: 1, requiredValidators: ['claim-verification'], argumentSchema: { type: 'object', required: ['receiptId'], properties: { receiptId: { type: 'string' } } } },
  ], relations: [], validators: ['claim-verification'],
};
const runtime = { runtimeCapabilityRevision: 'runtime:ornith-readonly-v1', availableFunctionIds: ['consume_context_manifest', 'verify_grounded_claim'] };
const policy = { permissionPolicyRevision: 'policy:read-only-v1', resourceBudgetRevision: 'budget:ornith-readonly-v1', permissions: [], allowedMutationClasses: ['READ'], resourceBudget: { maxNodes: 2, maxCost: 2 } };
const ordinalMap = { candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, ordinals: map.candidates.map((candidate) => candidate.candidateOrdinal) };
const graphOrdinalMap = { graphRevision, ordinals: [] };
const candidate = buildKernelDagCandidate(base);
const receipt = validateKernelDagCandidate({ candidate, kernel, runtime, policy, ordinalMap, graphOrdinalMap });
const output = {
  schema: 'atlas.ornith-agent-dag-readonly-gate.v1', mode: 'READ_ONLY_AGENT_DAG_VALIDATION',
  status: receipt.status === 'ACCEPTED' && candidate.nodes.every((node) => node.functionId !== 'mutate') ? 'ORNITH_AGENT_DAG_READONLY_GATE_PROVEN' : 'ORNITH_AGENT_DAG_READONLY_GATE_BLOCKED',
  candidateChecksum: candidate.checksum, validationReceipt: receipt, candidateOrdinals: selectedOrdinals,
  evidenceRefs, mutationNodes: candidate.nodes.filter((node) => node.functionId === 'mutate').map((node) => node.nodeId),
  controls: { readOnly: true, mutationNodes: 0, executableRepairDagCreated: false, canonicalAuthority: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false },
};
const outputPath = path.join(root, 'docs/reports/ornith-agent-dag-readonly-gate-v1.json');
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, validationStatus: receipt.status, candidateOrdinals: selectedOrdinals, mutationNodes: output.mutationNodes.length, reportPath: outputPath }, null, 2));
if (output.status !== 'ORNITH_AGENT_DAG_READONLY_GATE_PROVEN') process.exitCode = 1;
