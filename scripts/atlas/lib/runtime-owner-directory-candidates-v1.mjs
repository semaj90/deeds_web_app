import path from 'node:path';

const byteOrder = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));

export function buildRuntimeOwnerDirectoryCandidatesV1({ registry, inventoryPaths, directoryPaths, currentFileDigests }) {
  if (registry?.schema_version !== 'atlas.runtime-ownership.v1'
    || !(inventoryPaths instanceof Set) || !(directoryPaths instanceof Set)
    || !(currentFileDigests instanceof Map)) throw new Error('RUNTIME_OWNER_INPUT_INVALID');

  const rows = [];
  const rejected = [];
  const capabilities = registry.capabilities ?? {};
  for (const [capabilityId, capability] of Object.entries(capabilities).sort(([left], [right]) => byteOrder(left, right))) {
    const declaredPath = capability?.owner?.path;
    const normalizedPath = typeof declaredPath === 'string' ? declaredPath.replaceAll('\\', '/') : '';
    if (!normalizedPath || normalizedPath.includes(' -> ') || normalizedPath.includes(';')
      || normalizedPath.includes(':') || normalizedPath.startsWith('/') || normalizedPath.split('/').includes('..')) {
      rejected.push({ capabilityId, declaredPath: declaredPath ?? null, reason: 'OWNER_PATH_NOT_SINGLE_REPOSITORY_FILE' });
      continue;
    }
    if (!inventoryPaths.has(normalizedPath)) {
      rejected.push({ capabilityId, declaredPath, reason: 'OWNER_PATH_NOT_IN_INVENTORY' });
      continue;
    }
    const digest = currentFileDigests.get(normalizedPath);
    if (!/^[a-f0-9]{64}$/.test(digest ?? '')) {
      rejected.push({ capabilityId, declaredPath, reason: 'CURRENT_OWNER_FILE_DIGEST_MISSING' });
      continue;
    }
    const parentPath = path.posix.dirname(normalizedPath);
    if (!directoryPaths.has(parentPath)) {
      rejected.push({ capabilityId, declaredPath, reason: 'OWNER_PARENT_DIRECTORY_NOT_IN_ROLLUP' });
      continue;
    }
    rows.push({
      capabilityId,
      ownerClassification: capability.owner.classification ?? 'UNCLASSIFIED',
      ownerPath: normalizedPath,
      ownerFileSha256: digest,
      parentDirectoryPath: parentPath,
      evidenceKind: 'DECLARED_RUNTIME_OWNER_PATH_CANDIDATE',
      executionProven: false,
      sourceRevisionQualified: false,
    });
  }
  rows.sort((left, right) => byteOrder(left.parentDirectoryPath, right.parentDirectoryPath)
    || byteOrder(left.capabilityId, right.capabilityId));
  rejected.sort((left, right) => byteOrder(left.capabilityId, right.capabilityId));
  return { rows, rejected };
}
