import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, fsyncSync, lstatSync, realpathSync, readFileSync, writeFileSync, mkdirSync, openSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { materializeWorkspaceRevisionOriginV1, WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION, type WorkspaceDigestCacheEntryV1, type WorkspaceDigestCacheV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

export const hash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const sourceRef = (value: string) => value.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^\.\//, '');
const git = (root: string, args: string[]) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
});
export const policy = {
  revision: 'atlas.workspace-snapshot-capture.v1',
  inventoryPolicyRevision: WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION,
  nestedPolicy: 'GITLINKS_AND_GIT_LISTED_EMBEDDED_REPOSITORIES',
  ignoredNestedRepositories: 'EXCLUDED',
  sourcePolicy: 'EXISTING_ORIGIN_RUNTIME_UTF8_MAX_5MIB',
  bytesMaterialized: false,
  processingRequiresByteReadback: true,
};

function state(root: string) {
  return {
    head: git(root, ['rev-parse', 'HEAD']).trim(),
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
    indexChecksum: hash(git(root, ['ls-files', '--stage', '-z'])),
    trackedTree: git(root, ['rev-parse', 'HEAD^{tree}']).trim(),
  };
}

const DIGEST_CACHE_SCHEMA = 'atlas.workspace-digest-cache.v2';
const digestCachePolicyRevision = hash({ capturePolicy: policy, originPolicy: WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION });

function listRepositoryRoots(rootInput: string, workspaceId: string): Array<{ relativePath: string; realPath: string; head: string }> {
  const root = realpathSync(rootInput);
  const repositories: Array<{ relativePath: string; realPath: string; head: string }> = [];
  const visited = new Set<string>();
  const visit = (relativePath: string) => {
    const directory = path.resolve(root, relativePath || '.');
    const realPath = realpathSync(directory);
    if (realPath !== root && !realPath.startsWith(`${root}${path.sep}`)) throw new Error(`NESTED_REPOSITORY_OUTSIDE_ROOT:${relativePath}`);
    if (visited.has(realPath)) return;
    visited.add(realPath);
    repositories.push({ relativePath, realPath, head: git(directory, ['rev-parse', 'HEAD']).trim() });
    const children = new Set<string>();
    for (const row of git(directory, ['ls-files', '--stage', '-z']).split('\0')) {
      if (row.startsWith('160000 ')) children.add(row.slice(row.indexOf('\t') + 1));
    }
    for (const row of git(directory, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
      const candidate = row.replace(/\/$/, '');
      if (existsSync(path.join(directory, candidate, '.git'))) children.add(candidate);
    }
    for (const child of [...children].sort()) {
      const childPath = path.resolve(directory, child);
      if (childPath.startsWith(`${root}${path.sep}`) && existsSync(childPath) && existsSync(path.join(childPath, '.git')))
        visit([relativePath, child].filter(Boolean).join('/'));
    }
  };
  if (!workspaceId.trim()) throw new Error('WORKSPACE_ID_REQUIRED_FOR_DIGEST_CACHE');
  visit('');
  return repositories.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function createDigestCacheContext(root: string, workspaceId: string) {
  const repositories = listRepositoryRoots(root, workspaceId);
  return {
    workspaceId,
    repositoryRootsChecksum: hash({ workspaceId, repositories }),
  };
}

function validDigestCacheEntries(entries: unknown): entries is Record<string, WorkspaceDigestCacheEntryV1> {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;
  return Object.entries(entries).every(([key, entry]) => {
    if (!path.isAbsolute(key) || !entry || typeof entry !== 'object') return false;
    const value = entry as { size?: unknown; mtimeNs?: unknown; sourceRevision?: unknown; contentDigest?: unknown; byteLength?: unknown };
    return Number.isSafeInteger(value.size) && Number(value.size) >= 0
      && typeof value.mtimeNs === 'string' && /^\d+$/.test(value.mtimeNs)
      && typeof value.sourceRevision === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.sourceRevision)
      && typeof value.contentDigest === 'string' && /^[a-f0-9]{64}$/.test(value.contentDigest)
      && Number.isSafeInteger(value.byteLength) && Number(value.byteLength) >= 0
      && value.size === value.byteLength;
  });
}

/** Load a persisted digest cache; any mismatch (schema, policy, corruption) yields an empty cache. */
export function loadDigestCache(cachePath: string, context: ReturnType<typeof createDigestCacheContext>): WorkspaceDigestCacheV1 {
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf8'));
    const { checksum, ...body } = raw ?? {};
    if (body.schema !== DIGEST_CACHE_SCHEMA
      || body.policyRevision !== digestCachePolicyRevision
      || body.workspaceId !== context.workspaceId
      || body.repositoryRootsChecksum !== context.repositoryRootsChecksum
      || !validDigestCacheEntries(body.entries)
      || checksum !== hash(body)) return new Map();
    return new Map(Object.entries(raw.entries ?? {})) as WorkspaceDigestCacheV1;
  } catch { return new Map(); }
}

