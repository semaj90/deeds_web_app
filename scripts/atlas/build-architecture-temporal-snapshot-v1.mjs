#!/usr/bin/env node
/**
 * Capture an immutable, scope-bounded architecture-document snapshot using
 * Parent Atlas TemporalDocumentIndexV1. No database or cache is contacted.
 * A prior snapshot is used only when its exact path is supplied explicitly.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const snapshotDir = join(root, 'docs', 'reports', 'architecture-temporal-snapshots');
const previousArg = process.argv.find((arg) => arg.startsWith('--previous='));
const previousPath = previousArg ? previousArg.slice('--previous='.length) : null;
const checkOnly = process.argv.includes('--check');
const { buildTemporalDocumentIndex, sourceArtifactSchema, sourceRevisionDeltaSchema, temporalIndexChecksum, temporalDocumentIndexSchema } = await (await import('tsx/esm/api')).tsImport(
  '../../packages/parent-atlas/src/core/temporal-indexing-fabric.ts',
  import.meta.url,
);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const toRepoPath = (value) => relative(root, value).split(sep).join('/');

function walk(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', 'dist', 'build', '.svelte-kit'].includes(entry.name)) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, found);
    else if (/\.(md|json)$/i.test(entry.name)) found.push(absolute);
  }
  return found;
}

function loadPriorSnapshot(pathname) {
  const absolute = pathname ? (pathname.match(/^[A-Za-z]:[\\/]/) ? pathname : join(root, pathname)) : null;
  if (!absolute || !existsSync(absolute)) throw new Error('PREVIOUS_SNAPSHOT_PATH_REQUIRED_AND_MUST_EXIST');
  const prior = JSON.parse(readFileSync(absolute, 'utf8'));
  if (prior.schema !== 'atlas.architecture-temporal-snapshot.v1') throw new Error('PREVIOUS_SNAPSHOT_SCHEMA_MISMATCH');
  const index = temporalDocumentIndexSchema.parse(prior.temporal_document_index);
  const { index_checksum: _checksum, ...indexBody } = index;
  if (temporalIndexChecksum(indexBody) !== index.index_checksum) throw new Error('PREVIOUS_TEMPORAL_INDEX_CHECKSUM_MISMATCH');
  const artifacts = prior.source_artifacts.map((artifact) => sourceArtifactSchema.parse(artifact));
  return { prior, index, artifacts };
}

const sourceFiles = [
  ...walk(join(root, 'docs', 'architecture')).filter((path) => toRepoPath(path) !== 'docs/architecture/ARCH-TOC.md'),
  join(root, '.claude', 'skills', 'parent-atlas-workstation', 'SKILL.md'),
].filter((path) => existsSync(path))
  .sort((a, b) => toRepoPath(a).localeCompare(toRepoPath(b)));
if (sourceFiles.length === 0) throw new Error('ARCHITECTURE_SOURCE_SET_EMPTY');

const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const capturedAt = new Date().toISOString();
const producerRevision = `sha256:${sha256(readFileSync(scriptPath))}`;
const sourceArtifacts = sourceFiles.map((absolute) => {
  const sourceRef = toRepoPath(absolute);
  const bytes = readFileSync(absolute);
  const contentDigest = sha256(bytes);
  const extension = extname(sourceRef).toLowerCase();
  const language = extension === '.md' ? 'markdown' : 'json';
  const raw = {
    schema: 'atlas.source-artifact.v1',
    file_id: `docfile:${sha256(sourceRef)}`,
    repo_id: 'deeds-web-app',
    workspace_revision: 'pending',
    canonical_source_ref: sourceRef,
    source_revision: `sha256:${contentDigest}`,
    content_digest: contentDigest,
    byte_length: bytes.byteLength,
    mime_type: extension === '.md' ? 'text/markdown' : 'application/json',
    language,
    predecessor_source_revision: null,
    supersedes_source_revision: null,
    observed_at: capturedAt,
    admitted_at: null,
    retired_at: null,
    producer_id: 'architecture-temporal-snapshot-builder-v1',
    producer_revision: producerRevision,
    canonical_authority: false,
  };
  return raw;
});

const sourceIdentityRows = sourceArtifacts.map(({ canonical_source_ref, source_revision, content_digest }) => ({
  source_ref: canonical_source_ref,
  source_revision,
  content_digest,
}));
const sourceSnapshotRevision = `sha256:${temporalIndexChecksum(sourceIdentityRows)}`;
const workspaceRevision = `workspace-scope:sha256:${temporalIndexChecksum({ git_head: gitHead, source_snapshot_revision: sourceSnapshotRevision })}`;
const validatedArtifacts = sourceArtifacts.map((artifact) =>
  sourceArtifactSchema.parse({ ...artifact, workspace_revision: workspaceRevision }));

let previous = null;
if (previousPath) previous = loadPriorSnapshot(previousPath);
const previousByRef = new Map((previous?.artifacts ?? []).map((artifact) => [artifact.canonical_source_ref, artifact]));
const currentByRef = new Map(validatedArtifacts.map((artifact) => [artifact.canonical_source_ref, artifact]));
const sourceRevisionDeltas = previous
  ? [...new Set([...previousByRef.keys(), ...currentByRef.keys()])].sort().map((sourceRef) => {
    const before = previousByRef.get(sourceRef);
    const after = currentByRef.get(sourceRef);
    const changeKind = !before ? 'ADDED' : !after ? 'DELETED'
      : before.source_revision === after.source_revision ? 'UNCHANGED' : 'MODIFIED';
    return sourceRevisionDeltaSchema.parse({
      source_ref: sourceRef,
      change_kind: changeKind,
      before_source_ref: before ? sourceRef : null,
      before_revision: before?.source_revision ?? null,
      after_revision: after?.source_revision ?? null,
      before_checksum: before?.content_digest ?? null,
      after_checksum: after?.content_digest ?? null,
      changed_ranges: [],
      semantic_dependents: [],
      canonical_authority: false,
    });
  })
  : [];
const sourceRevisionSetChecksum = temporalIndexChecksum(sourceIdentityRows);
const deltaRefs = sourceRevisionDeltas.map((delta) => `source-delta:sha256:${temporalIndexChecksum(delta)}`);
const temporalDocumentIndex = buildTemporalDocumentIndex({
  index_id: `architecture-index:${sourceSnapshotRevision}`,
  workspace_revision: workspaceRevision,
  source_snapshot_revision: sourceSnapshotRevision,
  artifact_refs: validatedArtifacts.map((artifact) => artifact.file_id).sort(),
  observation_refs: [],
  claim_refs: [],
  delta_refs: deltaRefs,
  source_revision_set_checksum: sourceRevisionSetChecksum,
  status: 'VALID',
  producer_revision: producerRevision,
});
const snapshotBody = {
  schema: 'atlas.architecture-temporal-snapshot.v1',
  captured_at: capturedAt,
  git_head: gitHead,
  source_scope: [
    'docs/architecture/**/*.{md,json} except generated docs/architecture/ARCH-TOC.md',
    '.claude/skills/parent-atlas-workstation/SKILL.md',
  ],
  workspace_revision_kind: 'SCOPE_BOUNDED_GIT_AND_CONTENT_DIGEST_NOT_CANONICAL_WORKSPACE_IDENTITY',
  previous_source_snapshot_revision: previous?.index.source_snapshot_revision ?? null,
  baseline_state: previous ? 'EXPLICIT_PREVIOUS_SNAPSHOT_COMPARISON' : 'INITIAL_BASELINE_NO_PRIOR_SNAPSHOT',
  source_artifacts: validatedArtifacts,
  source_revision_deltas: sourceRevisionDeltas,
  temporal_document_index: temporalDocumentIndex,
  canonical_authority: false,
  writes_performed: false,
};
const receipt = { ...snapshotBody, receipt_checksum: temporalIndexChecksum(snapshotBody) };
const outputPath = join(snapshotDir, `architecture-temporal-index-v1-${temporalDocumentIndex.index_checksum}.json`);

