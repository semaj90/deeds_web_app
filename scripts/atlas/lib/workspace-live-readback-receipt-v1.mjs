import { createHash } from 'node:crypto';

const checksum = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

export function buildWorkspaceLiveReadbackReceiptV1({ admission, admissionReceiptSha256, manifestPath, manifestSha256, snapshot, readback, capturedAt }) {
  if (admission?.schema !== 'atlas.workspace-revision-tournament-admission.v1'
    || admission.manifestSha256 !== manifestSha256
    || admission.snapshotRevision !== snapshot?.snapshotRevision
    || admission.snapshotSourceCount !== snapshot?.sources?.length
    || !/^sha256:[a-f0-9]{64}$/.test(admissionReceiptSha256 ?? '')
    || !/^sha256:[a-f0-9]{64}$/.test(manifestSha256 ?? '')
    || !Number.isInteger(readback?.sourceCount)
    || !Number.isInteger(readback?.exactMatches)
    || readback.sourceCount !== snapshot.sources.length
    || readback.sourceCount < readback.exactMatches
    || readback.violationDetails?.length !== readback.sourceCount - readback.exactMatches) {
    throw new Error('WORKSPACE_LIVE_READBACK_INPUT_INVALID');
  }
  const body = {
    schema: 'atlas.workspace-live-source-readback.v1',
    mode: 'READ_ONLY_ADMISSION_MANIFEST_BYTE_RECHECK',
    capturedAt,
    admission: {
      receiptSha256: admissionReceiptSha256,
      status: admission.status,
      manifestPath,
      manifestSha256,
      manifestDigestVerified: true,
      snapshotRevision: admission.snapshotRevision,
      workspaceRevision: snapshot.workspaceRevision,
      sourceCount: snapshot.sources.length,
      canonicalAuthority: false,
    },
    readback: {
      status: readback.status,
      sourceCount: readback.sourceCount,
      exactMatches: readback.exactMatches,
      violationCounts: readback.violationCounts,
      violationDetails: readback.violationDetails,
      canonicalAuthority: false,
      datastoreWritesPerformed: false,
    },
    verdict: {
      currentBytes: readback.exactMatches === readback.sourceCount ? 'BYTE_READBACK_MATCHED' : 'SOURCE_BYTES_CHANGED',
      workspaceAuthority: 'NOT_ESTABLISHED',
      firstFailingBoundary: 'WORKSPACE_AUTHORITY',
      operatorPinSet: false,
      persistentWrites: 0,
    },
  };
  const receipt = { ...body, receiptChecksum: checksum(body) };
  verifyWorkspaceLiveReadbackReceiptV1(receipt);
  return receipt;
}

export function verifyWorkspaceLiveReadbackReceiptV1(receipt) {
  const { receiptChecksum, ...body } = receipt ?? {};
  if (body.schema !== 'atlas.workspace-live-source-readback.v1'
    || body.mode !== 'READ_ONLY_ADMISSION_MANIFEST_BYTE_RECHECK'
    || body.admission?.manifestDigestVerified !== true
    || body.admission?.canonicalAuthority !== false
    || body.admission?.workspaceRevision !== null
    || body.readback?.canonicalAuthority !== false
    || body.readback?.datastoreWritesPerformed !== false
    || body.verdict?.workspaceAuthority !== 'NOT_ESTABLISHED'
    || body.verdict?.firstFailingBoundary !== 'WORKSPACE_AUTHORITY'
    || body.verdict?.operatorPinSet !== false
    || body.verdict?.persistentWrites !== 0
    || !Number.isInteger(body.readback?.sourceCount)
    || !Number.isInteger(body.readback?.exactMatches)
    || body.readback.sourceCount < body.readback.exactMatches
    || body.readback.violationDetails?.length !== body.readback.sourceCount - body.readback.exactMatches
    || receiptChecksum !== checksum(body)) {
    throw new Error('WORKSPACE_LIVE_READBACK_RECEIPT_INVALID');
  }
  return true;
}
