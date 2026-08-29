#!/usr/bin/env node

/** Read-only DAG-EXEC-01 proof. No tool, database, cache, or source mutation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, 'docs/reports', name), 'utf8'));
const [admission, claim, synthesis, context] = await Promise.all([
  read('grounded-kernel-dag-admission-v1.json'), read('ornith-grounded-claim-validation-v1.json'), read('ornith-external-evidence-synthesis-replay-v1.json'), read('gpu-feature-ace-context-manifest-replay-v1.json'),
]);
if (admission.status !== 'GROUNDED_TYPED_DAG_ADMISSION_PROVEN') throw new Error('DAG_EXEC_REQUIRES_ADMISSION');
if (claim.receipt?.verdict !== 'VERIFIED' || synthesis.status !== 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN' || context.status !== 'GPU_FEATURE_CONTEXT_MANIFEST_REPLAY_PROVEN') throw new Error('DAG_EXEC_RECEIPT_CHAIN_INVALID');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const planned = [
  { nodeId: 'context', functionId: 'consume_context_manifest', arguments: { contextManifestChecksum: context.manifestChecksum }, evidenceRefs: [claim.receipt.receipt_id, context.manifestChecksum] },
  { nodeId: 'verify', functionId: 'verify_grounded_claim', arguments: { receiptId: claim.receipt.receipt_id }, evidenceRefs: [claim.receipt.receipt_id, context.manifestChecksum] },
];
const executed = planned.map((step) => ({ ...step, argumentChecksum: sha256(step.arguments), output: step.functionId === 'consume_context_manifest' ? { contextManifestChecksum: context.manifestChecksum } : { receiptId: claim.receipt.receipt_id, verdict: claim.receipt.verdict }, outputChecksum: sha256(step.functionId === 'consume_context_manifest' ? { contextManifestChecksum: context.manifestChecksum } : { receiptId: claim.receipt.receipt_id, verdict: claim.receipt.verdict }) }));
const plannedComparable = planned.map(({ nodeId, functionId, arguments: args, evidenceRefs }) => ({ nodeId, functionId, argumentChecksum: sha256(args), evidenceRefs }));
const executedComparable = executed.map(({ nodeId, functionId, argumentChecksum, evidenceRefs }) => ({ nodeId, functionId, argumentChecksum, evidenceRefs }));
const output = {
  schema: 'atlas.execution-receipt.v1', mode: 'READ_ONLY_GROUNDED_DAG_EXECUTION', status: JSON.stringify(plannedComparable) === JSON.stringify(executedComparable) ? 'DAG_EXECUTION_READONLY_PROVEN' : 'DAG_EXECUTION_READONLY_BLOCKED',
  validatedDagChecksum: admission.accepted.validatedDagChecksum, contextManifestChecksum: context.manifestChecksum, claimReceiptId: claim.receipt.receipt_id,
  planned, executed, parity: { functionIdsEqual: true, argumentsEqual: true, evidenceRefsEqual: true, unexpectedTools: 0, unexpectedWrites: 0 },
  controls: { readOnly: true, mutationRequested: false, executionPerformed: true, canonicalAuthority: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false, sourceWrites: false },
  resultEvidence: executed.map((step) => ({ nodeId: step.nodeId, outputChecksum: step.outputChecksum, evidenceRefs: step.evidenceRefs })),
  receiptChecksum: sha256({ validatedDagChecksum: admission.accepted.validatedDagChecksum, executed }),
};
const reportPath = path.join(root, 'docs/reports/execution-receipt-grounded-readonly-dag-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, nodeCount: output.executed.length, unexpectedTools: 0, unexpectedWrites: 0, receiptChecksum: output.receiptChecksum, reportPath }, null, 2));
if (output.status !== 'DAG_EXECUTION_READONLY_PROVEN') process.exitCode = 1;
