import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDocumentPrompt } from './codebase-chunk-embed-worker.mjs';

test('codebase-chunk-embed-worker prompt formatting', () => {
  const prompt = formatDocumentPrompt('export const a = 1;', 'src/lib/foo.ts');
  assert.equal(prompt, 'title: src/lib/foo.ts | text: export const a = 1;');
});

test('codebase-chunk-embed-worker fallback title to none', () => {
  const prompt = formatDocumentPrompt('function hello() {}', '');
  assert.equal(prompt, 'title: none | text: function hello() {}');
});

test('codebase-chunk-embed-worker rejects empty content', () => {
  assert.throws(() => formatDocumentPrompt('   ', 'src/empty.ts'), {
    message: 'EMPTY_CHUNK_CONTENT',
  });
});
