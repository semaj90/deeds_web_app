import test from 'node:test';
import assert from 'node:assert/strict';
import { admitObservationFeaturePlanRowV2, admitObservationFeaturePlanRowsV2 } from './observation-feature-lineage-admission-v2.mjs';

const hash = (c) => `sha256:${c.repeat(64)}`;
const WS = hash('c');
const row = (o = {}) => ({
  packetKey: 'packet:1', sourceRef: 'src/a.ts', sourceRevision: hash('b'), featureRevision: 'ast-features:v1',
  registryRevision: 'registry-r7', inputDigest: 'a'.repeat(64), evidenceRefs: ['source-span:src/a.ts:0-12'],
  sourceVersionReceiptId: 'svr:1', ...o,
});
const goodApproval = (rev) => ({ status: 'APPROVAL_BINDINGS_VALIDATED_NOT_AUTHENTICATED', registry_revision: rev, runtime_eligible: false, canonical_authority: false });
const goodReceipt = () => ({ sourceRef: 'src/a.ts', sourceRevision: hash('b') });
const full = { resolveRegistryApproval: goodApproval, resolveSourceVersionReceipt: goodReceipt };
const admit = (r, resolvers = full) => admitObservationFeaturePlanRowV2(r, WS, resolvers);

test('all checks + both independent resolvers => ADMITTED_FOR_PROJECTION, still no authority or writes', () => {
  const r = admit(row());
  assert.equal(r.state, 'ADMITTED_FOR_PROJECTION');
  assert.deepEqual(r.blocks, []);
  assert.equal(r.canonicalAuthority, false);
  assert.equal(r.writesPerformed, false);
});
test('registryRevision present but approval receipt absent => BLOCKED_REGISTRY_APPROVAL_MISSING (the V1 claim-only gap)', () => {
  const r = admit(row(), { ...full, resolveRegistryApproval: () => null });
  assert.equal(r.state, 'STRUCTURALLY_VALID_NOT_ADMITTED');
  assert.ok(r.blocks.includes('BLOCKED_REGISTRY_APPROVAL_MISSING'));
});
test('approval resolver that throws (validator rejected the artifact) => BLOCKED_REGISTRY_APPROVAL_INVALID', () => {
  const r = admit(row(), { ...full, resolveRegistryApproval: () => { throw new Error('REVIEWER_NOT_AUTHORIZED'); } });
  assert.ok(r.blocks.includes('BLOCKED_REGISTRY_APPROVAL_INVALID'));
});
test('approval for a different registry revision does not approve this row', () => {
  const r = admit(row(), { ...full, resolveRegistryApproval: () => goodApproval('registry-r8') });
  assert.ok(r.blocks.includes('BLOCKED_REGISTRY_APPROVAL_REVISION_MISMATCH'));
});
test('valid SHA-256 source revision + evidence but null receipt => BLOCKED_SOURCE_VERSION_RECEIPT_MISSING', () => {
  for (const missing of [null, undefined, '', '  ']) {
    const r = admit(row({ sourceVersionReceiptId: missing }));
    assert.equal(r.state, 'STRUCTURALLY_VALID_NOT_ADMITTED');
    assert.ok(r.blocks.includes('BLOCKED_SOURCE_VERSION_RECEIPT_MISSING'));
  }
});
test('a receipt id alone is insufficient: unresolved and mismatched receipts block', () => {
  assert.ok(admit(row(), { ...full, resolveSourceVersionReceipt: () => null }).blocks.includes('BLOCKED_SOURCE_VERSION_RECEIPT_UNRESOLVED'));
  assert.ok(admit(row(), { ...full, resolveSourceVersionReceipt: () => { throw new Error('x'); } }).blocks.includes('BLOCKED_SOURCE_VERSION_RECEIPT_UNRESOLVED'));
  assert.ok(admit(row(), { ...full, resolveSourceVersionReceipt: () => ({ sourceRef: 'src/other.ts', sourceRevision: hash('b') }) }).blocks.includes('BLOCKED_SOURCE_VERSION_RECEIPT_MISMATCH'));
  assert.ok(admit(row(), { ...full, resolveSourceVersionReceipt: () => ({ sourceRef: 'src/a.ts', sourceRevision: hash('d') }) }).blocks.includes('BLOCKED_SOURCE_VERSION_RECEIPT_MISMATCH'));
});
test('without resolvers a structurally valid row is never admitted', () => {
  const r = admit(row(), {});
  assert.equal(r.state, 'STRUCTURALLY_VALID_NOT_ADMITTED');
  assert.ok(r.blocks.includes('REGISTRY_APPROVAL_RESOLVER_NOT_PROVIDED'));
});
test('historical rows without lineage are LEGACY_UNQUALIFIED (readable, not invalid); partial ones are BLOCKED_STRUCTURALLY_INVALID', () => {
  assert.equal(admit({ packetKey: 'p', sourceRef: 's', featureRevision: 'f' }).state, 'LEGACY_UNQUALIFIED');
  assert.equal(admit(row({ inputDigest: 'bad' })).state, 'BLOCKED_STRUCTURALLY_INVALID');
});
test('stale/unqualified workspace revision blocks structurally', () => {
  assert.equal(admitObservationFeaturePlanRowV2(row(), 'workspace:0', full).state, 'BLOCKED_STRUCTURALLY_INVALID');
});
test('batch: counts per state, resolvers cached per revision/receipt, allAdmitted only when every row is admitted', () => {
  let approvalCalls = 0;
  const resolvers = { ...full, resolveRegistryApproval: (rev) => { approvalCalls += 1; return goodApproval(rev); } };
  const b = admitObservationFeaturePlanRowsV2([row(), row({ packetKey: 'packet:2' }), row({ sourceVersionReceiptId: null, packetKey: 'packet:3' })], WS, resolvers);
  assert.equal(b.counts.ADMITTED_FOR_PROJECTION, 2);
  assert.equal(b.counts.STRUCTURALLY_VALID_NOT_ADMITTED, 1);
  assert.equal(b.allAdmitted, false);
  assert.equal(approvalCalls, 1);
  assert.equal(admitObservationFeaturePlanRowsV2([], WS, resolvers).allAdmitted, false);
});

