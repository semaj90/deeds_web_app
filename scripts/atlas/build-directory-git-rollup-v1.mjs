#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tableFromIPC } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { buildDirectoryGitRollupV1 } from './lib/directory-git-rollup-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^git-rollup-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const resolveInside = (value, label) => {
  const resolved = path.resolve(root, value ?? '');
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label}_OUTSIDE_REPOSITORY`);
  return resolved;
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readManifest = (file, digestField) => {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const body = { ...manifest };
  delete body[digestField];
  if (hash(Buffer.from(canonical(body))) !== manifest[digestField]) throw new Error(`${digestField.toUpperCase()}_INVALID`);
  return manifest;
};

const pathManifestPath = resolveInside(arg('--path-manifest'), 'PATH_MANIFEST');
const gitManifestPath = resolveInside(arg('--git-manifest'), 'GIT_MANIFEST');
const pathManifest = readManifest(pathManifestPath, 'receiptSha256');
const gitManifest = readManifest(gitManifestPath, 'receiptSha256');
if (pathManifest.schema !== 'atlas.directory-intelligence-path-snapshot.v1'
  || pathManifest.sourceEnumerationStatus !== 'COMPLETE'
  || pathManifest.canonicalAuthority !== false
  || pathManifest.writesPerformed !== false) throw new Error('PATH_MANIFEST_NOT_ADVISORY_COMPLETE');
if (gitManifest.schema !== 'atlas.directory-git-scope-overlay.v1'
  || gitManifest.canonicalAuthority !== false
  || gitManifest.sourceQualified !== false
  || gitManifest.sourceManifestSha256 !== pathManifest.receiptSha256
  || gitManifest.sourceArtifactSha256 !== pathManifest.artifactSha256
  || gitManifest.rows !== pathManifest.rows) throw new Error('GIT_OVERLAY_SOURCE_BINDING_INVALID');

const pathArtifactPath = resolveInside(pathManifest.artifactPath, 'PATH_ARTIFACT');
const gitArtifactPath = resolveInside(gitManifest.artifact.path, 'GIT_ARTIFACT');
const pathBytes = readFileSync(pathArtifactPath);
const gitBytes = readFileSync(gitArtifactPath);
if (hash(pathBytes) !== pathManifest.artifactSha256 || pathBytes.length !== pathManifest.artifactBytes) throw new Error('PATH_ARTIFACT_CHECKSUM_INVALID');
if (hash(gitBytes) !== gitManifest.artifact.sha256 || gitBytes.length !== gitManifest.artifact.bytes) throw new Error('GIT_ARTIFACT_CHECKSUM_INVALID');
const pathTable = tableFromIPC(pathBytes);
const gitTable = tableFromIPC(gitBytes);
if (pathTable.numRows !== pathManifest.rows || gitTable.numRows !== gitManifest.rows) throw new Error('INPUT_ARROW_ROW_COUNT_INVALID');
const requiredBytes = Math.ceil((pathBytes.length + gitBytes.length) * 0.05) + 1024 * 1024;
if (statfsSync(root).bavail * statfsSync(root).bsize < requiredBytes) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');

const result = buildDirectoryGitRollupV1(pathTable, gitTable);
const rootTable = tableFromIPC(result.bytes);
const rootIndex = rootTable.getChild('directoryPath').indexOf('.');
if (rootIndex < 0) throw new Error('ROOT_ROLLUP_MISSING');
const rootCounts = JSON.parse(rootTable.getChild('subtreeGitScopeCountsJson').get(rootIndex));
if (result.unresolvedParentCount || Object.values(rootCounts).reduce((sum, count) => sum + count, 0) !== result.fileLikeRows) {
  throw new Error('GIT_SCOPE_ROLLUP_RECONCILIATION_FAILED');
}

const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
mkdirSync(outputDir, { recursive: false });
const artifactPath = path.join(outputDir, 'directory-git-scope-rollup.arrow');
writeFileSync(artifactPath, result.bytes, { flag: 'wx' });
const relative = value => path.relative(root, value).replaceAll('\\', '/');
const body = {
  schema: 'atlas.directory-git-scope-rollup.v1',
  status: 'DERIVED_ADVISORY_ROLLUP',
  canonicalAuthority: false,
  writesPerformed: ['run-scoped derived Arrow and manifest only'],
  pathManifestPath: relative(pathManifestPath),
  pathManifestSha256: pathManifest.receiptSha256,
  gitScopeManifestPath: relative(gitManifestPath),
  gitScopeManifestSha256: gitManifest.receiptSha256,
  sourcePathCount: pathTable.numRows,
  directoryCount: result.directoryCount,
  fileLikeRows: result.fileLikeRows,
  unresolvedParentCount: result.unresolvedParentCount,
  rootSubtreeGitScopeCounts: rootCounts,
  artifactPath: relative(artifactPath),
  artifactBytes: result.bytes.length,
  artifactSha256: hash(result.bytes),
  columns: result.columns,
  sourceWorkspaceRevision: pathManifest.sourceWorkspaceRevision ?? null,
  graphifyQualification: 'NOT_PROVIDED',
  sourceQualified: false,
  productionAdmission: false,
  semantics: 'Run-local path hierarchy rollup of Git membership codes; not canonical source authority or Graphify evidence',
};
body.receiptSha256 = hash(Buffer.from(canonical(body)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' });
const readback = readManifest(manifestPath, 'receiptSha256');
if (readback.receiptSha256 !== body.receiptSha256 || hash(readFileSync(artifactPath)) !== body.artifactSha256
  || tableFromIPC(readFileSync(artifactPath)).numRows !== body.directoryCount) throw new Error('OUTPUT_READBACK_CHECKSUM_FAILED');
console.log(JSON.stringify({
  status: body.status,
  manifestPath: relative(manifestPath),
  receiptSha256: body.receiptSha256,
  artifactSha256: body.artifactSha256,
  sourcePathCount: body.sourcePathCount,
  directoryCount: body.directoryCount,
  fileLikeRows: body.fileLikeRows,
  unresolvedParentCount: body.unresolvedParentCount,
  rootSubtreeGitScopeCounts: body.rootSubtreeGitScopeCounts,
}));
