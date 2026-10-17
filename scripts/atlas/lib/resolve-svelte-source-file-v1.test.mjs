import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSvelteSourceFileV1 } from './resolve-svelte-source-file-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('resolves SvelteKit @, rest-parameter, group, and +page route paths', () => {
  const result = resolveSvelteSourceFileV1(
    repoRoot,
    'sveltekit-frontend/src/routes/(app)/citations/[...label]/+page.svelte',
  );
  assert.equal(result.relativePath, 'sveltekit-frontend/src/routes/(app)/citations/[...label]/+page.svelte');
  assert.equal(resolveSvelteSourceFileV1(repoRoot, 'sveltekit-frontend/src/routes/(analysis)@/+layout.svelte').relativePath, 'sveltekit-frontend/src/routes/(analysis)@/+layout.svelte');
});

test('rejects absolute paths and exact parent traversal segments', () => {
  assert.throws(() => resolveSvelteSourceFileV1(repoRoot, path.join(repoRoot, 'src/routes/+page.svelte')));
  assert.throws(() => resolveSvelteSourceFileV1(repoRoot, '../outside.svelte'));
  assert.throws(() => resolveSvelteSourceFileV1(repoRoot, 'src/../../outside.svelte'));
});
