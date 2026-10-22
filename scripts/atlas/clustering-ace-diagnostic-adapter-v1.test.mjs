import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDiagnosticPacket, identityKey, heldOutLeakage, validateVector } from './clustering-ace-diagnostic-adapter-v1.mjs';

const DIM = 4;
const run = { executor: 'sklearn-kmeans', k: 32, seed: 42, dim: DIM, preprocessing: 'l2', sampleSha256: 'sha256:' + 'a'.repeat(64) };
const SHA = 'sha256:' + 'b'.repeat(64);
const row = (over = {}) => ({ id: 'c1', relative_path: 'src/a.ts', content_hash: 'h1', ...over });
const vec = [0.5, 0.5, 0.5, 0.5];

test('deterministic: identical input gives identical checksum', () => {
  const a = buildDiagnosticPacket({ row: row(), vector: vec, assignment: { cluster: 3 }, run });
  const b = buildDiagnosticPacket({ row: row(), vector: vec, assignment: { cluster: 3 }, run });
  assert.equal(a.packet.packetChecksum, b.packet.packetChecksum);
});

test('label invariance: renumbering clusters does not change identity', () => {
  const a = buildDiagnosticPacket({ row: row(), vector: vec, assignment: { cluster: 3 }, run }).packet;
  const b = buildDiagnosticPacket({ row: row(), vector: vec, assignment: { cluster: 17 }, run }).packet;
  assert.equal(identityKey(a), identityKey(b));
});

test('no fabricated labels: proposedLabels stays empty and cluster is UNLABELED', () => {
  const p = buildDiagnosticPacket({ row: row(), vector: vec, assignment: { cluster: 3 }, run }).packet;
  assert.deepEqual(p.proposedLabels, []);
  assert.equal(p.cluster.labelStatus, 'UNLABELED');
});

test('fail closed: missing source revision is UNKNOWN, blocked, and not admission-eligible', () => {
  const p = buildDiagnosticPacket({ row: row(), vector: vec, assignment: { cluster: 3 }, run }).packet;
  assert.equal(p.revisions.sourceRevision.status, 'UNKNOWN');
  assert.ok(p.blockers.includes('SOURCE_REVISION_UNKNOWN'));
  assert.equal(p.aceAdmissionEligible, false);
});

test('placeholder revisions are never coerced to qualified', () => {
  for (const bad of ['0', 'null', 'unknown', 'sha256:xyz']) {
    const p = buildDiagnosticPacket({ row: row({ source_revision: bad }), vector: vec, assignment: { cluster: 0 }, run }).packet;
    assert.equal(p.revisions.sourceRevision.status, 'UNKNOWN', bad);
  }
});

test('qualified revision is recorded only when canonical sha256, and still does not admit', () => {
  const p = buildDiagnosticPacket({ row: row({ source_revision: SHA }), vector: vec, assignment: { cluster: 0 }, run }).packet;
  assert.equal(p.revisions.sourceRevision.status, 'QUALIFIED');
  assert.equal(p.aceAdmissionEligible, false);
});

test('missing and non-finite vectors are rejected', () => {
  assert.equal(buildDiagnosticPacket({ row: row(), vector: [1, NaN, 0, 0], assignment: { cluster: 0 }, run }).reason, 'VECTOR_NON_FINITE');
  assert.equal(buildDiagnosticPacket({ row: row(), vector: [1, Infinity, 0, 0], assignment: { cluster: 0 }, run }).reason, 'VECTOR_NON_FINITE');
  assert.equal(buildDiagnosticPacket({ row: row(), vector: [0, 0, 0, 0], assignment: { cluster: 0 }, run }).reason, 'VECTOR_ZERO_NORM');
  assert.equal(buildDiagnosticPacket({ row: row(), vector: [1, 0], assignment: { cluster: 0 }, run }).reason, 'VECTOR_DIM_MISMATCH');
  assert.equal(buildDiagnosticPacket({ row: row(), vector: null, assignment: { cluster: 0 }, run }).reason, 'VECTOR_NOT_ARRAY');
  assert.equal(validateVector(vec, DIM).ok, true);
});

test('missing identity fields are rejected, not defaulted', () => {
  assert.equal(buildDiagnosticPacket({ row: row({ id: '' }), vector: vec, assignment: { cluster: 0 }, run }).reason, 'MISSING_CHUNK_ID');
  assert.equal(buildDiagnosticPacket({ row: row({ relative_path: '' }), vector: vec, assignment: { cluster: 0 }, run }).reason, 'MISSING_SOURCE_REF');
  assert.equal(buildDiagnosticPacket({ row: row({ content_hash: null }), vector: vec, assignment: { cluster: 0 }, run }).reason, 'MISSING_CONTENT_HASH');
});

test('source-held-out leakage detection', () => {
  assert.deepEqual(heldOutLeakage(['a.ts', 'b.ts'], ['c.ts']), []);
  assert.deepEqual(heldOutLeakage(['a.ts', 'b.ts'], ['b.ts', 'c.ts']), ['b.ts']);
});

test('no unauthorized writes: module imports only node:crypto and has no I/O calls', () => {
  const src = readFileSync(new URL('./clustering-ace-diagnostic-adapter-v1.mjs', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['node:crypto']);
  assert.doesNotMatch(src, /\b(fetch|writeFile|appendFile|pg|redis|qdrant)\b/i);
});

test('proposal is never canonical and records zero writes', () => {
  const p = buildDiagnosticPacket({ row: row(), vector: vec, assignment: { cluster: 0 }, run }).packet;
  assert.equal(p.canonicalAuthority, false);
  assert.equal(p.proposalOnly, true);
  assert.equal(p.writesPerformed, 0);
});
