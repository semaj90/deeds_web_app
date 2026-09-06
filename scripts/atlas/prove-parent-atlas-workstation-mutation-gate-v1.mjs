#!/usr/bin/env node

/**
 * Prove the future mutation boundary without performing a mutation.
 * A real mutator must supply the same plan/validation checksums and an
 * explicit authorization; otherwise the decision is rejected.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'reports', 'parent-atlas-workstation-synthesis-report-v1.json'), 'utf8'));
const validation = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'reports', 'parent-atlas-workstation-plan-only-proof-v1.json'), 'utf8'));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const validate = (candidate, receipt, authorized) => {
  if (!authorized) return { status: 'REJECTED_NO_AUTHORIZATION', reason: 'explicit authorization is required' };
  if (candidate.reportChecksum !== receipt.expectedReportChecksum) return { status: 'STALE_PLAN_REJECT', reason: 'plan checksum does not match validation receipt' };
  if (receipt.status !== 'PROVEN' || receipt.noDatastoreWrites !== true) return { status: 'REJECTED_VALIDATION_RECEIPT', reason: 'successful zero-write validation receipt required' };
  return { status: 'AUTHORIZED_FOR_SEPARATE_MUTATOR', reason: 'adapter may proceed only after an independent mutation scope check' };
};
const noAuthorization = validate(plan, { expectedReportChecksum: plan.reportChecksum, status: validation.status, noDatastoreWrites: validation.noDatastoreWrites }, false);
const stalePlan = validate({ reportChecksum: sha256(`${plan.reportChecksum}:stale`) }, { expectedReportChecksum: plan.reportChecksum, status: validation.status, noDatastoreWrites: validation.noDatastoreWrites }, true);
const proof = {
  schema: 'atlas.parent-atlas-workstation-mutation-gate-proof.v1',
  status: noAuthorization.status === 'REJECTED_NO_AUTHORIZATION' && stalePlan.status === 'STALE_PLAN_REJECT' ? 'PROVEN' : 'FAILED',
  noAuthorization,
  stalePlan,
  validationReceiptStatus: validation.status,
  mutationPerformed: false,
  writes: { taskLedgers: 0, sourceFiles: 0, postgres: 0, qdrant: 0, neo4j: 0, cache: 0, modelCalls: 0 },
  evidence: [
    'docs/reports/parent-atlas-workstation-synthesis-report-v1.json',
    'docs/reports/parent-atlas-workstation-plan-only-proof-v1.json',
  ],
};
proof.proofChecksum = sha256(JSON.stringify(proof));
const out = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-mutation-gate-proof-v1.json');
fs.writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out }, null, 2));
if (proof.status !== 'PROVEN') process.exit(1);
