#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(ROOT, 'scripts/atlas/apply-vector-index-cleanup-v1.mjs'), 'utf8');

test('apply-vector-index-cleanup-v1 enforces explicit confirmation flags', () => {
  assert.match(source, /isApply = args\.includes\('--apply'\)/);
  assert.match(source, /isConfirmed = args\.includes\('--confirm-apply'\)/);
  assert.match(source, /APPLY_REFUSED: --apply requires explicit --confirm-apply flag\./);
});

test('apply-vector-index-cleanup-v1 uses CONCURRENT operations exclusively', () => {
  assert.match(source, /DROP INDEX CONCURRENTLY/);
  assert.match(source, /CREATE INDEX CONCURRENTLY/);
  assert.doesNotMatch(source, /BEGIN;/);
  assert.doesNotMatch(source, /COMMIT;/);
});

test('apply-vector-index-cleanup-v1 verifies indisvalid before dropping old index', () => {
  assert.match(source, /checkIndexValid\(client, 'idx_codebase_chunk_summary_embedding_768_hnsw'\)/);
  assert.match(source, /CANDIDATE_SUMMARY_INDEX_INVALID/);
  assert.match(source, /checkIndexValid\(client, 'idx_codebase_chunk_error_embedding_768_hnsw'\)/);
  assert.match(source, /CANDIDATE_ERROR_INDEX_INVALID/);
});

test('apply-vector-index-cleanup-v1 creates partial index with WHERE IS NOT NULL', () => {
  assert.match(source, /WHERE \(summary_embedding IS NOT NULL\)/);
  assert.match(source, /WHERE \(error_embedding IS NOT NULL\)/);
});
