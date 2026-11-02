import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isNonRetryableEmbeddingInputErrorV1, isValidEmbeddingVectorV1, requireNonEmptyEmbeddingBatchV1, requireNonEmptyEmbeddingTextV1 } from './embedding-input-guard-v1.mjs';

test('requires nonblank text and preserves valid source bytes as text', () => {
  assert.equal(requireNonEmptyEmbeddingTextV1('  source text  '), '  source text  ');
  assert.throws(() => requireNonEmptyEmbeddingTextV1('   ', 'packet summary'), /EMPTY_EMBEDDING_INPUT:packet summary/);
  assert.throws(() => requireNonEmptyEmbeddingTextV1(null), /EMPTY_EMBEDDING_INPUT/);
});

test('validates every batch member before returning any batch', () => {
  assert.deepEqual(requireNonEmptyEmbeddingBatchV1(['a', 'b']), ['a', 'b']);
  assert.throws(() => requireNonEmptyEmbeddingBatchV1(['a', '  ', 'c']), /EMPTY_EMBEDDING_INPUT:embedding inputs\[1\]/);
  assert.throws(() => requireNonEmptyEmbeddingBatchV1([]), /EMPTY_EMBEDDING_BATCH/);
});

test('accepts only finite vectors with the expected dimension', () => {
  assert.equal(isValidEmbeddingVectorV1(Array(768).fill(0.01)), true);
  assert.equal(isValidEmbeddingVectorV1([]), false);
  assert.equal(isValidEmbeddingVectorV1([Number.NaN]), false);
  assert.equal(isValidEmbeddingVectorV1(Array(767).fill(0.01)), false);
});

test('classifies blank-input validation errors as non-retryable only', () => {
  assert.equal(isNonRetryableEmbeddingInputErrorV1(new Error('EMPTY_EMBEDDING_INPUT:summary')), true);
  assert.equal(isNonRetryableEmbeddingInputErrorV1(new Error('socket timeout')), false);
  assert.equal(isNonRetryableEmbeddingInputErrorV1('EMPTY_EMBEDDING_INPUT:summary'), false);
});

test('retired placeholder writer cannot be re-enabled and has no empty-string fallback', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = readFileSync(path.join(root, 'phase106-stage4-embedding-backfill.mjs'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.match(source, /process\.exit\(78\)/);
  assert.doesNotMatch(source, /PHASE106_HISTORICAL_BACKFILL_ALLOW\s*!==/);
  assert.doesNotMatch(source, /summary\s*\|\|\s*content_text\s*\|\|\s*['"]['"]/);
  assert.match(source, /requireNonEmptyEmbeddingTextV1/);
});

test('canonical queue worker validates summary before cache lookup or claim', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = readFileSync(path.join(root, 'phase1-canonical-embedding-rabbitmq.mjs'), 'utf8');
  const validateAt = source.indexOf('requireNonEmptyEmbeddingTextV1(rawSummary');
  const claimAt = source.indexOf('claimPacket(packet_id');
  const cacheAt = source.indexOf('const cached = await getEmbeddingFromCache(summaryHash');
  assert.ok(validateAt >= 0 && validateAt < claimAt && validateAt < cacheAt);
});
