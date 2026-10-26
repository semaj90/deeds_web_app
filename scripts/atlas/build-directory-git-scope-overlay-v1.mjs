import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Bool, Int8, Int32, Table, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { addFileToDirectoryCountsV1, addGitPathsV1, classifyGitPathV1, isPathUnderLinkV1, normalizeGitPathV1 } from './lib/directory-git-scope-v1.mjs';

const args = process.argv.slice(2);
const arg = (name) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id');
if (!/^git-overlay-[a-z0-9-]{1,48}$/.test(runId ?? '')) throw new Error('RUN_ID_INVALID');
const sourceManifestPath = path.resolve(root, arg('--source-manifest') ?? '.tmp/atlas/directory-intelligence/whole-repo-20261022t201500z/manifest.json');
if (!sourceManifestPath.startsWith(`${root}${path.sep}`)) throw new Error('SOURCE_MANIFEST_OUTSIDE_REPOSITORY');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sourceManifest = readJson(sourceManifestPath);
const sourceBody = { ...sourceManifest };
delete sourceBody.receiptSha256;
if (sourceManifest.schema !== 'atlas.directory-intelligence-path-snapshot.v1'
  || sourceManifest.sourceEnumerationStatus !== 'COMPLETE'
  || hash(Buffer.from(canonical(sourceBody))) !== sourceManifest.receiptSha256) throw new Error('SOURCE_MANIFEST_INVALID');
const sourceArtifactPath = path.resolve(root, sourceManifest.artifactPath);
if (!sourceArtifactPath.startsWith(`${root}${path.sep}`)) throw new Error('SOURCE_ARTIFACT_OUTSIDE_REPOSITORY');
const sourceArtifactBytes = readFileSync(sourceArtifactPath);
if (sourceArtifactBytes.length !== sourceManifest.artifactBytes || hash(sourceArtifactBytes) !== sourceManifest.artifactSha256) throw new Error('SOURCE_ARTIFACT_CHECKSUM_INVALID');
const sourceTable = tableFromIPC(sourceArtifactBytes);
if (sourceTable.numRows !== sourceManifest.rows) throw new Error('SOURCE_ROW_COUNT_INVALID');
for (const required of ['ordinal', 'relativePath', 'entryKind']) if (!sourceTable.schema.fields.some((field) => field.name === required)) throw new Error(`SOURCE_FIELD_MISSING:${required}`);
const runParent = path.join(root, '.tmp', 'atlas', 'directory-intelligence', 'git-scope');
const outputDir = path.join(runParent, runId);
mkdirSync(runParent, { recursive: true });
mkdirSync(outputDir, { recursive: false });

