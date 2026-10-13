import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildIncrementalWorkspaceSourceInventoryV1 } from './incremental-workspace-source-inventory-v1.mjs';

const source = (name, content = 'initial') => {
  const bytes = Buffer.from(content, 'utf8');
  const contentDigest = createHash('sha256').update(bytes).digest('hex');
  return {
    sourceRef: name,
    repositoryId: 'repo:root',
    repositoryRelativePath: name,
    sourceIdentityKey: `repo:root:${name}`,
    sourceRevision: `sha256:${contentDigest}`,
    contentDigest,
    byteLength: bytes.length,
    repositoryPath: '',
  };
};
const observation = (row, content) => ({ sourceRef: row.repositoryRelativePath, status: 'SOURCE', source: row, bytes: Buffer.from(content, 'utf8') });
const hash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

const snapshot = (sourceRows, dirty = false) => {
  const sources = [...sourceRows].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef, 'en'));
  const sourceMembershipChecksum = hash(sources.map((row) => row.sourceIdentityKey).sort());
  const sourceContentChecksum = hash(sources.map((row) => [row.sourceIdentityKey, row.sourceRevision, row.byteLength]));
  const body = {
    workspaceId: 'workspace',
    repositoryRoot: 'C:/workspace',
    policy: { revision: 'policy-v1' },
    repositories: [{ relativePath: '', kind: 'ROOT', head: 'a'.repeat(40), dirty,
      gitChangedPaths: dirty ? ['one.ts'] : [] }],
    sources,
    violations: [],
    sourceMembershipChecksum,
    sourceContentChecksum,
    captureAttempts: 1,
    transientDriftObserved: false,
  };
  return {
    schema: 'atlas.workspace-source-snapshot-capture.v1',
    ...body,
    snapshotRevision: hash(body),
    workspaceRevision: null,
    status: 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK',
    canonicalAuthority: false,
    datastoreWritesPerformed: false,
  };
};

const readback = (previous) => ({
  status: 'SNAPSHOT_BYTES_READBACK_PROVEN',
  snapshotRevision: previous.snapshotRevision,
  sourceCount: previous.sources.length,
  exactMatches: previous.sources.length,
  violations: [],
  canonicalAuthority: false,
  datastoreWritesPerformed: false,
});

const delta = (changedPaths) => ({
  status: 'GIT_DELTA_READY_NOT_ADMITTED',
  repositoryRelativePath: '',
  baselineCommit: 'a'.repeat(40),
  currentHead: 'b'.repeat(40),
  changedPaths,
});

test('reuses unchanged verified entries and rehashes only two changed files', () => {
  const previous = snapshot([source('four.ts'), source('one.ts'), source('three.ts'), source('two.ts')]);
  const one = source('one.ts', 'b');
  const two = source('two.ts', 'c');
  const result = buildIncrementalWorkspaceSourceInventoryV1({
    previousSnapshot: previous,
    previousReadback: readback(previous),
    repositoryDelta: delta([
      { sourceRef: 'one.ts', operation: 'MODIFY' },
      { sourceRef: 'two.ts', operation: 'MODIFY' },
    ]),
    changedObservations: [observation(one, 'b'), observation(two, 'c')],
  });
  assert.equal(result.status, 'INCREMENTAL_SOURCE_INVENTORY_PROPOSAL_NOT_ADMITTED');
  assert.deepEqual(result.sources, [previous.sources[0], one, previous.sources[2], two]);
  assert.equal(result.rehashedSourceCount, 2);
  assert.equal(result.reusedSourceCount, 2);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('applies deletions, additions, and rename tombstones without inferring identity', () => {
  const previous = snapshot([source('old.ts'), source('remove.ts'), source('stay.ts')]);
  const added = source('new.ts', 'b');
  const result = buildIncrementalWorkspaceSourceInventoryV1({
    previousSnapshot: previous,
    previousReadback: readback(previous),
    repositoryDelta: delta([
      { sourceRef: 'old.ts', operation: 'DELETE' },
      { sourceRef: 'remove.ts', operation: 'DELETE' },
      { sourceRef: 'new.ts', operation: 'RENAME', previousPath: 'old.ts' },
    ]),
    changedObservations: [observation(added, 'b')],
  });
  assert.deepEqual(result.sources, [added, previous.sources[2]]);
  assert.equal(result.rehashedSourceCount, 1);
  assert.equal(result.reusedSourceCount, 1);
});

test('records changed paths excluded by the source owner without inventing rows', () => {
  const previous = snapshot([source('notes.md'), source('code.ts')]);
  const result = buildIncrementalWorkspaceSourceInventoryV1({
    previousSnapshot: previous,
    previousReadback: readback(previous),
    repositoryDelta: delta([{ sourceRef: 'notes.md', operation: 'MODIFY' }]),
    changedObservations: [{ sourceRef: 'notes.md', status: 'EXCLUDED', reason: 'NOT_INDEXABLE_SOURCE' }],
  });
  assert.deepEqual(result.sources, [previous.sources[0]]);
});

test('requires exact previous readback, matching Git baseline, and one observation per changed path', () => {
  const previous = snapshot([source('one.ts')]);
  const args = {
    previousSnapshot: previous,
    previousReadback: readback(previous),
    repositoryDelta: delta([{ sourceRef: 'one.ts', operation: 'MODIFY' }]),
    changedObservations: [],
  };
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args, previousReadback: { ...args.previousReadback, exactMatches: 0 },
  }).reason, 'PREVIOUS_SNAPSHOT_READBACK_INVALID');
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args, previousSnapshot: { ...previous, sourceMembershipChecksum: 'sha256:forged' },
  }).reason, 'PREVIOUS_SNAPSHOT_CHECKSUM_MISMATCH');
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args, repositoryDelta: { ...args.repositoryDelta, baselineCommit: 'c'.repeat(40) },
  }).reason, 'GIT_BASELINE_DOES_NOT_MATCH_PREVIOUS_SNAPSHOT');
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1(args).reason, 'CHANGED_SOURCE_OBSERVATION_MISSING:one.ts');
});

