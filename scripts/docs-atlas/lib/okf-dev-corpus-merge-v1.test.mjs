import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOkfDevCorpusRowsV1, summarizeOkfDevCorpusRowsV1 } from './okf-dev-corpus-merge-v1.mjs';

const row = (overrides = {}) => ({
  source_ref: 'zod:zod-dev', url: 'https://zod.dev/', content_hash: 'sha256:zod',
  source_id: 'zod', domain_class: 'tool', ...overrides,
});

test('appends new pages while preserving existing corpus order', () => {
  const existing = [row({ source_ref: 'firecrawl:intro', url: 'https://docs.firecrawl.dev/' })];
  assert.deepEqual(mergeOkfDevCorpusRowsV1(existing, [row()]), [...existing, row()]);
});

test('treats an identical source reference and content digest as idempotent', () => {
  assert.deepEqual(mergeOkfDevCorpusRowsV1([row()], [row()]), [row()]);
});

test('rejects source-reference changes instead of silently replacing existing content', () => {
  assert.throws(() => mergeOkfDevCorpusRowsV1([row()], [row({ content_hash: 'sha256:changed' })]), /CORPUS_SOURCE_REF_CONFLICT/);
});

test('rejects URL aliases and duplicate identities', () => {
  assert.throws(() => mergeOkfDevCorpusRowsV1([row()], [row({ source_ref: 'another:zod' })]), /CORPUS_URL_CONFLICT/);
  assert.throws(() => mergeOkfDevCorpusRowsV1([row(), row()], []), /EXISTING_CORPUS_IDENTITY_INVALID_OR_DUPLICATED/);
});

test('rebuilds summary counts from the merged corpus', () => {
  const summary = summarizeOkfDevCorpusRowsV1([row(), row({ source_ref: 'zod:errors', url: 'https://zod.dev/error-customization' }), row({ source_id: 'firecrawl', domain_class: 'tool' })]);
  assert.deepEqual(summary, { zod: { pages: 2, domains: { tool: 2 } }, firecrawl: { pages: 1, domains: { tool: 1 } } });
});