const maxBuffer = 1024 * 1024 * 1024;
const commandRecords = [];
const sourceRows = [];
const nestedRoots = new Map();
for (let index = 0; index < sourceTable.numRows; index += 1) {
  const row = sourceTable.get(index);
  sourceRows.push(row);
  if (row.relativePath.endsWith('/.git') && row.relativePath !== '.git') {
    const prefix = row.relativePath.slice(0, -5);
    nestedRoots.set(normalizeGitPathV1(prefix), prefix);
  }
}
const readNulSet = (buffer, label) => {
  const set = new Set();
  let start = 0;
  while (start < buffer.length) {
    const end = buffer.indexOf(0, start);
    if (end < 0) throw new Error(`GIT_PATH_LIST_NOT_NUL_TERMINATED:${label}`);
    set.add(normalizeGitPathV1(buffer.subarray(start, end).toString('utf8')));
    start = end + 1;
  }
  return set;
};
const collectScope = (repoPath, prefix, label) => {
  const output = (gitArgs) => execFileSync('git', ['-C', repoPath, ...gitArgs], { encoding: 'buffer', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
  const paths = new Map();
  const ingest = (name, gitArgs, classification) => {
    const bytes = output(gitArgs);
    const parsedPaths = classification ? null : readNulSet(bytes, `${label}:${name}`);
    const pathCount = classification ? addGitPathsV1(paths, bytes, classification, process.platform) : parsedPaths.size;
    commandRecords.push({ scope: label, name, sha256: hash(bytes), bytes: bytes.length, pathCount });
    return classification ? undefined : parsedPaths;
  };
  const worktreeChanges = ingest('worktreeChanges', ['diff', '--name-only', '-z']);
  const indexChanges = ingest('indexChanges', ['diff', '--cached', '--name-only', '-z']);
  const deletedPaths = ingest('deletedPaths', ['ls-files', '--deleted', '-z']);
  ingest('tracked', ['ls-files', '-z'], 'TRACKED');
  ingest('untracked', ['ls-files', '--others', '--exclude-standard', '-z'], 'UNTRACKED');
  ingest('ignored', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], 'IGNORED');
  const head = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { prefix, repoPath, label, paths, worktreeChanges, indexChanges, deletedPaths, head, status: 'AVAILABLE' };
};
const scopes = [collectScope(root, '', 'repository-root')];
const nestedScopeFailures = [];
for (const [normalizedPrefix, rawPrefix] of [...nestedRoots.entries()].sort((left, right) => right[0].length - left[0].length)) {
  try {
    scopes.push(collectScope(path.resolve(root, rawPrefix), normalizedPrefix, `nested:${rawPrefix}`));
  } catch {
    nestedScopeFailures.push({ prefix: rawPrefix, status: 'NESTED_GIT_SCOPE_UNAVAILABLE' });
  }
}
const nestedScopes = scopes.filter((scope) => scope.prefix).sort((left, right) => right.prefix.length - left.prefix.length);
const failedNestedScopes = nestedScopeFailures.map((item) => ({ ...item, normalizedPrefix: normalizeGitPathV1(item.prefix) }))
  .sort((left, right) => right.normalizedPrefix.length - left.normalizedPrefix.length);
const linkPrefixes = sourceRows.filter((row) => row.entryKind === 'SYMLINK_OR_JUNCTION')
  .map((row) => normalizeGitPathV1(row.relativePath));
const chooseScope = (relativePath) => {
  const key = normalizeGitPathV1(relativePath);
  const failed = failedNestedScopes.find((scope) => key === scope.normalizedPrefix || key.startsWith(`${scope.normalizedPrefix}/`));
  if (failed) return { unavailable: true, prefix: failed.normalizedPrefix };
  return nestedScopes.find((scope) => key === scope.prefix || key.startsWith(`${scope.prefix}/`)) ?? scopes[0];
};
const classifyRow = (row, directoryCounts) => {
  const scope = chooseScope(row.relativePath);
  if (scope.unavailable) return { classification: 'NESTED_REPOSITORY_UNAVAILABLE', change: 'UNKNOWN', conflict: false };
  const key = normalizeGitPathV1(row.relativePath);
  const localPath = scope.prefix ? key === scope.prefix ? '.' : key.slice(scope.prefix.length + 1) : key;
  return classifyGitPathV1(localPath, row.entryKind, scope.paths, scope.worktreeChanges, scope.indexChanges, scope.deletedPaths, directoryCounts, process.platform, row.relativePath);
};

const directoryCounts = new Map();
const snapshotKeys = new Set();
const rows = [];
const fileCounts = { TRACKED: 0, UNTRACKED: 0, IGNORED: 0, CONFLICT: 0, UNCLASSIFIED: 0, REPOSITORY_METADATA: 0, LINK_ONLY: 0, NESTED_REPOSITORY_UNAVAILABLE: 0 };
const changeCounts = {};
const unclassifiedByTopLevel = {};
const unclassifiedByRole = {};
const unclassifiedSamples = [];
let directoryRows = 0;
for (let index = 0; index < sourceTable.numRows; index += 1) {
  const row = sourceRows[index];
  if (row.ordinal !== index || typeof row.relativePath !== 'string') throw new Error('SOURCE_ORDER_OR_PATH_INVALID');
  const key = normalizeGitPathV1(row.relativePath);
  if (snapshotKeys.has(key)) throw new Error('DUPLICATE_NORMALIZED_SOURCE_PATH');
  snapshotKeys.add(key);
  if (row.entryKind !== 'DIRECTORY') {
    const result = classifyRow(row, directoryCounts);
    fileCounts[result.classification] = (fileCounts[result.classification] ?? 0) + 1;
    addFileToDirectoryCountsV1(row.relativePath, result.classification, directoryCounts);
    if (['UNCLASSIFIED', 'NESTED_REPOSITORY_UNAVAILABLE'].includes(result.classification)) {
      const top = row.relativePath.split('/')[0];
      unclassifiedByTopLevel[top] = (unclassifiedByTopLevel[top] ?? 0) + 1;
      unclassifiedByRole[row.role] = (unclassifiedByRole[row.role] ?? 0) + 1;
      if (unclassifiedSamples.length < 40) unclassifiedSamples.push({ relativePath: row.relativePath, role: row.role, classification: result.classification });
    }
  } else directoryRows += 1;
}
for (let index = 0; index < sourceTable.numRows; index += 1) {
  const row = sourceRows[index];
  const result = classifyRow(row, directoryCounts);
  changeCounts[result.change] = (changeCounts[result.change] ?? 0) + 1;
  rows.push({ ordinal: row.ordinal, result });
}

let gitPathsNotInSnapshot = 0;
let caseFoldCollisionCount = 0;
let gitPathsBehindLink = 0;
const unmatchedGitPathSamples = [];
const unmatchedGitPathKeys = new Set();
for (const scope of scopes) {
  for (const [localKey, item] of scope.paths) {
    const key = scope.prefix ? `${scope.prefix}/${localKey}` : localKey;
    if (!unmatchedGitPathKeys.has(key)) {
      unmatchedGitPathKeys.add(key);
      if (!snapshotKeys.has(key)) {
        gitPathsNotInSnapshot += 1;
        if (isPathUnderLinkV1(key, linkPrefixes)) gitPathsBehindLink += 1;
        else if (unmatchedGitPathSamples.length < 40) unmatchedGitPathSamples.push({ relativePath: key, scope: scope.label });
      }
    }
    caseFoldCollisionCount += Number(Boolean(item.caseFoldCollision));
  }
}
const gitPathsOutsideSnapshotAndLinks = gitPathsNotInSnapshot - gitPathsBehindLink;
const scopeCodes = { ROOT: 0, TRACKED: 1, UNTRACKED: 2, IGNORED: 3, CONFLICT: 4, UNCLASSIFIED: 5, DIRECTORY_AGGREGATE: 6, DIRECTORY_NO_FILE_DESCENDANTS: 7, REPOSITORY_METADATA: 8, LINK_ONLY: 9, NESTED_REPOSITORY_UNAVAILABLE: 10 };
const changeCodes = { NOT_APPLICABLE: 0, CLEAN_TRACKED: 1, WORKTREE_MODIFIED: 2, INDEX_MODIFIED: 3, WORKTREE_AND_INDEX_MODIFIED: 4, WORKTREE_DELETED: 5, UNTRACKED: 6, IGNORED: 7, UNKNOWN: 8, CONFLICT: 9, METADATA_ONLY: 10, NOT_FOLLOWED: 11 };
const code = (table, value) => {
  if (!(value in table)) throw new Error(`STATUS_CODE_UNKNOWN:${value}`);
  return table[value];
};
const scope = [];
const changes = [];
const conflicts = [];
const trackedDesc = [];
const untrackedDesc = [];
const ignoredDesc = [];
const unclassifiedDesc = [];
const conflictDesc = [];
const repositoryMetadataDesc = [];
const linkOnlyDesc = [];
for (let index = 0; index < rows.length; index += 1) {
  const result = rows[index].result;
  scope.push(code(scopeCodes, result.classification));
  changes.push(code(changeCodes, result.change));
  conflicts.push(Boolean(result.conflict));
  const counts = result.counts ?? {};
  trackedDesc.push(counts.tracked ?? 0);
  untrackedDesc.push(counts.untracked ?? 0);
  ignoredDesc.push(counts.ignored ?? 0);
  unclassifiedDesc.push(counts.unclassified ?? 0);
  conflictDesc.push(counts.conflict ?? 0);
  repositoryMetadataDesc.push(counts.repository_metadata ?? 0);
  linkOnlyDesc.push(counts.link_only ?? 0);
}
const outTable = new Table({
  ordinal: vectorFromArray(rows.map((row) => row.ordinal), new Int32()),
  gitScopeCode: vectorFromArray(scope, new Int8()),
  worktreeChangeCode: vectorFromArray(changes, new Int8()),
  membershipConflict: vectorFromArray(conflicts, new Bool()),
  descendantTracked: vectorFromArray(trackedDesc, new Int32()),
  descendantUntracked: vectorFromArray(untrackedDesc, new Int32()),
  descendantIgnored: vectorFromArray(ignoredDesc, new Int32()),
  descendantUnclassified: vectorFromArray(unclassifiedDesc, new Int32()),
  descendantConflict: vectorFromArray(conflictDesc, new Int32()),
  descendantRepositoryMetadata: vectorFromArray(repositoryMetadataDesc, new Int32()),
  descendantLinkOnly: vectorFromArray(linkOnlyDesc, new Int32()),
});
const artifactBytes = tableToIPC(outTable);
const freeBefore = statfsSync(root).bavail * statfsSync(root).bsize;
const artifactPath = path.join(outputDir, 'git-scope-overlay.arrow');
writeFileSync(artifactPath, artifactBytes, { flag: 'wx' });
const gitScopeIncomplete = fileCounts.CONFLICT > 0 || fileCounts.UNCLASSIFIED > 0 || fileCounts.NESTED_REPOSITORY_UNAVAILABLE > 0 || gitPathsOutsideSnapshotAndLinks > 0 || nestedScopeFailures.length > 0;
const body = {
  schema: 'atlas.directory-git-scope-overlay.v1',
  status: gitScopeIncomplete ? 'JOIN_COMPLETED_WITH_EXCEPTIONS' : 'JOIN_COMPLETE',
  canonicalAuthority: false,
  writesPerformed: ['run-scoped derived Arrow and manifest only'],
  rootRelativePath: '.',
  capturedAt: new Date().toISOString(),
  gitHead: scopes[0].head,
  gitStatePolicy: 'index membership plus current unstaged/staged tracked-file changes; ignored and untracked content remains non-canonical',
  caseNormalization: process.platform === 'win32' ? 'NFC + case-fold for NTFS path join' : 'NFC, case-sensitive path join',
  sourceManifestPath: path.relative(root, sourceManifestPath).replaceAll('\\', '/'),
  sourceManifestSha256: sourceManifest.receiptSha256,
  sourceArtifactPath: path.relative(root, sourceArtifactPath).replaceAll('\\', '/'),
  sourceArtifactSha256: sourceManifest.artifactSha256,
  rows: sourceTable.numRows,
  fileLikeRows: Object.values(fileCounts).reduce((sum, value) => sum + value, 0),
  directoryRows,
  gitPathCounts: Object.fromEntries(commandRecords.map(({ scope, name, pathCount }) => [`${scope}:${name}`, pathCount])),
  nestedRepositoryScopes: scopes.slice(1).map(({ prefix, head: nestedHead, label }) => ({ prefix, label, head: nestedHead, status: 'AVAILABLE' })),
  nestedRepositoryScopeFailures: nestedScopeFailures,
  snapshotFileMembershipCounts: fileCounts,
  snapshotChangeCounts: changeCounts,
  gitPathsNotInSnapshot,
  gitPathsBehindInventoryLinks: gitPathsBehindLink,
  gitPathsOutsideSnapshotAndLinks,
  unmatchedGitPathSamples,
  unclassifiedByTopLevel,
  unclassifiedByRole,
  unclassifiedSamples,
  membershipConflicts: fileCounts.CONFLICT,
  unclassifiedSnapshotFiles: fileCounts.UNCLASSIFIED + fileCounts.NESTED_REPOSITORY_UNAVAILABLE,
  caseFoldCollisions: caseFoldCollisionCount,
  gitCommandReceipts: commandRecords,
  enumCodes: { gitScopeCode: scopeCodes, worktreeChangeCode: changeCodes },
  artifact: { path: path.relative(root, artifactPath).replaceAll('\\', '/'), bytes: artifactBytes.length, sha256: hash(artifactBytes) },
  sourceWorkspaceRevision: null,
  graphifyQualification: 'NOT_PROVIDED',
  sourceQualified: false,
  productionAdmission: false,
  diskFreeBytesBefore: freeBefore,
  diskFreeBytesAfter: statfsSync(root).bavail * statfsSync(root).bsize,
};
body.receiptSha256 = hash(Buffer.from(canonical(body)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' });
const readback = readJson(manifestPath);
const readbackBody = { ...readback };
delete readbackBody.receiptSha256;
if (hash(Buffer.from(canonical(readbackBody))) !== body.receiptSha256 || hash(readFileSync(artifactPath)) !== body.artifact.sha256) throw new Error('OUTPUT_READBACK_CHECKSUM_FAILED');
console.log(JSON.stringify({ status: body.status, rows: body.rows, snapshotFileMembershipCounts: body.snapshotFileMembershipCounts, gitPathsNotInSnapshot, conflicts: body.membershipConflicts, unclassified: body.unclassifiedSnapshotFiles, artifact: body.artifact, receiptSha256: body.receiptSha256, manifest: path.relative(root, manifestPath).replaceAll('\\', '/') }));
