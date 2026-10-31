import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSimilarityGroups,
  categorizeSqlPath,
  cosineSimilarity,
  sanitizeSqlForEmbedding
} from './organize-sql-files-embeddinggemma-v1.mjs';

test('SQL embedding input removes comments and literal values but retains structure', () => {
  const result = sanitizeSqlForEmbedding(
    "CREATE TABLE public.secret_table (id uuid); -- email@example.test\nINSERT INTO secret_table VALUES ('private value', 123);",
    'drizzle/migrations/0001_create_secret_table.sql'
  );

  assert.equal(result.binary, false);
  assert.equal(result.truncated, false);
  assert.match(result.text, /CREATE TABLE public\.secret_table/);
  assert.match(result.text, /<string-literal>/);
  assert.match(result.text, /<number>/);
  assert.doesNotMatch(result.text, /private value|email@example/);
});

test('SQL file paths receive navigation categories without claiming migration ownership', () => {
  assert.equal(categorizeSqlPath('drizzle/migrations/0001_schema.sql'), 'registered-or-versioned-migration-candidate');
  assert.equal(categorizeSqlPath('drizzle/manual/proposal.sql'), 'manual-or-proposed-ddl');
  assert.equal(categorizeSqlPath('tests/fixtures/schema.sql'), 'tests-fixtures-examples');
});

test('cosine similarity is dimension-safe and rejects zero vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), Number.NEGATIVE_INFINITY);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), Number.NEGATIVE_INFINITY);
});

test('semantic groups and nearest neighbors are deterministic', () => {
  const records = [
    { path: 'a.sql', vector: [1, 0] },
    { path: 'b.sql', vector: [0.99, 0.01] },
    { path: 'c.sql', vector: [0, 1] }
  ];
  const result = buildSimilarityGroups(records, 0.9, 1);
  assert.deepEqual(result.groups, [['a.sql', 'b.sql']]);
  assert.deepEqual(result.neighbors[0], [{ path: 'b.sql', similarity: 0.9999 }]);
  assert.deepEqual(result.neighbors[2], [{ path: 'b.sql', similarity: 0.0101 }]);
});
