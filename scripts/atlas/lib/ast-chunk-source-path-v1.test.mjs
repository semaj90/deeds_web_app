import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAstChunkSourcePathV1 } from './ast-chunk-source-path-v1.mjs';

test('accepts SvelteKit route filenames containing plus signs', () => {
  assert.equal(isValidAstChunkSourcePathV1('src/routes/api/ace/ask/+server.ts'), true);
  assert.equal(isValidAstChunkSourcePathV1('src/routes/+page.svelte'), true);
});

test('rejects traversal, absolute paths, and unsupported extensions', () => {
  assert.equal(isValidAstChunkSourcePathV1('src/routes/../secret.ts'), false);
  assert.equal(isValidAstChunkSourcePathV1('/src/routes/+server.ts'), false);
  assert.equal(isValidAstChunkSourcePathV1('src/routes/+server.mdx'), false);
});
