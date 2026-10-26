import { resolve } from 'node:path';
import { requireCanonicalWorkspaceIdV1 } from './canonical-workspace-id-v1.mjs';

export function validateCanonicalGraphifySnapshotBindingV1({ snapshot, expectedWorkspaceId, manifestPath, root }) {
  let workspaceId;
  let configuredWorkspaceId;
  try {
    workspaceId = requireCanonicalWorkspaceIdV1(snapshot?.workspaceId);
    configuredWorkspaceId = requireCanonicalWorkspaceIdV1(expectedWorkspaceId);
  } catch {
    return { valid: false, reason: 'SNAPSHOT_WORKSPACE_ID_NOT_CANONICAL_UUID', workspaceId: snapshot?.workspaceId ?? null };
  }

  if (workspaceId !== configuredWorkspaceId) {
    return { valid: false, reason: 'SNAPSHOT_WORKSPACE_ID_MISMATCH', workspaceId };
  }

  const snapshotRevision = String(snapshot?.snapshotRevision ?? '');
  if (!/^sha256:[0-9a-f]{64}$/i.test(snapshotRevision)) {
    return { valid: false, reason: 'SNAPSHOT_REVISION_INVALID', workspaceId };
  }

  const canonicalManifestPath = resolve(root, 'docs/reports/workspace-source-snapshots', `${snapshotRevision.slice(7)}.json`);
  if (resolve(manifestPath) !== canonicalManifestPath) {
    return { valid: false, reason: 'SNAPSHOT_MANIFEST_NOT_IN_CANONICAL_ADMISSION_STORE', workspaceId, canonicalManifestPath };
  }

  return { valid: true, reason: null, workspaceId, canonicalManifestPath };
}
