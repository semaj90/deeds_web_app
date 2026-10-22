import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildIndexedSourceCohortV1, reconcileIndexedSourceCohortV1, selectIndexedSourceCohortPageV1 } from './indexed-source-cohort-v1.mjs';

const bytes = Buffer.from('const café = "😀";\r\n');
const revision = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const input = { directory: 'src/server', workspaceRevision, snapshotRevision: `sha256:${'b'.repeat(64)}`,
  readSource: () => bytes,
  sourceRows: ['b.ts', 'a.ts'].map(name => ({ canonical_source_ref: `src/server/${name}`, source_revision: revision,
    workspace_revision: workspaceRevision, binding_count: 1, graphify_file_match_count: 1 })) };
const item = sourceRef => ({ sourceRef, sourceRevision: revision, workspaceRevision, status: 'COMPLETED' });

test('freezes exact source bytes and a finite ordered denominator without admission', () => {
  const cohort = buildIndexedSourceCohortV1(input);
  assert.deepEqual(cohort.entries.map(entry => entry.sourceRef), ['src/server/a.ts', 'src/server/b.ts']);
  assert.equal(cohort.totalSelected, 2);
  assert.equal(cohort.excludedRows, 0);
  assert.equal(cohort.entries[0].bytes, bytes.length);
  const complete = reconcileIndexedSourceCohortV1(cohort, cohort.entries.map(entry => item(entry.sourceRef)), true);
  assert.equal(complete.status, 'FROZEN_CORPUS_DIAGNOSTICS_COMPLETE_NOT_ADMITTED');
  assert.equal(complete.remaining, 0);
  assert.equal(complete.datastoreWritesPerformed, false);
});

test('an exhausted cursor cannot hide missing, duplicate, foreign or stale sources', () => {
  const cohort = buildIndexedSourceCohortV1(input);
  const result = reconcileIndexedSourceCohortV1(cohort, [item('src/server/a.ts'), item('src/server/a.ts'), item('src/server/foreign.ts')], true);
  assert.equal(result.remaining, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.issues.length, 2);
  assert.equal(result.status, 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED');
  const stale = reconcileIndexedSourceCohortV1(cohort, [{ ...item('src/server/a.ts'), sourceRevision: workspaceRevision }], false);
  assert.equal(stale.issues[0].reason, 'COHORT_REVISION_MISMATCH');
});

test('source mismatches, ambiguous bindings and duplicate identities stay excluded', () => {
  const cohort = buildIndexedSourceCohortV1({ ...input, readSource: () => Buffer.from('changed'),
    sourceRows: [input.sourceRows[0], { ...input.sourceRows[0], binding_count: 2 }] });
  assert.equal(cohort.totalSelected, 0);
  assert.equal(cohort.duplicateRows, 1);
  assert.equal(cohort.excludedRows, 1);
  assert.ok(cohort.entries[0].exclusions.includes('SOURCE_BYTES_REVISION_MISMATCH'));
  assert.ok(cohort.entries[1].exclusions.includes('AMBIGUOUS_SOURCE_BINDING'));
});

test('records snapshot files without bindings and graphify-unmatched bound files as explicit exclusions', () => {
  const cohort = buildIndexedSourceCohortV1({ ...input,
    sourceRows: [
      { ...input.sourceRows[1], graphify_file_match_count: 0 },
      input.sourceRows[0],
    ],
    sourcePaths: ['src/server/a.ts', 'src/server/b.ts', 'src/server/unbound.ts'],
  });
  assert.equal(cohort.totalSnapshotFiles, 3);
  assert.equal(cohort.totalBound, 2);
  assert.equal(cohort.totalSelected, 1);
  assert.equal(cohort.excludedRows, 2);
  assert.ok(cohort.entries.find(entry => entry.sourceRef.endsWith('/a.ts')).exclusions.includes('NO_EXACT_GRAPHIFY_SOURCE_MATCH'));
  assert.ok(cohort.entries.find(entry => entry.sourceRef.endsWith('/unbound.ts')).exclusions.includes('NO_CANONICAL_SOURCE_BINDING'));
  const result = reconcileIndexedSourceCohortV1(cohort, [item('src/server/b.ts')], true);
  assert.equal(result.status, 'FROZEN_CORPUS_DIAGNOSTICS_COMPLETE_WITH_EXPLICIT_EXCLUSIONS_NOT_ADMITTED');
  assert.equal(result.skipped, 2);
});

test('tampering, unsafe paths and unqualified snapshot revisions fail closed', () => {
  const cohort = buildIndexedSourceCohortV1(input);
  assert.throws(() => reconcileIndexedSourceCohortV1({ ...cohort, totalSelected: 0 }, [], true), /checksum/);
  assert.throws(() => buildIndexedSourceCohortV1({ ...input, snapshotRevision: '0' }));
  assert.throws(() => buildIndexedSourceCohortV1({ ...input, sourceRows: [{ ...input.sourceRows[0], canonical_source_ref: '../x.ts' }] }));
});

test('frozen paging resumes without rediscovery and stops exactly at the manifest boundary', () => {
  const cohort = buildIndexedSourceCohortV1(input);
  const request = { directory: input.directory, workspaceRevision, limit: 1 };
  const first = selectIndexedSourceCohortPageV1(cohort, request);
  assert.equal(first.length, 2);
  const last = selectIndexedSourceCohortPageV1(cohort, { ...request, afterSourceRef: first[0].canonical_source_ref });
  assert.deepEqual(last.map(row => row.canonical_source_ref), ['src/server/b.ts']);
  assert.deepEqual(selectIndexedSourceCohortPageV1(cohort, { ...request, afterSourceRef: 'src/server/b.ts' }), []);
  assert.throws(() => selectIndexedSourceCohortPageV1(cohort, { ...request, afterSourceRef: 'src/server/missing.ts' }), /outside frozen cohort/);
  assert.throws(() => selectIndexedSourceCohortPageV1(cohort, { ...request, workspaceRevision: revision }));
});
