import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { classifyClaim, VERDICT } from './validate-error-signal-evidence-v1.mjs';
import { proposalFor, verifyReceipt, REGISTRY_ACTION } from './bridge-error-signal-to-repair-proposal-v1.mjs';

function sealed(body) {
  const receipt = { ...body, selfDigest: null };
  receipt.selfDigest = `sha256:${createHash('sha256').update(JSON.stringify({ ...receipt, selfDigest: undefined })).digest('hex')}`;
  return receipt;
}

const validInput = () => sealed({
  schema: 'atlas.error_signal_evidence.v1',
  readOnly: true,
  writesPerformed: 0,
  rows: [],
});

test('relation name is read from either message form', () => {
  assert.equal(classifyClaim({ error_class: 'schema_mismatch', evidence: { message: 'relation does not exist: atlas_packets' } }).checkKey, 'atlas_packets');
  assert.equal(classifyClaim({ error_class: 'schema_mismatch', evidence: { message: 'relation "foo.bar" does not exist' } }).checkKey, 'foo.bar');
});

test('column claims and retrieval misses are classified', () => {
  assert.equal(classifyClaim({ error_class: 'schema_mismatch', evidence: { message: 'column "community_id" does not exist' } }).kind, 'COLUMN_EXISTS');
  assert.equal(classifyClaim({ error_class: 'retrieval_miss', evidence: { message: '0 rows returned' } }).verdict, VERDICT.UNVERIFIED);
});

test('audit recommendations are never runtime claims', () => {
  const c = classifyClaim({ error_class: 'audit_recommendation', evidence: { message: 'consolidate modules' } });
  assert.equal(c.verdict, VERDICT.PROPOSAL_ONLY);
});

test('only reproducing verdicts are admitted, always non-executable, mapped to AWAIT_OPERATOR', () => {
  const admitted = proposalFor({ id: 1, errorClass: 'schema_mismatch', verdict: VERDICT.PARTIALLY_REPRODUCED });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.registryActionId, 'AWAIT_OPERATOR');
  assert.equal(admitted.reviewKind, 'IDENTIFY_OWNING_QUERY');
  assert.equal(admitted.executionAuthorized, false);
  assert.equal(admitted.revisionQualified, false);

  assert.equal(proposalFor({ id: 2, errorClass: 'schema_mismatch', verdict: VERDICT.NOT_REPRODUCED_NOW }).admitted, false);
  assert.equal(proposalFor({ id: 3, errorClass: 'retrieval_miss', verdict: VERDICT.UNVERIFIED }).admitted, false);
  assert.equal(proposalFor({ id: 4, errorClass: 'audit_recommendation', verdict: VERDICT.PROPOSAL_ONLY }).admitted, false);
});

test('bridge accepts a sealed read-only receipt', () => {
  assert.equal(verifyReceipt(validInput()), true);
});

test('bridge refuses a tampered receipt', () => {
  const r = validInput();
  r.rows.push({ id: 9, verdict: VERDICT.REPRODUCES_NOW });
  assert.throws(() => verifyReceipt(r), /digest mismatch/);
});

test('bridge refuses a receipt that reports writes', () => {
  const r = sealed({ schema: 'atlas.error_signal_evidence.v1', readOnly: true, writesPerformed: 1, rows: [] });
  assert.throws(() => verifyReceipt(r), /not a verified read-only receipt/);
});

test('no admitted proposal can be executable or revision-unqualified', () => {
  const rows = [
    { id: 1, errorClass: 'schema_mismatch', verdict: VERDICT.REPRODUCES_NOW },
    { id: 2, errorClass: 'schema_mismatch', verdict: VERDICT.PARTIALLY_REPRODUCED },
    { id: 3, errorClass: 'schema_mismatch', verdict: VERDICT.NOT_REPRODUCED_NOW },
  ];
  const admitted = rows.map(proposalFor).filter((d) => d.admitted);
  assert.equal(admitted.length, 2);
  for (const p of admitted) {
    assert.equal(p.dryRun, true);
    assert.equal(p.executionAuthorized, false);
    assert.equal(p.revisionQualified, false);
    assert.equal(p.registryActionId, REGISTRY_ACTION);
    assert.equal(p.consumer, 'NONE_AVAILABLE');
  }
});
