import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createGraphifySnapshotEvidenceBinderV1 } from './graphify-snapshot-evidence-binder-v1.mjs';

const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const bytes = Buffer.from('α toolCall("atlas.search")\r\nnext\n', 'utf8');
const sourceRevision = hash(bytes);
const manifest = {
  workspaceRevision,
  snapshotRevision: `sha256:${'b'.repeat(64)}`,
  canonicalAuthority: false,
  datastoreWritesPerformed: false,
  sources: [{ sourceRef: 'src/a.ts', sourceRevision, contentDigest: sourceRevision.slice(7), byteLength: bytes.length }],
};
const admission = {
  status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
  authority: true,
  workspaceRevision,
  snapshotRevision: manifest.snapshotRevision,
};
const binder = () => createGraphifySnapshotEvidenceBinderV1({
  admission,
  manifest,
  snapshotRoot: `C:/snapshots/${manifest.snapshotRevision.slice(7)}`,
});

test('binds source bytes and UTF-8 byte offsets to the admitted snapshot', () => {
  const result = binder().bind({ sourceRef: 'src/a.ts', bytes, lineNumber: 1, requiredText: 'atlas.search' });
  const line = Buffer.from('α toolCall("atlas.search")\r', 'utf8');
  assert.equal(result.sourceRevision, sourceRevision);
  assert.equal(result.workspaceRevision, workspaceRevision);
  assert.equal(result.evidenceScope, 'LINE');
  assert.equal(result.evidenceSpan.startByte, 0);
  assert.equal(result.evidenceSpan.endByte, line.length);
  assert.equal(result.evidenceSpan.digest, hash(line));
});

test('file-level evidence remains explicit and source bytes are checked', () => {
  const result = binder().bind({ sourceRef: 'src/a.ts', bytes });
  assert.equal(result.evidenceScope, 'FILE');
  assert.equal(result.evidenceSpan, null);
  assert.throws(() => binder().bind({ sourceRef: 'src/a.ts', bytes: Buffer.from('changed') }), /SOURCE_READBACK_MISMATCH/);
});

test('rejects unadmitted or mismatched snapshot authority', () => {
  assert.throws(() => createGraphifySnapshotEvidenceBinderV1({ admission: { ...admission, authority: false }, manifest, snapshotRoot: `C:/snapshots/${manifest.snapshotRevision.slice(7)}` }), /SNAPSHOT_ADMISSION_REQUIRED/);
  assert.throws(() => createGraphifySnapshotEvidenceBinderV1({ admission, manifest: { ...manifest, workspaceRevision: `sha256:${'c'.repeat(64)}` }, snapshotRoot: `C:/snapshots/${manifest.snapshotRevision.slice(7)}` }), /MANIFEST_ADMISSION_MISMATCH/);
  assert.throws(() => createGraphifySnapshotEvidenceBinderV1({ admission, manifest, snapshotRoot: 'C:/snapshots/other' }), /SNAPSHOT_ROOT_REVISION_MISMATCH/);
});

test('rejects unlisted sources, stale lines, and line text mismatches', () => {
  const bound = binder();
  assert.throws(() => bound.bind({ sourceRef: 'src/other.ts', bytes }), /SOURCE_NOT_IN_MANIFEST/);
  assert.throws(() => bound.read({ sourceRef: '../outside.ts' }), /GRAPHIFY_SOURCE_REF_INVALID/);
  assert.throws(() => bound.bind({ sourceRef: 'src/a.ts', bytes, lineNumber: 3 }), /LINE_EVIDENCE_EMPTY/);
  assert.throws(() => bound.bind({ sourceRef: 'src/a.ts', bytes, lineNumber: 4 }), /LINE_OUT_OF_RANGE/);
  assert.throws(() => bound.bind({ sourceRef: 'src/a.ts', bytes, lineNumber: 1, requiredText: 'not-present' }), /LINE_EVIDENCE_MISMATCH/);
});
