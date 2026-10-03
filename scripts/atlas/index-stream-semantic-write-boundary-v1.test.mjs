import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routePath = path.join(
  repoRoot,
  'sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts',
);
const routeSource = readFileSync(routePath, 'utf8');
const fullRepoIndexerPath = path.join(repoRoot, 'scripts/atlas/index-full-repo-for-search.mjs');
const fullRepoIndexerSource = readFileSync(fullRepoIndexerPath, 'utf8');
const fabricAuditPath = path.join(repoRoot, 'scripts/atlas/audit-canonical-projection-fabric.mjs');
const fabricAuditSource = readFileSync(fabricAuditPath, 'utf8');
const mirrorMatch = routeSource.match(
  /async function mirrorToPostgres\([\s\S]*?\/\/ ── SSE POST handler/,
);

test('index-stream does not write Qdrant semantic vectors into PostgreSQL canonical semantic_768', () => {
  assert.ok(mirrorMatch, 'expected to find the existing PostgreSQL mirror owner');
  assert.match(mirrorMatch[0], /INSERT INTO codebase_chunk_index/);
  assert.doesNotMatch(mirrorMatch[0], /content_embedding_768/i);
  assert.doesNotMatch(mirrorMatch[0], /contentVec/);
});

test('Qdrant content vectors are not passed to the PostgreSQL mirror', () => {
  assert.match(routeSource, /mirrorToPostgres\(chunk, summary, summaryVec, sigVec\)/);
  assert.doesNotMatch(routeSource, /mirrorToPostgres\([^;]*contentVec/);
});

test('PostgreSQL mirror INSERT columns and values remain positionally aligned', () => {
  assert.ok(mirrorMatch, 'expected to find the existing PostgreSQL mirror owner');
  const insert = mirrorMatch[0].match(
    /INSERT INTO codebase_chunk_index\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/,
  );
  assert.ok(insert, 'expected a simple positional INSERT');
  const columns = insert[1].split(',').map((value) => value.trim());
  const values = insert[2].split(',').map((value) => value.trim());
  assert.equal(columns.length, values.length);
  assert.equal(Math.max(...values.flatMap((value) => [...value.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))), 18);
});

test('broad full-repo indexer keeps embeddings in Qdrant and does not write canonical PostgreSQL semantic_768', () => {
  const writerMatch = fullRepoIndexerSource.match(
    /async function upsertPostgresMetadata\([\s\S]*?\r?\n}\r?\n/,
  );
  assert.ok(writerMatch, 'expected the existing PostgreSQL metadata writer');
  assert.match(writerMatch[0], /INSERT INTO codebase_chunk_index/);
  assert.doesNotMatch(writerMatch[0], /content_embedding_768/i);
  assert.doesNotMatch(writerMatch[0], /vecStr/);
  const values = writerMatch[0].match(/VALUES\s*\(([^)]*)\)/i);
  assert.ok(values, 'expected positional metadata INSERT values');
  assert.equal(Math.max(...[...values[1].matchAll(/\$(\d+)/g)].map((m) => Number(m[1]))), 19);
  assert.match(fullRepoIndexerSource, /await upsertQdrant\(chunk\.qdrant_id, embedding, payload\)/);
  assert.match(fullRepoIndexerSource, /await upsertPostgresMetadata\(pool, chunk\)/);
  assert.doesNotMatch(fullRepoIndexerSource, /upsertPostgresMetadata\(pool, chunk, embedding\)/);
});

test('legacy ace_context_sources row presence cannot promote ACE grounding', () => {
  const acePredicate = fabricAuditSource.match(
    /\/\/ ── Predicate 11: ACE_EVIDENCE_GROUNDED ──[\s\S]*?await client\.query\('ROLLBACK'\)/,
  );
  assert.ok(acePredicate, 'expected the existing ACE admission predicate');
  assert.match(acePredicate[0], /legacy_row_count: rows\[0\]\.n/);
  assert.match(acePredicate[0], /verdict: 'NOT_PROVEN'/);
  assert.match(acePredicate[0], /CANONICAL_RETRIEVAL_TO_ACE_V3_CONTEXTMANIFEST_RECEIPT_REQUIRED/);
  assert.doesNotMatch(acePredicate[0], /rows\[0\]\.n\s*>\s*0\s*\?\s*'PARTIAL_PROVEN'/);
});