/** Persist derived digests atomically (temp + rename). Derived cache only; never authority. */
export function saveDigestCache(
  cachePath: string,
  cache: WorkspaceDigestCacheV1,
  context: ReturnType<typeof createDigestCacheContext>,
  testHooks: { beforeAtomicRename?: () => void } = {},
) {
  mkdirSync(path.dirname(cachePath), { recursive: true });
  const body = {
    schema: DIGEST_CACHE_SCHEMA,
    policyRevision: digestCachePolicyRevision,
    workspaceId: context.workspaceId,
    repositoryRootsChecksum: context.repositoryRootsChecksum,
    entries: Object.fromEntries(cache),
  };
  const serialized = JSON.stringify({ ...body, checksum: hash(body) });
  const tmp = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(tmp, 'wx');
    writeFileSync(descriptor, serialized);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    testHooks.beforeAtomicRename?.();
    renameSync(tmp, cachePath);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(tmp, { force: true });
    throw error;
  }
}

export function observeSnapshot(rootInput: string, workspaceId: string, options: { digestCache?: WorkspaceDigestCacheV1; digestStats?: { reused: number; rehashed: number } } = {}) {
  const root = realpathSync(rootInput);
  if (realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim()) !== root) throw new Error('ROOT_IS_NOT_REPOSITORY_ROOT');
  const repositories: any[] = [];
  const sources: any[] = [];
  const violations: string[] = [];
  const visit = (relativePath: string, kind: string) => {
    const directory = path.resolve(root, relativePath || '.');
    if (relativePath && (!existsSync(directory) || !existsSync(path.join(directory, '.git')))) {
      violations.push(`NESTED_REPOSITORY_UNAVAILABLE:${relativePath}`); return;
    }
    if (directory !== root && (!realpathSync(directory).startsWith(root + path.sep) || lstatSync(directory).isSymbolicLink())) {
      violations.push(`NESTED_REPOSITORY_OUTSIDE_ROOT:${relativePath}`); return;
    }
    const before = state(directory);
    const listed = git(directory, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    const nested = new Map<string, string>();
    for (const row of git(directory, ['ls-files', '--stage', '-z']).split('\0')) {
      if (row.startsWith('160000 ')) nested.set(row.slice(row.indexOf('\t') + 1), 'SUBMODULE');
    }
    for (const file of listed) {
      const candidate = file.replace(/\/$/, '');
      if (existsSync(path.join(directory, candidate, '.git')) && !nested.has(candidate)) nested.set(candidate, 'NESTED_GIT_REPOSITORY');
    }
    const observed = materializeWorkspaceRevisionOriginV1({
      workspaceRoot: directory, repositoryId: workspaceId,
      producerRevision: policy.revision, generatedAt: '2000-01-01T00:00:00.000Z',
      digestCache: options.digestCache,
      digestStats: options.digestStats,
    });
    const deletedTracked: string[] = [];
    for (const row of observed.bindings) {
      const full = path.resolve(directory, row.sourceRef);
      if (!realpathSync(full).startsWith(root + path.sep) || lstatSync(full).isSymbolicLink()) {
        violations.push(`SOURCE_SYMLINK_OR_ESCAPE:${relativePath}/${row.sourceRef}`); continue;
      }
      const repositoryId = relativePath ? `repo:${sourceRef(relativePath)}` : 'repo:root';
      const repositoryRelativePath = sourceRef(row.sourceRef);
      sources.push({
        sourceRef: sourceRef([relativePath, row.sourceRef].filter(Boolean).join('/')),
        repositoryId,
        repositoryRelativePath,
        sourceIdentityKey: `${repositoryId}:${repositoryRelativePath}`,
        sourceRevision: row.sourceRevision, contentDigest: row.contentDigest,
        byteLength: row.byteLength, repositoryPath: relativePath,
      });
    }
    for (const skip of observed.skipped) {
      const expectedSkip = skip.reason === 'SOURCE_TOO_LARGE' || skip.reason === 'NOT_VALID_UTF8_SOURCE' || skip.reason === 'NOT_REGULAR_FILE' || skip.reason.toLowerCase().includes('non-empty');
      const skippedPath = path.resolve(directory, skip.sourceRef);
      const trackedDeleted = !existsSync(skippedPath) && (() => { try { git(directory, ['ls-files', '--error-unmatch', '--', skip.sourceRef]); return true; } catch { return false; } })();
      if (trackedDeleted) deletedTracked.push(sourceRef(skip.sourceRef));
      else if (!expectedSkip) violations.push(`SOURCE_READ_FAILED:${sourceRef([relativePath, skip.sourceRef].filter(Boolean).join('/'))}`);
    }
    const after = state(directory);
    if (hash(before) !== hash(after)) violations.push(`GIT_CHANGED_DURING_CAPTURE:${relativePath}`);
    repositories.push({ relativePath, kind, ...before, dirty: observed.record.dirty,
      sourceMembershipChecksum: hash(observed.bindings.map(b => `${relativePath ? `repo:${sourceRef(relativePath)}` : 'repo:root'}:${sourceRef(b.sourceRef)}`)),
      sourceContentChecksum: hash(observed.bindings.map(b => [
        `${relativePath ? `repo:${sourceRef(relativePath)}` : 'repo:root'}:${sourceRef(b.sourceRef)}`,
        b.contentDigest,
      ])),
      skipped: observed.skipped, deletedTracked });
    for (const [child, childKind] of [...nested].sort()) visit([relativePath, child].filter(Boolean).join('/'), childKind);
  };
  visit('', 'ROOT');
  sources.sort((a, b) => a.sourceRef < b.sourceRef ? -1 : a.sourceRef > b.sourceRef ? 1 : 0);
  if (new Set(sources.map(s => s.sourceIdentityKey ?? `${s.repositoryPath}:${s.sourceRef}`)).size !== sources.length) {
    violations.push('DUPLICATE_REPOSITORY_QUALIFIED_SOURCE_IDENTITY');
  }
  return { workspaceId, repositoryRoot: root, policy, repositories, sources, violations };
}

