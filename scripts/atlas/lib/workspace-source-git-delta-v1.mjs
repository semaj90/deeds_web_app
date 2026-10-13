import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

const nul = '\0';
const normalizePath = (value) => String(value).replaceAll('\\', '/').replace(/^\.\//, '');
const policyPath = (value) => /(?:^|\/)(?:\.gitignore|\.gitattributes|\.gitmodules)$/i.test(value)
  || /^(?:scripts\/atlas\/lib\/(?:workspace-snapshot-capture-v1|canonical-source-inventory-hygiene-v1|whole-codebase-source-exclusions)\.|sveltekit-frontend\/src\/lib\/server\/atlas\/indexing\/workspace-revision-origin-runtime-v1\.)/.test(value);

function parseNameStatusZ(bytes) {
  const fields = Buffer.isBuffer(bytes) ? bytes.toString('utf8').split(nul) : String(bytes).split(nul);
  const records = [];
  for (let index = 0; index < fields.length && fields[index];) {
    const status = fields[index++];
    const kind = status[0];
    if (kind === 'R' || kind === 'C') {
      const previousPath = normalizePath(fields[index++] ?? '');
      const sourceRef = normalizePath(fields[index++] ?? '');
      if (!previousPath || !sourceRef) throw new Error('GIT_DELTA_RENAME_RECORD_INVALID');
      records.push({ kind: kind === 'R' ? 'RENAME' : 'COPY', sourceRef, previousPath, status });
    } else {
      const sourceRef = normalizePath(fields[index++] ?? '');
      if (!sourceRef) throw new Error('GIT_DELTA_PATH_RECORD_INVALID');
      const operation = kind === 'A' ? 'ADD' : kind === 'D' ? 'DELETE' : kind === 'M' || kind === 'T' ? 'MODIFY' : null;
      if (!operation) throw new Error(`GIT_DELTA_STATUS_UNSUPPORTED:${status}`);
      records.push({ kind: operation, sourceRef, previousPath: null, status });
    }
  }
  return records;
}

function defaultGit(repoPath, args, encoding = 'buffer') {
  return execFileSync('git', args, {
    cwd: repoPath,
    encoding: encoding === 'buffer' ? undefined : encoding,
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
}

function captureGitState(repoPath, git) {
  return {
    head: String(git(repoPath, ['rev-parse', 'HEAD'], 'utf8')).trim(),
    status: Buffer.from(git(repoPath, ['status', '--porcelain=v2', '-z', '--untracked-files=all'])),
    index: Buffer.from(git(repoPath, ['ls-files', '--stage', '-z'])),
  };
}

export function collectRepositorySourceGitDeltaV1({
  repositoryPath,
  repositoryRelativePath = '',
  baselineCommit,
  previousDirtyPaths = [],
  knownNestedRepositories = [],
  git = defaultGit,
}) {
  if (!repositoryPath || !isAbsolute(repositoryPath) || !baselineCommit || !/^[a-f0-9]{40,64}$/i.test(baselineCommit)) {
    throw new Error('GIT_DELTA_BASELINE_OR_REPOSITORY_INVALID');
  }
  const repoPath = resolve(repositoryPath);
  const before = captureGitState(repoPath, git);
  let ancestry;
  try {
    git(repoPath, ['merge-base', '--is-ancestor', baselineCommit, before.head]);
    ancestry = true;
  } catch {
    ancestry = false;
  }
  if (!ancestry) {
    return {
      repositoryRelativePath,
      baselineCommit,
      currentHead: before.head,
      status: 'FULL_RECAPTURE_REQUIRED',
      reason: 'BASELINE_NOT_ANCESTOR_OF_HEAD',
      changedPaths: [],
      sourceBytesRead: 0,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  let records;
  let untracked;
  try {
    records = parseNameStatusZ(git(repoPath, ['diff', '--name-status', '-z', '-M', baselineCommit, '--']));
    untracked = Buffer.from(git(repoPath, ['ls-files', '--others', '--exclude-standard', '-z']))
      .toString('utf8').split(nul).filter(Boolean).map(normalizePath);
  } catch (error) {
    return {
      repositoryRelativePath,
      baselineCommit,
      currentHead: before.head,
      status: 'FULL_RECAPTURE_REQUIRED',
      reason: error instanceof Error ? `GIT_DELTA_READ_FAILED:${error.message}` : 'GIT_DELTA_READ_FAILED',
      changedPaths: [],
      sourceBytesRead: 0,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  const after = captureGitState(repoPath, git);
  if (before.head !== after.head || !before.status.equals(after.status) || !before.index.equals(after.index)) {
    return {
      repositoryRelativePath,
      baselineCommit,
      currentHead: after.head,
      status: 'FULL_RECAPTURE_REQUIRED',
      reason: 'GIT_STATE_CHANGED_DURING_DELTA',
      changedPaths: [],
      sourceBytesRead: 0,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  if (before.status.toString('utf8').split(nul).some((record) => record.startsWith('u '))) {
    return {
      repositoryRelativePath,
      baselineCommit,
      currentHead: before.head,
      status: 'FULL_RECAPTURE_REQUIRED',
      reason: 'UNMERGED_INDEX_STATE',
      changedPaths: [],
      sourceBytesRead: 0,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  const nestedRoots = new Set(knownNestedRepositories.map(normalizePath).filter(Boolean));
  const changes = new Map();
  for (const record of records) {
    if (record.kind === 'COPY') {
      return {
        repositoryRelativePath,
        baselineCommit,
        currentHead: before.head,
        status: 'FULL_RECAPTURE_REQUIRED',
        reason: 'COPY_REQUIRES_OWNER_REVIEW',
        changedPaths: [],
        sourceBytesRead: 0,
        canonicalAuthority: false,
        writesPerformed: false,
      };
    }
    if (record.previousPath) changes.set(record.previousPath, { sourceRef: record.previousPath, operation: 'DELETE', previousPath: null });
    changes.set(record.sourceRef, {
      sourceRef: record.sourceRef,
      operation: record.kind === 'RENAME' ? 'RENAME' : record.kind,
      previousPath: record.previousPath,
    });
  }
  for (const sourceRef of untracked) {
    if (!changes.has(sourceRef)) changes.set(sourceRef, { sourceRef, operation: 'ADD', previousPath: null });
  }
  if (!Array.isArray(previousDirtyPaths)
    || previousDirtyPaths.some((sourceRef) => typeof sourceRef !== 'string' || !normalizePath(sourceRef))) {
    return {
      repositoryRelativePath,
      baselineCommit,
      currentHead: before.head,
      status: 'FULL_RECAPTURE_REQUIRED',
      reason: 'PREVIOUS_DIRTY_PATHS_INVALID',
      changedPaths: [],
      sourceBytesRead: 0,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }
  for (const sourceRef of previousDirtyPaths.map(normalizePath)) {
    if (!changes.has(sourceRef)) changes.set(sourceRef, { sourceRef, operation: 'MODIFY', previousPath: null });
  }
  const changedPaths = [...changes.values()].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef, 'en'));
  const policyChanges = changedPaths.filter((row) => policyPath(row.sourceRef));
  if (policyChanges.length) {
    return {
      repositoryRelativePath,
      baselineCommit,
      currentHead: before.head,
      status: 'FULL_RECAPTURE_REQUIRED',
      reason: 'SOURCE_SELECTION_POLICY_INPUT_CHANGED',
      policyChanges: policyChanges.map((row) => row.sourceRef),
      changedPaths,
      sourceBytesRead: 0,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }
  const nestedChanges = changedPaths.filter((row) => nestedRoots.has(row.sourceRef));
  if (nestedChanges.length) {
    return {
      repositoryRelativePath,
      baselineCommit,
      currentHead: before.head,
      status: 'FULL_RECAPTURE_REQUIRED',
      reason: 'NESTED_REPOSITORY_POINTER_CHANGED',
      nestedChanges: nestedChanges.map((row) => row.sourceRef),
      changedPaths,
      sourceBytesRead: 0,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }
  return {
    repositoryRelativePath,
    baselineCommit,
    currentHead: before.head,
    status: 'GIT_DELTA_READY_NOT_ADMITTED',
    changedPaths,
    changedCount: changedPaths.length,
    sourceBytesRead: 0,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export { parseNameStatusZ as parseGitNameStatusZV1 };
