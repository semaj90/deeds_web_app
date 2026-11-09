import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPgvectorFirstLaneEnabled, validateQueryVector, validateLaneArgs, buildPgvectorFirstQuery,
  classifyRevisions, runPgvectorFirstLane, PGVECTOR_FIRST_LANE_FLAG,
} from './pgvector-first-semantic-lane-v1.mjs';

const vec = Array.from({ length: 768 }, (_, i) => (i % 7) / 10);
const SHA = (c) => 'sha256:' + c.repeat(64);

test('lane is off unless the flag is exactly 1', () => {
  assert.equal(isPgvectorFirstLaneEnabled({}), false);
  assert.equal(isPgvectorFirstLaneEnabled({ [PGVECTOR_FIRST_LANE_FLAG]: '0' }), false);
  assert.equal(isPgvectorFirstLaneEnabled({ [PGVECTOR_FIRST_LANE_FLAG]: 'true' }), false);
  assert.equal(isPgvectorFirstLaneEnabled({ [PGVECTOR_FIRST_LANE_FLAG]: '1' }), true);
});

test('query vector must be 768 finite numbers', () => {
  assert.throws(() => validateQueryVector(vec.slice(1)), /DIMENSION_INVALID/);
  assert.throws(() => validateQueryVector([...vec.slice(1), NaN]), /NOT_FINITE/);
  assert.throws(() => validateQueryVector([...vec.slice(1), '0.1']), /NOT_FINITE/);
  assert.equal(validateQueryVector(vec), vec);
});

test('limit and ef_search are bounded and fail closed', () => {
  assert.throws(() => validateLaneArgs({ limit: 0 }), /LIMIT_INVALID/);
  assert.throws(() => validateLaneArgs({ limit: 201 }), /LIMIT_INVALID/);
  assert.throws(() => validateLaneArgs({ efSearch: 0 }), /EF_SEARCH_INVALID/);
  assert.throws(() => validateLaneArgs({ efSearch: 1001 }), /EF_SEARCH_INVALID/);
  assert.deepEqual(validateLaneArgs({}), { limit: 10, efSearch: 100 });
});

test('query is parameterized, uses the full-coverage 768 column, and sets ef_search per transaction', () => {
  const q = buildPgvectorFirstQuery({ queryVector: vec, limit: 5, efSearch: 200 });
  assert.match(q.text, /content_embedding_768 <=> \$1::vector/);
  assert.match(q.text, /LIMIT \$2/);
  assert.doesNotMatch(q.text, /halfvec|content_embedding\b/);
  assert.deepEqual(q.setEfSearch.values, ['hnsw.ef_search', '200']);
  assert.equal(q.values[1], 5);
  assert.ok(q.values[0].startsWith('[0,0.1,'));
});

test('revision classification never defaults a missing or zero revision to admitted', () => {
  assert.equal(classifyRevisions({ source_revision: SHA('a'), workspace_revision: SHA('b') }), 'ADMITTED');
  assert.equal(classifyRevisions({ source_revision: null, workspace_revision: SHA('b') }), 'UNADMITTED_REVISION');
  assert.equal(classifyRevisions({ source_revision: SHA('a'), workspace_revision: '0' }), 'UNADMITTED_REVISION');
  assert.equal(classifyRevisions({ source_revision: 'sha256:ABC', workspace_revision: SHA('b') }), 'UNADMITTED_REVISION');
});

function fakeClient(rows, { failOn } = {}) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text: text.split('\n')[0].trim(), values });
      if (failOn && text.includes(failOn)) throw new Error('boom');
      if (text.includes('FROM codebase_chunk_index')) return { rows };
      return { rows: [] };
    },
  };
}

test('disabled lane never touches the database', async () => {
  const c = fakeClient([]);
  const out = await runPgvectorFirstLane(c, { queryVector: vec }, {});
  assert.equal(out.status, 'DISABLED');
  assert.equal(c.calls.length, 0);
});

test('enabled lane runs read-only, returns candidates with revision status, and never claims authority', async () => {
  const rows = [
    { id: '1', source_ref: 'src/a.ts', source_revision: SHA('a'), workspace_revision: SHA('b'), score: '0.91' },
    { id: '2', source_ref: 'src/b.ts', source_revision: null, workspace_revision: SHA('b'), score: '0.80' },
  ];
  const c = fakeClient(rows);
  const out = await runPgvectorFirstLane(c, { queryVector: vec, limit: 2, efSearch: 100 }, { [PGVECTOR_FIRST_LANE_FLAG]: '1' });
  assert.equal(out.status, 'OK');
  assert.equal(c.calls[0].text, 'BEGIN READ ONLY');
  assert.equal(c.calls.at(-1).text, 'COMMIT');
  assert.equal(out.candidates[0].revisionStatus, 'ADMITTED');
  assert.equal(out.candidates[1].revisionStatus, 'UNADMITTED_REVISION');
  assert.ok(out.candidates.every((x) => x.canonicalAuthority === false && x.lane === 'pgvector_first_768'));
  assert.equal(out.candidates[0].score, 0.91);
});

test('a failing query rolls back and rethrows', async () => {
  const c = fakeClient([], { failOn: 'FROM codebase_chunk_index' });
  await assert.rejects(runPgvectorFirstLane(c, { queryVector: vec }, { [PGVECTOR_FIRST_LANE_FLAG]: '1' }), /boom/);
  assert.equal(c.calls.at(-1).text, 'ROLLBACK');
});