export function sealSnapshot(first: ReturnType<typeof observeSnapshot>, second: ReturnType<typeof observeSnapshot>) {
  const violations = [...first.violations, ...second.violations];
  if (hash(first) !== hash(second)) violations.push('WORKSPACE_CHANGED_BETWEEN_SCANS');
  const body = { ...second, violations: [...new Set(violations)],
    sourceMembershipChecksum: hash([...second.sources.map(s => s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`)].sort()),
    sourceContentChecksum: hash(second.sources.map(s => [s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`, s.sourceRevision, s.byteLength])) };
  return { schema: 'atlas.workspace-source-snapshot-capture.v1', ...body,
    snapshotRevision: hash(body), workspaceRevision: null,
    status: violations.length ? 'CAPTURE_BLOCKED' : 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK',
    canonicalAuthority: false, datastoreWritesPerformed: false };
}

/**
 * Capture a stable read-only frame with bounded quiescence retries. A retry
 * only replaces the observation being compared; it never merges two frames or
 * suppresses a real violation. Exhausting attempts preserves the blocked
 * receipt, so this helper cannot turn a live worktree into authority.
 */
export function captureStableSnapshot(
  root: string,
  workspaceId: string,
  options: { maxAttempts?: number; digestCachePath?: string; onDigestStats?: (scans: Array<{ reused: number; rehashed: number }>) => void } = {},
) {
  const maxAttempts = Number.isInteger(options.maxAttempts) && (options.maxAttempts ?? 0) > 0
    ? options.maxAttempts!
    : 3;
  // One in-memory digest cache is shared by the scans of this capture so the confirming scan only
  // re-stats unchanged files. validateSnapshot() never uses it: byte readback stays the oracle.
  const cacheContext = createDigestCacheContext(root, workspaceId);
  const digestCache: WorkspaceDigestCacheV1 = options.digestCachePath ? loadDigestCache(options.digestCachePath, cacheContext) : new Map();
  const scanStats: Array<{ reused: number; rehashed: number }> = [];
  const newScanStats = () => { const s = { reused: 0, rehashed: 0 }; scanStats.push(s); return s; };
  let first = observeSnapshot(root, workspaceId, { digestCache, digestStats: newScanStats() });
  let transientDriftObserved = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const second = observeSnapshot(root, workspaceId, { digestCache, digestStats: newScanStats() });
    const report = sealSnapshot(first, second);
    const drifted = report.violations.includes('WORKSPACE_CHANGED_BETWEEN_SCANS');
    if (!drifted || attempt === maxAttempts) {
      // Include capture metadata in the sealed checksum. Previously these
      // fields were appended after sealSnapshot() computed snapshotRevision,
      // making every stable capture fail readback with a false
      // MANIFEST_CHECKSUM_MISMATCH.
      if (options.digestCachePath) saveDigestCache(options.digestCachePath, digestCache, cacheContext);
      options.onDigestStats?.(scanStats);
      const withCaptureMetadata = { ...report, captureAttempts: attempt, transientDriftObserved };
      const {
        schema,
        snapshotRevision,
        workspaceRevision,
        status,
        canonicalAuthority,
        datastoreWritesPerformed,
        ...checksumBody
      } = withCaptureMetadata;
      return { ...withCaptureMetadata, snapshotRevision: hash(checksumBody) };
    }
    transientDriftObserved = true;
    first = second;
  }
  throw new Error('SNAPSHOT_CAPTURE_RETRY_EXHAUSTED');
}

