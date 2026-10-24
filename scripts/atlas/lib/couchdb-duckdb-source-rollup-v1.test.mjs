import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCouchDbOfflineBatchV1,
  createCouchDbOfflineBatchV1,
  createCouchDbReplayStateV1,
  summarizeCouchDbReplayV1,
} from './couchdb-offline-batch-v1.mjs';
import { reduceCouchDbReplaySummaryWithDuckDbV1, verifyCouchDbDuckDbSourceRollupV1 } from './couchdb-duckdb-source-rollup-v1.mjs';

const page = (lastSequence, changes, previousCheckpoint = null) => createCouchDbOfflineBatchV1({
  sourceDatabase: 'fixture_parent_atlas', lastSequence, changes, previousCheckpoint,
});
const source = (id, rev, sourceRef, extra = {}) => ({
  id,
  changes: [{ rev }],
  doc: { _id: id, _rev: rev, payload: { source_ref: sourceRef, ...extra } },
});

test('DuckDB rollup agrees with the deterministic directory MapReduce oracle', async () => {
  const fixture = page(1, [
    source('a', '1-a', 'src/routes/+page.server.ts'),
    source('b', '1-b', 'src/lib/db.ts'),
    source('c', '1-c', 'src/routes/+server.ts'),
    source('root', '1-root', 'README.md'),
  ]);
  const replay = applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), fixture);
  const summary = summarizeCouchDbReplayV1(replay.state);
  const result = await reduceCouchDbReplaySummaryWithDuckDbV1(summary);

  assert.deepEqual(result.groups, [
    { directory: '.', documentCount: 1 },
    { directory: 'src/lib', documentCount: 1 },
    { directory: 'src/routes', documentCount: 2 },
  ]);
  assert.equal(result.aggregatedDocumentCount, 4);
  assert.equal(result.aggregateDigest, (await reduceCouchDbReplaySummaryWithDuckDbV1(summary)).aggregateDigest);
  assert.deepEqual(verifyCouchDbDuckDbSourceRollupV1(result), { valid: true, reason: null });
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('DuckDB rollup uses latest revisions and excludes tombstones and conflicted documents', async () => {
  const first = page('seq-1', [
    source('updated', '1-old', 'src/old/file.ts'),
    source('deleted', '1-live', 'src/removed/file.ts'),
  ]);
  const state1 = applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), first).state;
  const second = page('seq-2', [
    source('updated', '2-new', 'src/current/file.ts'),
    { id: 'deleted', deleted: true, changes: [{ rev: '2-deleted' }] },
    { id: 'conflicted', changes: [{ rev: '2-winner' }, { rev: '2-loser' }], doc: { _id: 'conflicted', _rev: '2-winner', _conflicts: ['2-loser'], payload: { source_ref: 'src/conflict/file.ts' } } },
  ], { token: 'seq-1', digest: first.nextCheckpoint.digest });
  const state2 = applyCouchDbOfflineBatchV1(state1, second).state;
  const result = await reduceCouchDbReplaySummaryWithDuckDbV1(summarizeCouchDbReplayV1(state2));

  assert.deepEqual(result.groups, [{ directory: 'src/current', documentCount: 1 }]);
  assert.equal(result.inputDocumentCount, 3);
  assert.equal(result.liveDocumentCount, 2);
  assert.equal(result.tombstoneCount, 1);
  assert.equal(result.conflictedDocumentCount, 1);
  assert.equal(result.excludedCount, 2);
});

test('DuckDB rollup rejects invalid summaries, authority flags, and unsafe source paths', async () => {
  const replay = applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), page(1, [source('a', '1-a', 'src/file.ts')]));
  const summary = summarizeCouchDbReplayV1(replay.state);
  const tampered = { ...summary, documents: [] };
  await assert.rejects(reduceCouchDbReplaySummaryWithDuckDbV1(tampered), /REPLAY_SUMMARY_DIGEST_OR_AUTHORITY_INVALID/);

  const invalidPath = summarizeCouchDbReplayV1(applyCouchDbOfflineBatchV1(
    createCouchDbReplayStateV1(), page(2, [source('b', '1-b', '../outside.ts')]),
  ).state);
  await assert.rejects(reduceCouchDbReplaySummaryWithDuckDbV1(invalidPath), /SOURCE_REF_INVALID/);

  await assert.rejects(reduceCouchDbReplaySummaryWithDuckDbV1({ ...summary, canonicalAuthority: true }), /REPLAY_SUMMARY_DIGEST_OR_AUTHORITY_INVALID/);
});

test('rollup readback rejects digest, ordering, and count tampering', async () => {
  const replay = applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), page(1, [
    source('a', '1-a', 'src/a.ts'), source('b', '1-b', 'lib/b.ts'),
  ]));
  const rollup = await reduceCouchDbReplaySummaryWithDuckDbV1(summarizeCouchDbReplayV1(replay.state));
  assert.equal(verifyCouchDbDuckDbSourceRollupV1({ ...rollup, aggregateDigest: '0'.repeat(64) }).reason, 'ROLLUP_DIGEST_MISMATCH');
  assert.equal(verifyCouchDbDuckDbSourceRollupV1({ ...rollup, groups: [...rollup.groups].reverse() }).reason, 'ROLLUP_DIGEST_MISMATCH');
  const { aggregateDigest, ...body } = rollup;
  const countTampered = { ...body, aggregatedDocumentCount: 99, aggregateDigest: rollup.aggregateDigest };
  assert.equal(verifyCouchDbDuckDbSourceRollupV1(countTampered).reason, 'ROLLUP_DIGEST_MISMATCH');
});