const goodBinding = () => ({ sourceRevision: hash('b'), bindingChecksum: 'binding-checksum-1' });
test('SOURCE_BOUND alternative: no receipt id but an exact source binding for the same source ref/revision admits', () => {
  const calls = [];
  const r = admit(row({ sourceVersionReceiptId: null }), { ...full, resolveSourceBinding: (q) => { calls.push(q); return goodBinding(); } });
  assert.equal(r.state, 'ADMITTED_FOR_PROJECTION');
  assert.deepEqual(calls, [{ workspaceRevision: WS, sourceRef: 'src/a.ts' }]);
});
test('source binding unresolved, for a different source revision, or without a checksum blocks', () => {
  const noReceipt = row({ sourceVersionReceiptId: null });
  assert.ok(admit(noReceipt, { ...full, resolveSourceBinding: () => null }).blocks.includes('BLOCKED_SOURCE_BINDING_UNRESOLVED'));
  assert.ok(admit(noReceipt, { ...full, resolveSourceBinding: () => { throw new Error('x'); } }).blocks.includes('BLOCKED_SOURCE_BINDING_UNRESOLVED'));
  assert.ok(admit(noReceipt, { ...full, resolveSourceBinding: () => ({ ...goodBinding(), sourceRevision: hash('d') }) }).blocks.includes('BLOCKED_SOURCE_BINDING_MISMATCH'));
  assert.ok(admit(noReceipt, { ...full, resolveSourceBinding: () => ({ sourceRevision: hash('b'), bindingChecksum: '' }) }).blocks.includes('BLOCKED_SOURCE_BINDING_MISMATCH'));
});
test('a row with a receipt id still uses the receipt resolver, not the binding', () => {
  const r = admit(row(), { ...full, resolveSourceBinding: () => { throw new Error('must not be called'); } });
  assert.equal(r.state, 'ADMITTED_FOR_PROJECTION');
});
test('legacy ORF rows (no source_revision column) can never satisfy the binding alternative', () => {
  const legacy = { packetKey: 'p', sourceRef: 'src/a.ts', featureRevision: 'f', evidenceRefs: ['e'] };
  assert.equal(admit(legacy, { ...full, resolveSourceBinding: goodBinding }).state, 'LEGACY_UNQUALIFIED');
  // a row carrying a registryRevision but no source revision is partial lineage, not legacy: blocked, never admitted
  assert.equal(admit({ ...legacy, registryRevision: 'r' }, { ...full, resolveSourceBinding: goodBinding }).state, 'BLOCKED_STRUCTURALLY_INVALID');
});
