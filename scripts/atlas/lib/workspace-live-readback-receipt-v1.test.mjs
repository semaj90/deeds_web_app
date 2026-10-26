import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkspaceLiveReadbackReceiptV1, verifyWorkspaceLiveReadbackReceiptV1 } from './workspace-live-readback-receipt-v1.mjs';

const snapshot = {
  snapshotRevision: 'sha256:snapshot',
  workspaceRevision: null,
  sources: [{ sourceRef: 'src/a.ts' }, { sourceRef: 'src/b.ts' }],
};
const admission = {
  schema: 'atlas.workspace-revision-tournament-admission.v1',
  status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
  manifestSha256: `sha256:${'a'.repeat(64)}`,
  snapshotRevision: snapshot.snapshotRevision,
  snapshotSourceCount: snapshot.sources.length,
};

function receiptFor(readback = {}) {
  return buildWorkspaceLiveReadbackReceiptV1({
    admission,
    admissionReceiptSha256: `sha256:${'b'.repeat(64)}`,
    manifestPath: '.tmp/atlas/workspace-snapshot-scratch-v1/frame/snapshot.json',
    manifestSha256: admission.manifestSha256,
    snapshot,
    readback: {
      status: 'SNAPSHOT_READBACK_BLOCKED',
      sourceCount: 2,
      exactMatches: 1,
      violationCounts: { SOURCE_BYTES_CHANGED: 1 },
      violationDetails: [{
        sourceRef: 'src/b.ts',
        code: 'SOURCE_BYTES_CHANGED',
        repositoryId: 'repo:root',
        repositoryPath: '',
        repositoryRelativePath: 'src/b.ts',
        expectedSourceRevision: `sha256:${'c'.repeat(64)}`,
        expectedByteLength: 12,
        observedSourceRevision: `sha256:${'d'.repeat(64)}`,
        observedByteLength: 13,
      }],
      ...readback,
    },
    capturedAt: '2026-10-24T00:00:00.000Z',
  });
}

test('preserves byte-drift evidence without granting workspace authority', () => {
  const receipt = receiptFor();
  assert.equal(verifyWorkspaceLiveReadbackReceiptV1(receipt), true);
  assert.equal(receipt.readback.exactMatches, 1);
  assert.equal(receipt.verdict.currentBytes, 'SOURCE_BYTES_CHANGED');
  assert.equal(receipt.readback.violationDetails[0].expectedSourceRevision, `sha256:${'c'.repeat(64)}`);
  assert.equal(receipt.readback.violationDetails[0].observedSourceRevision, `sha256:${'d'.repeat(64)}`);
  assert.equal(receipt.verdict.workspaceAuthority, 'NOT_ESTABLISHED');
  assert.equal(receipt.verdict.persistentWrites, 0);
});

test('records exact byte match as diagnostic only', () => {
  const receipt = receiptFor({
    status: 'SNAPSHOT_BYTES_READBACK_PROVEN',
    exactMatches: 2,
    violationCounts: {},
    violationDetails: [],
  });
  assert.equal(receipt.verdict.currentBytes, 'BYTE_READBACK_MATCHED');
  assert.equal(receipt.verdict.workspaceAuthority, 'NOT_ESTABLISHED');
});

test('rejects mismatched admission manifest identity and authority claims', () => {
  assert.throws(() => receiptFor({ sourceCount: 3 }), /WORKSPACE_LIVE_READBACK_INPUT_INVALID/);
  const forged = receiptFor();
  forged.verdict.workspaceAuthority = 'ADMITTED';
  assert.throws(() => verifyWorkspaceLiveReadbackReceiptV1(forged), /WORKSPACE_LIVE_READBACK_RECEIPT_INVALID/);
});

test('rejects receipt checksum tampering', () => {
  const forged = receiptFor();
  forged.readback.violationDetails[0].code = 'UNSAFE_PATH';
  assert.throws(() => verifyWorkspaceLiveReadbackReceiptV1(forged), /WORKSPACE_LIVE_READBACK_RECEIPT_INVALID/);
});
