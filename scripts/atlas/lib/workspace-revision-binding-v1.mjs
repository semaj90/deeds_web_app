const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/;

export function workspaceRevisionBindingStatusV1(observedRevision, currentRevision) {
  if (!SHA256_REVISION.test(String(observedRevision ?? '')) || !SHA256_REVISION.test(String(currentRevision ?? ''))) {
    return 'INVALID';
  }
  return observedRevision === currentRevision ? 'MATCH' : 'MISMATCH';
}
