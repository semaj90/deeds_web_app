// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { resolveTrustedWorkspaceAuthorityFromEvidenceV1, resolveTrustedWorkspaceAuthorityV1 } from './trusted-workspace-authority-v1.js';

const PIN_ENV = 'ATLAS_ADMITTED_WORKSPACE_REVISION';
const RECEIPT_REVISION = 'sha256:2ecdd4ffc1ab9940023f10cd621affcf18e253c0a8d4a9e90be4b554bb88814a';
const SNAPSHOT_REVISION = 'sha256:dd8731d5c06ddf143860170c59813b04b026c2b254a432e285ba44e3e74d1bb0';

afterEach(() => {
  delete process.env[PIN_ENV];
});

describe('trusted workspace authority resolver', () => {
  it('fails closed without an operator pin, regardless of what the admission receipt says', async () => {
    delete process.env[PIN_ENV];
    await expect(resolveTrustedWorkspaceAuthorityV1()).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      workspaceRevision: null,
      reason: 'NO_OPERATOR_PIN',
    });
  });

  it('rejects a pin that is not a sha256 digest', async () => {
    process.env[PIN_ENV] = 'sha256:ws-admitted';
    await expect(resolveTrustedWorkspaceAuthorityV1()).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      workspaceRevision: null,
      reason: 'PIN_NOT_SHA256_DIGEST',
    });
  });

  it('requires matching admitted receipt and independently proven live readback', () => {
    const result = resolveTrustedWorkspaceAuthorityFromEvidenceV1({
      pin: RECEIPT_REVISION,
      receiptWorkspaceRevision: RECEIPT_REVISION,
      receiptSnapshotRevision: SNAPSHOT_REVISION,
      liveReadback: { ok: true, snapshotRevision: SNAPSHOT_REVISION, proven: true },
    });
    expect(result).toMatchObject({ status: 'TRUSTED', workspaceRevision: RECEIPT_REVISION, receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT' });
  });

  it('rejects receipt mismatch even if the live readback matches the caller pin', () => {
    expect(resolveTrustedWorkspaceAuthorityFromEvidenceV1({
      pin: `sha256:${'cd'.repeat(32)}`,
      receiptWorkspaceRevision: RECEIPT_REVISION,
      receiptSnapshotRevision: SNAPSHOT_REVISION,
      liveReadback: { ok: true, snapshotRevision: `sha256:${'cd'.repeat(32)}`, proven: true },
    })).toMatchObject({ status: 'UNAVAILABLE', workspaceRevision: null, reason: 'ADMISSION_RECEIPT_MISMATCH' });
  });

  it('does not authorize a matching operator pin when the live readback is unstable', () => {
    expect(resolveTrustedWorkspaceAuthorityFromEvidenceV1({
      pin: RECEIPT_REVISION,
      receiptWorkspaceRevision: RECEIPT_REVISION,
      receiptSnapshotRevision: SNAPSHOT_REVISION,
      liveReadback: { ok: true, snapshotRevision: SNAPSHOT_REVISION, proven: false },
    })).toMatchObject({ status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_NOT_PROVEN' });
  });

  it('rejects a live readback for a different snapshot without comparing snapshot to workspace revision', () => {
    expect(resolveTrustedWorkspaceAuthorityFromEvidenceV1({
      pin: RECEIPT_REVISION,
      receiptWorkspaceRevision: RECEIPT_REVISION,
      receiptSnapshotRevision: SNAPSHOT_REVISION,
      liveReadback: { ok: true, snapshotRevision: `sha256:${'cd'.repeat(32)}`, proven: true },
    })).toMatchObject({ status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_SNAPSHOT_MISMATCH' });
  });

  it('rejects admission receipts without a valid snapshot revision binding', () => {
    expect(resolveTrustedWorkspaceAuthorityFromEvidenceV1({
      pin: RECEIPT_REVISION,
      receiptWorkspaceRevision: RECEIPT_REVISION,
      receiptSnapshotRevision: null,
      liveReadback: { ok: true, snapshotRevision: SNAPSHOT_REVISION, proven: true },
    })).toMatchObject({ status: 'UNAVAILABLE', workspaceRevision: null, reason: 'ADMISSION_SNAPSHOT_BINDING_MISSING' });
  });

  it('never reads a workspace revision from the request: the resolver takes no arguments', () => {
    expect(resolveTrustedWorkspaceAuthorityV1.length).toBe(0);
  });
});
