import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { recoverOkfDevPartialPageV1 } from './okf-dev-partial-page-recovery-v1.mjs';

const markdown = '# Docs';
const markdownPath = 'docs/.okf/dev/raw/zod/zod-dev-index.md';
const entry = {
  schema_version: 'okf.dev.corpus.v1',
  source_id: 'zod',
  source_ref: 'zod:zod-dev-index',
  url: 'https://zod.dev/',
  markdown_path: markdownPath,
  raw_path: markdownPath,
  content_hash: crypto.createHash('sha256').update(markdown, 'utf8').digest('hex'),
};
const recover = (overrides = {}) => recoverOkfDevPartialPageV1({
  sidecar: { ...entry, ...overrides },
  markdown,
  sourceId: 'zod',
  sourceRef: 'zod:zod-dev-index',
  url: 'https://zod.dev/',
  markdownPath,
});

test('recovers a fully written sidecar and exact markdown pair', () => {
  const recovered = recover();
  assert.equal(recovered.source_ref, entry.source_ref);
  assert.equal(recovered.content_hash, entry.content_hash);
  assert.equal('raw_path' in recovered, false);
});

test('rejects a sidecar with a mismatched source identity', () => {
  assert.throws(() => recover({ source_ref: 'other:page' }), /PARTIAL_PAGE_IDENTITY_MISMATCH/);
});

test('rejects paths outside the expected page location', () => {
  assert.throws(() => recover({ raw_path: 'other/page.md' }), /PARTIAL_PAGE_PATH_MISMATCH/);
});

test('rejects markdown that does not match the sidecar digest', () => {
  assert.throws(() => recoverOkfDevPartialPageV1({
    sidecar: entry,
    markdown: '# changed',
    sourceId: 'zod',
    sourceRef: entry.source_ref,
    url: entry.url,
    markdownPath,
  }), /PARTIAL_PAGE_CONTENT_CHECKSUM_MISMATCH/);
});

test('rejects incomplete or unknown sidecar envelopes', () => {
  assert.throws(() => recover({ schema_version: 'unknown' }), /PARTIAL_PAGE_SIDECAR_SCHEMA_INVALID/);
});
