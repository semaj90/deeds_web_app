import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { materializeWorkspaceRevisionOriginV1, WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION } from '../../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

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

export function observeSnapshot(rootInput: string, workspaceId: string) {
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

export function validateSnapshot(snapshot: ReturnType<typeof sealSnapshot>) {
  const { schema, snapshotRevision, workspaceRevision, status, canonicalAuthority, datastoreWritesPerformed, ...body } = snapshot;
  const violations: string[] = [];
  if (schema !== 'atlas.workspace-source-snapshot-capture.v1' || hash(body) !== snapshotRevision) violations.push('MANIFEST_CHECKSUM_MISMATCH');
  if (workspaceRevision !== null || canonicalAuthority !== false || datastoreWritesPerformed !== false) violations.push('UNEXPECTED_AUTHORITY_CLAIM');
  if (status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK' || body.violations.length) violations.push('CAPTURE_NOT_VERIFIED');
  if (body.sourceMembershipChecksum !== hash([...body.sources.map(s => s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`)].sort()) || new Set(body.sources.map(s => s.sourceIdentityKey ?? `${s.repositoryPath}:${s.sourceRef}`)).size !== body.sources.length) violations.push('MEMBERSHIP_INVALID');
  if (body.sourceContentChecksum !== hash(body.sources.map(s => [s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`, s.sourceRevision, s.byteLength]))) violations.push('CONTENT_SET_INVALID');
  const root = realpathSync(body.repositoryRoot);
  let exactMatches = 0;
  for (const source of body.sources) {
    // Nested-repository entries store a workspace-relative sourceRef for
    // reporting, but the bytes live under repositoryPath. Resolve against
    // that repository root so readback validates the sealed multi-repo
    // snapshot rather than incorrectly treating every entry as root-owned.
    const repositoryRoot = path.resolve(root, source.repositoryPath ?? '');
    const relativeSource = source.repositoryRelativePath ?? source.sourceRef;
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
    } catch { violations.push(`SOURCE_READBACK_FAILED:${source.sourceRef}`); }
  }
  return { status: violations.length ? 'SNAPSHOT_READBACK_BLOCKED' : 'SNAPSHOT_BYTES_READBACK_PROVEN',
    snapshotRevision, sourceCount: body.sources.length, exactMatches, violations,
    canonicalAuthority: false, datastoreWritesPerformed: false,
    scope: 'Recorded sources only; this does not assert current full-workspace membership or Graphify admission' };
}