if (existsSync(outputPath)) {
  const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
  const existingIndex = temporalDocumentIndexSchema.parse(existing.temporal_document_index);
  if (existingIndex.index_checksum !== temporalDocumentIndex.index_checksum
    || existing.receipt_checksum !== temporalIndexChecksum(Object.fromEntries(Object.entries(existing).filter(([key]) => key !== 'receipt_checksum')))) {
    throw new Error('CONTENT_ADDRESSED_SNAPSHOT_COLLISION_OR_TAMPER');
  }
  console.log(JSON.stringify({ status: 'EXISTING_CONTENT_ADDRESSED_SNAPSHOT_REUSED', output: toRepoPath(outputPath), sourceCount: existing.source_artifacts.length, deltaCount: existing.source_revision_deltas.length, indexChecksum: existingIndex.index_checksum, writesPerformed: false }, null, 2));
  process.exit(0);
}

if (checkOnly) throw new Error('SNAPSHOT_NOT_CAPTURED; run without --check once to establish the immutable baseline');
mkdirSync(snapshotDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: previous ? 'TEMPORAL_SNAPSHOT_CAPTURED' : 'INITIAL_TEMPORAL_BASELINE_CAPTURED', output: toRepoPath(outputPath), sourceCount: validatedArtifacts.length, deltaCount: sourceRevisionDeltas.length, sourceSnapshotRevision, indexChecksum: temporalDocumentIndex.index_checksum, producerRevision, writesPerformed: false }, null, 2));
