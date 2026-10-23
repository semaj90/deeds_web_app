export function normalizeGitPathV1(value, platform = process.platform) {
  const normalized = String(value).replaceAll('\\', '/').normalize('NFC').replace(/^\.\//, '').replace(/\/+$/, '');
  return platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

export function isRepositoryMetadataPathV1(value) {
  return value.replaceAll('\\', '/').split('/').includes('.git');
}

export function isPathUnderLinkV1(value, linkPrefixes, platform = process.platform) {
  const key = normalizeGitPathV1(value, platform);
  return linkPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}/`));
}

export function addGitPathsV1(target, buffer, classification, platform = process.platform) {
  let start = 0;
  let count = 0;
  while (start < buffer.length) {
    const end = buffer.indexOf(0, start);
    if (end < 0) throw new Error('GIT_PATH_LIST_NOT_NUL_TERMINATED');
    const rawPath = buffer.subarray(start, end).toString('utf8');
    const key = normalizeGitPathV1(rawPath, platform);
    const prior = target.get(key);
    if (prior && prior.classification !== classification) prior.conflict = true;
    else if (!prior) target.set(key, { classification, rawPath, conflict: false });
    else if (prior.rawPath !== rawPath) prior.caseFoldCollision = true;
    count += 1;
    start = end + 1;
  }
  return count;
}

export function classifyGitPathV1(relativePath, entryKind, gitPaths, worktreeChanges, indexChanges, deletedPaths, directoryCounts, platform = process.platform, aggregatePath = relativePath) {
  const key = normalizeGitPathV1(relativePath, platform);
  const directoryKey = normalizeGitPathV1(aggregatePath, platform);
  if (isRepositoryMetadataPathV1(aggregatePath)) return { classification: 'REPOSITORY_METADATA', change: 'METADATA_ONLY', conflict: false };
  if (entryKind === 'SYMLINK_OR_JUNCTION') return { classification: 'LINK_ONLY', change: 'NOT_FOLLOWED', conflict: false };
  if (entryKind === 'DIRECTORY') {
    if (aggregatePath === '.') return { classification: 'ROOT', change: 'NOT_APPLICABLE', counts: directoryCounts.get(directoryKey) ?? null };
    return { classification: directoryCounts.has(directoryKey) ? 'DIRECTORY_AGGREGATE' : 'DIRECTORY_NO_FILE_DESCENDANTS', change: 'NOT_APPLICABLE', counts: directoryCounts.get(directoryKey) ?? null };
  }
  const membership = gitPaths.get(key);
  if (!membership) return { classification: 'UNCLASSIFIED', change: 'UNKNOWN', conflict: false };
  if (membership.conflict || membership.caseFoldCollision) return { classification: 'CONFLICT', change: 'CONFLICT', conflict: true };
  if (membership.classification === 'TRACKED') {
    const worktree = worktreeChanges.has(key);
    const staged = indexChanges.has(key);
    const deleted = deletedPaths.has(key);
    const change = deleted ? 'WORKTREE_DELETED' : worktree && staged ? 'WORKTREE_AND_INDEX_MODIFIED' : worktree ? 'WORKTREE_MODIFIED' : staged ? 'INDEX_MODIFIED' : 'CLEAN_TRACKED';
    return { classification: 'TRACKED', change, conflict: false };
  }
  return { classification: membership.classification, change: membership.classification, conflict: false };
}

export function addFileToDirectoryCountsV1(relativePath, classification, counts, platform = process.platform) {
  const parts = relativePath.split('/');
  const end = parts.length - 1;
  for (let index = 0; index < end; index += 1) {
    const directory = normalizeGitPathV1(parts.slice(0, index + 1).join('/'), platform);
    const current = counts.get(directory) ?? { tracked: 0, untracked: 0, ignored: 0, unclassified: 0, conflict: 0, repository_metadata: 0, link_only: 0 };
    current[classification.toLowerCase()] += 1;
    counts.set(directory, current);
  }
  const root = counts.get('.') ?? { tracked: 0, untracked: 0, ignored: 0, unclassified: 0, conflict: 0, repository_metadata: 0, link_only: 0 };
  root[classification.toLowerCase()] += 1;
  counts.set('.', root);
}
