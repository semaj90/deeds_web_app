const byteOrder = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));

function sourceDirectory(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.length === 0 || sourcePath.startsWith('/')
    || sourcePath.includes('\\') || sourcePath.split('/').includes('..')) return null;
  const parent = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '.';
  return parent || '.';
}

function ancestors(directory) {
  const result = [];
  let current = directory;
  while (true) {
    result.push(current);
    if (current === '.') break;
    const separator = current.lastIndexOf('/');
    current = separator < 0 ? '.' : current.slice(0, separator) || '.';
  }
  return result;
}

export function aggregateDirectoryPackageCandidatesV1({ references, directories }) {
  if (!Array.isArray(references) || !Array.isArray(directories)) throw new TypeError('DIRECTORY_PACKAGE_INPUT_INVALID');
  const directoryRows = new Map(directories.map(row => [row.directoryPath, row]));
  const aggregates = new Map();
  const rejected = [];

  for (const reference of references) {
    const directDirectory = sourceDirectory(reference.sourcePath);
    const parents = directDirectory === null ? [] : ancestors(directDirectory);
    if (!parents.length || parents.some(parent => !directoryRows.has(parent))) {
      rejected.push({ sourcePath: reference.sourcePath ?? '', reason: 'SOURCE_DIRECTORY_NOT_IN_HIERARCHY' });
      continue;
    }
    if (!['npm', 'pypi'].includes(reference.ecosystem) || !reference.packageName) {
      rejected.push({ sourcePath: reference.sourcePath, reason: 'PACKAGE_IDENTITY_INVALID' });
      continue;
    }
    for (const directoryPath of parents) {
      const key = JSON.stringify([directoryPath, reference.ecosystem, reference.packageName]);
      let row = aggregates.get(key);
      if (!row) {
        row = {
          directoryPath,
          ecosystem: reference.ecosystem,
          packageName: reference.packageName,
          directReferenceCount: 0,
          subtreeReferenceCount: 0,
          directFiles: new Set(),
          subtreeFiles: new Set(),
          versionQualifiedReferenceCount: 0,
          versionUnqualifiedReferenceCount: 0,
          versionCounts: new Map(),
          profileLanguageCountsJson: directoryRows.get(directoryPath).profileLanguageCountsJson ?? '{}',
        };
        aggregates.set(key, row);
      }
      row.subtreeReferenceCount += 1;
      row.subtreeFiles.add(reference.sourcePath);
      if (directoryPath === directDirectory) {
        row.directReferenceCount += 1;
        row.directFiles.add(reference.sourcePath);
      }
      const version = reference.installedVersionStatus === 'UNIQUE_IN_INVENTORY'
        && typeof reference.installedVersion === 'string' && reference.installedVersion.length > 0
        ? reference.installedVersion : null;
      if (version) {
        row.versionQualifiedReferenceCount += 1;
        row.versionCounts.set(version, (row.versionCounts.get(version) ?? 0) + 1);
      } else {
        row.versionUnqualifiedReferenceCount += 1;
      }
    }
  }

  const rows = [...aggregates.values()].map(row => ({
    directoryPath: row.directoryPath,
    ecosystem: row.ecosystem,
    packageName: row.packageName,
    directReferenceCount: row.directReferenceCount,
    subtreeReferenceCount: row.subtreeReferenceCount,
    directFileCount: row.directFiles.size,
    subtreeFileCount: row.subtreeFiles.size,
    versionQualifiedReferenceCount: row.versionQualifiedReferenceCount,
    versionUnqualifiedReferenceCount: row.versionUnqualifiedReferenceCount,
    versionCountsJson: JSON.stringify(Object.fromEntries([...row.versionCounts.entries()].sort(([a], [b]) => byteOrder(a, b)))),
    profileLanguageCountsJson: row.profileLanguageCountsJson,
    evidenceStatus: 'ADVISORY_REGEX_CANDIDATE_AGGREGATE',
  })).sort((left, right) => byteOrder(left.directoryPath, right.directoryPath)
    || byteOrder(left.ecosystem, right.ecosystem) || byteOrder(left.packageName, right.packageName));
  rejected.sort((left, right) => byteOrder(left.sourcePath, right.sourcePath) || byteOrder(left.reason, right.reason));
  return { rows, rejected };
}