export function validateSnapshot(snapshot: ReturnType<typeof sealSnapshot>, options?: { sourceReadRoot?: string; digestCachePath?: string }) {
  const { schema, snapshotRevision, workspaceRevision, status, canonicalAuthority, datastoreWritesPerformed, ...body } = snapshot;
  const violations: string[] = [];
  const violationDetails: Array<{ sourceRef: string; code: string }> = [];
  if (schema !== 'atlas.workspace-source-snapshot-capture.v1' || hash(body) !== snapshotRevision) violations.push('MANIFEST_CHECKSUM_MISMATCH');
  if (workspaceRevision !== null || canonicalAuthority !== false || datastoreWritesPerformed !== false) violations.push('UNEXPECTED_AUTHORITY_CLAIM');
  if (status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK' || body.violations.length) violations.push('CAPTURE_NOT_VERIFIED');
  if (body.sourceMembershipChecksum !== hash([...body.sources.map(s => s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`)].sort()) || new Set(body.sources.map(s => s.sourceIdentityKey ?? `${s.repositoryPath}:${s.sourceRef}`)).size !== body.sources.length) violations.push('MEMBERSHIP_INVALID');
  if (body.sourceContentChecksum !== hash(body.sources.map(s => [s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`, s.sourceRevision, s.byteLength]))) violations.push('CONTENT_SET_INVALID');
  const root = realpathSync(body.repositoryRoot);
  let exactMatches = 0;
  let digestCacheInvalidated = false;
  for (const source of body.sources) {
    // Nested-repository entries store a workspace-relative sourceRef for
    // reporting, but the bytes live under repositoryPath. Resolve against
    // that repository root so readback validates the sealed multi-repo
    // snapshot rather than incorrectly treating every entry as root-owned.
    const materializedRoot = options?.sourceReadRoot ? realpathSync(options.sourceReadRoot) : null;
    const repositoryRoot = materializedRoot
      ? materializedRoot
      : path.resolve(root, source.repositoryPath ?? '');
    const relativeSource = materializedRoot
      ? source.sourceRef
      : source.repositoryRelativePath ?? source.sourceRef;
    const file = path.resolve(repositoryRoot, relativeSource);
    try {
      const resolvedRepositoryRoot = realpathSync(repositoryRoot);
      if (!file.startsWith(resolvedRepositoryRoot + path.sep)
        || !realpathSync(file).startsWith(resolvedRepositoryRoot + path.sep)
        || lstatSync(file).isSymbolicLink()) throw new Error('UNSAFE_PATH');
      const bytes = readFileSync(file);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== source.contentDigest || source.sourceRevision !== `sha256:${digest}` || bytes.length !== source.byteLength) throw new Error('SOURCE_BYTES_CHANGED');
      exactMatches++;
    } catch (error) {
      // Preserve the stable aggregate violation string for existing callers,
      // but expose the actionable reason so audits can distinguish a missing
      // file from changed bytes or an unsafe path.
      const message = error instanceof Error ? error.message : String(error);
      const code = message === 'SOURCE_BYTES_CHANGED'
        ? 'SOURCE_BYTES_CHANGED'
        : message === 'UNSAFE_PATH'
          ? 'UNSAFE_PATH'
          : !existsSync(file)
            ? 'SOURCE_FILE_MISSING'
            : 'SOURCE_READBACK_ERROR';
      violations.push(`SOURCE_READBACK_FAILED:${source.sourceRef}`);
      violationDetails.push({ sourceRef: source.sourceRef, code });
      if (code === 'SOURCE_BYTES_CHANGED' && options?.digestCachePath) {
        rmSync(options.digestCachePath, { force: true });
        digestCacheInvalidated = true;
      }
    }
  }
  const violationCounts = violationDetails.reduce<Record<string, number>>((counts, detail) => {
    counts[detail.code] = (counts[detail.code] ?? 0) + 1;
    return counts;
  }, {});
  return { status: violations.length ? 'SNAPSHOT_READBACK_BLOCKED' : 'SNAPSHOT_BYTES_READBACK_PROVEN',
    snapshotRevision, sourceCount: body.sources.length, exactMatches, violations,
    violationDetails, violationCounts,
    digestCacheInvalidated,
    canonicalAuthority: false, datastoreWritesPerformed: false,
    scope: 'Recorded sources only; this does not assert current full-workspace membership or Graphify admission' };
}
