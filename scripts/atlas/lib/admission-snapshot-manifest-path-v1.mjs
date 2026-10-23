import path from 'node:path';

export function resolveAdmissionSnapshotManifestPathV1(root, admission) {
  const configuredPath = typeof admission?.manifestPath === 'string' && admission.manifestPath.trim()
    ? admission.manifestPath
    : typeof admission?.snapshotRevision === 'string'
      ? path.join('docs', 'reports', 'workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`)
      : null;

  if (!configuredPath) throw new Error('ADMISSION_SNAPSHOT_MANIFEST_PATH_MISSING');

  const manifestPath = path.resolve(root, configuredPath);
  const relativePath = path.relative(path.resolve(root), manifestPath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error('ADMISSION_SNAPSHOT_MANIFEST_OUTSIDE_REPOSITORY');
  }

  return {
    manifestPath,
    relativePath: relativePath.split(path.sep).join('/'),
  };
}
