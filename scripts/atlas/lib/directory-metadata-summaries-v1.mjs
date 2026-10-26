import { createHash } from 'node:crypto';

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');

function topCounts(entries, limit = 5) {
  return entries.filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || compareText(a[0], b[0])).slice(0, limit);
}

export function buildDirectoryMetadataSummariesV1({ directories, featuresByDirectory, directPackageRows, inputBindings }) {
  if (!Array.isArray(directories) || !Array.isArray(directPackageRows) || !(featuresByDirectory instanceof Map)
    || !inputBindings || typeof inputBindings !== 'object') throw new TypeError('SUMMARY_INPUT_INVALID');
  const seenPaths = new Set();
  const packagesByDirectory = new Map();
  for (const row of directPackageRows) {
    if (!row.directoryPath || !row.packageName || !Number.isInteger(row.directReferenceCount) || row.directReferenceCount < 0) {
      throw new Error('DIRECT_PACKAGE_ROW_INVALID');
    }
    const key = JSON.stringify([row.ecosystem, row.packageName]);
    const rows = packagesByDirectory.get(row.directoryPath) ?? new Map();
    if (rows.has(key)) throw new Error('DUPLICATE_DIRECT_PACKAGE_ROW');
    rows.set(key, { ecosystem: row.ecosystem, packageName: row.packageName, count: row.directReferenceCount,
      evidenceStatus: row.evidenceStatus ?? 'UNSPECIFIED_CANDIDATE' });
    packagesByDirectory.set(row.directoryPath, rows);
  }
  const summaries = directories.map(directory => {
    const relativePath = directory.directoryPath;
    if (typeof relativePath !== 'string' || seenPaths.has(relativePath)) throw new Error('DIRECTORY_PATH_INVALID_OR_DUPLICATE');
    seenPaths.add(relativePath);
    const features = featuresByDirectory.get(relativePath) ?? [];
    const byKind = new Map();
    const featureKeys = new Set();
    for (const feature of features) {
      if (typeof feature.featureKey !== 'string' || !Number.isInteger(feature.value) || feature.value < 0
        || featureKeys.has(feature.featureKey)) throw new Error('DIRECTORY_FEATURE_INVALID_OR_DUPLICATE');
      featureKeys.add(feature.featureKey);
      byKind.set(feature.evidenceKind, [...(byKind.get(feature.evidenceKind) ?? []), [feature.featureKey, feature.value]]);
    }
    const languages = topCounts((byKind.get('PROFILE_INVENTORY_COUNT') ?? []).map(([key, value]) => [key.slice('language-profile:'.length), value]));
    const roles = topCounts((byKind.get('PATH_INVENTORY_COUNT') ?? []).map(([key, value]) => [key.slice('path-role:'.length), value]));
    const packageRows = [...(packagesByDirectory.get(relativePath)?.values() ?? [])]
      .filter(row => row.count > 0).sort((a, b) => b.count - a.count
        || compareText(a.ecosystem, b.ecosystem) || compareText(a.packageName, b.packageName)).slice(0, 5);
    const sourceInputs = {
      directory: {
        path: relativePath,
        parentPath: directory.parentPath,
        depth: directory.depth,
        directFileCount: directory.directFileCount,
        directDirectoryCount: directory.directDirectoryCount,
        directLinkCount: directory.directLinkCount,
        directFileBytes: directory.directFileBytes,
        subtreeFileCount: directory.subtreeFileCount,
        subtreeDirectoryCount: directory.subtreeDirectoryCount,
        subtreeLinkCount: directory.subtreeLinkCount,
        subtreeFileBytes: directory.subtreeFileBytes,
      },
      features: [...features].sort((a, b) => compareText(a.featureKey, b.featureKey)),
      directPackages: [...(packagesByDirectory.get(relativePath)?.values() ?? [])]
        .sort((a, b) => compareText(a.ecosystem, b.ecosystem) || compareText(a.packageName, b.packageName)),
      inputBindings,
    };
    const inputDigest = sha256(sourceInputs);
    const summaryText = [
      `Directory ${relativePath}.`,
      `${directory.directFileCount} direct files; ${directory.subtreeFileCount} files in subtree; ${directory.directDirectoryCount} direct child directories; ${directory.subtreeLinkCount} subtree links.`,
      `Profile inventory counts: ${languages.map(([name, count]) => `${name}=${count}`).join(', ') || 'none recorded'}.`,
      `Path-role counts: ${roles.map(([name, count]) => `${name}=${count}`).join(', ') || 'none recorded'}.`,
      `Direct package-reference candidates: ${packageRows.map(row => `${row.ecosystem}:${row.packageName}=${row.count}`).join(', ') || 'none recorded'}.`,
    ].join(' ');
    const body = {
      relativePath,
      parentPath: directory.parentPath,
      depth: directory.depth,
      summaryKind: 'DETERMINISTIC_DIRECTORY_METADATA_ONLY',
      summaryText,
      topProfileLanguageCounts: languages,
      topPathRoleCounts: roles,
      topDirectPackageCandidates: packageRows,
      inputDigest,
      coverageStatus: 'INVENTORY_PROFILE_ROLE_AND_PACKAGE_CANDIDATES_ONLY',
      unavailableEvidence: ['AST_DECLARATIONS', 'RESOLVED_SYMBOL_RELATIONS', 'TESTED_RUNTIME_USAGE', 'REVIEWED_DOMAIN_LABELS'],
    };
    return { ...body, summarySha256: sha256(body) };
  }).sort((a, b) => compareText(a.relativePath, b.relativePath));
  return { summaries, rejectedRows: [] };
}