test('requires a bound dirty-path basis before reusing a dirty prior repository state', () => {
  const previous = snapshot([source('one.ts')], true);
  const invalidPrevious = { ...previous, repositories: [{ ...previous.repositories[0], gitChangedPaths: undefined }] };
  const invalidBody = { ...invalidPrevious };
  delete invalidBody.snapshotRevision;
  delete invalidBody.workspaceRevision;
  delete invalidBody.schema;
  delete invalidBody.status;
  delete invalidBody.canonicalAuthority;
  delete invalidBody.datastoreWritesPerformed;
  const boundPrevious = { ...invalidPrevious, snapshotRevision: hash(invalidBody) };
  const result = buildIncrementalWorkspaceSourceInventoryV1({
    previousSnapshot: boundPrevious,
    previousReadback: readback(boundPrevious),
    repositoryDelta: delta([]),
    changedObservations: [],
  });
  assert.equal(result.status, 'FULL_RECAPTURE_REQUIRED');
  assert.equal(result.reason, 'PREVIOUS_REPOSITORY_DIRTY_PATH_BASIS_INVALID');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('blocks selection policy changes, invalid identities, and unbound observations', () => {
  const previous = snapshot([source('one.ts')]);
  const args = {
    previousSnapshot: previous,
    previousReadback: readback(previous),
    repositoryDelta: delta([{ sourceRef: 'one.ts', operation: 'MODIFY' }]),
    changedObservations: [{ ...observation(source('wrong.ts', 'b'), 'b'), sourceRef: 'one.ts' }],
  };
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args, repositoryDelta: { ...args.repositoryDelta, status: 'FULL_RECAPTURE_REQUIRED', reason: 'SOURCE_SELECTION_POLICY_INPUT_CHANGED' },
  }).reason, 'SOURCE_SELECTION_POLICY_INPUT_CHANGED');
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1(args).reason, 'CHANGED_SOURCE_IDENTITY_MISMATCH:one.ts');
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args, changedObservations: [...args.changedObservations, { sourceRef: 'other.ts', status: 'EXCLUDED', reason: 'x' }],
  }).reason, 'OBSERVATION_NOT_BOUND_TO_GIT_DELTA');
});

test('recomputes changed-file byte digests and rejects malformed UTF-8', () => {
  const previous = snapshot([source('one.ts')]);
  const changed = source('one.ts', 'expected');
  const args = {
    previousSnapshot: previous,
    previousReadback: readback(previous),
    repositoryDelta: delta([{ sourceRef: 'one.ts', operation: 'MODIFY' }]),
  };
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args, changedObservations: [observation(changed, 'different')],
  }).reason, 'CHANGED_SOURCE_BYTES_DIGEST_MISMATCH:one.ts');
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args, changedObservations: [{ sourceRef: 'one.ts', status: 'SOURCE', source: changed }],
  }).reason, 'CHANGED_SOURCE_BYTES_MISSING:one.ts');

  const invalidBytes = Buffer.from([0xff]);
  const invalidDigest = createHash('sha256').update(invalidBytes).digest('hex');
  const invalidSource = {
    ...source('one.ts'),
    contentDigest: invalidDigest,
    sourceRevision: `sha256:${invalidDigest}`,
    byteLength: invalidBytes.length,
  };
  assert.equal(buildIncrementalWorkspaceSourceInventoryV1({
    ...args,
    changedObservations: [{ sourceRef: 'one.ts', status: 'SOURCE', source: invalidSource, bytes: invalidBytes }],
  }).reason, 'CHANGED_SOURCE_NOT_VALID_UTF8:one.ts');
});
