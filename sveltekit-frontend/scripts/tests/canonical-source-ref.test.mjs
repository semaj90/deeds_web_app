#!/usr/bin/env node
/**
 * canonical-source-ref.test.mjs
 *
 * Tests for scripts/lib/canonical-source-ref.mjs
 * Run: node --test sveltekit-frontend/scripts/tests/canonical-source-ref.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libPath = path.resolve(__dirname, '../../../scripts/lib/canonical-source-ref.mjs');
const libUrl = new URL('file:///' + libPath.replace(/\\/g, '/').replace(/^\/+/, ''));

const { normalizeSourceRef, sourceRefVariants, sourceRefHash, isGeneratedPath } =
  await import(libUrl);

// ── normalizeSourceRef ───────────────────────────────────────────────────────

test('normalizeSourceRef: bare src path unchanged', () => {
  assert.equal(normalizeSourceRef('src/lib/server/db/client.ts'), 'src/lib/server/db/client.ts');
});

test('normalizeSourceRef: strips file: prefix', () => {
  assert.equal(
    normalizeSourceRef('file:src/lib/server/db/client.ts'),
    'src/lib/server/db/client.ts',
  );
});

test('normalizeSourceRef: strips sveltekit-frontend/ prefix', () => {
  assert.equal(
    normalizeSourceRef('sveltekit-frontend/src/lib/server/db/client.ts'),
    'src/lib/server/db/client.ts',
  );
});

test('normalizeSourceRef: strips file:sveltekit-frontend/ prefix', () => {
  assert.equal(
    normalizeSourceRef('file:sveltekit-frontend/src/lib/server/db/client.ts'),
    'src/lib/server/db/client.ts',
  );
});

test('normalizeSourceRef: strips leading slash', () => {
  assert.equal(normalizeSourceRef('/src/lib/server/db/client.ts'), 'src/lib/server/db/client.ts');
});

test('normalizeSourceRef: normalises backslashes', () => {
  assert.equal(
    normalizeSourceRef('sveltekit-frontend\\src\\lib\\server\\db\\client.ts'),
    'src/lib/server/db/client.ts',
  );
});

test('normalizeSourceRef: strips Windows drive letter', () => {
  assert.equal(
    normalizeSourceRef('C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/db/client.ts'),
    'src/lib/server/db/client.ts',
  );
});

test('normalizeSourceRef: scripts/ path preserved', () => {
  assert.equal(
    normalizeSourceRef('scripts/atlas/extract-db-usage.mjs'),
    'scripts/atlas/extract-db-usage.mjs',
  );
});

test('normalizeSourceRef: empty/null returns empty string', () => {
  assert.equal(normalizeSourceRef(''), '');
  assert.equal(normalizeSourceRef(null), '');
  assert.equal(normalizeSourceRef(undefined), '');
});

// ── sourceRefVariants ────────────────────────────────────────────────────────

test('sourceRefVariants: canonical is first element', () => {
  const variants = sourceRefVariants('file:src/lib/server/db/client.ts');
  assert.equal(variants[0], 'src/lib/server/db/client.ts');
});

test('sourceRefVariants: includes sveltekit-frontend prefix', () => {
  const variants = sourceRefVariants('src/lib/server/db/client.ts');
  assert.ok(variants.includes('sveltekit-frontend/src/lib/server/db/client.ts'));
});

test('sourceRefVariants: includes file: prefix', () => {
  const variants = sourceRefVariants('src/lib/server/db/client.ts');
  assert.ok(variants.includes('file:src/lib/server/db/client.ts'));
});

test('sourceRefVariants: returns empty array for empty input', () => {
  assert.deepEqual(sourceRefVariants(''), []);
});

test('sourceRefVariants: no duplicates', () => {
  const variants = sourceRefVariants('sveltekit-frontend/src/lib/server/db/client.ts');
  const unique = new Set(variants);
  assert.equal(unique.size, variants.length);
});

// ── sourceRefHash ────────────────────────────────────────────────────────────

test('sourceRefHash: returns 12-char hex string', () => {
  const h = sourceRefHash('src/lib/server/db/client.ts');
  assert.match(h, /^[0-9a-f]{12}$/);
});

test('sourceRefHash: stable across equivalent inputs', () => {
  const h1 = sourceRefHash('src/lib/server/db/client.ts');
  const h2 = sourceRefHash('file:src/lib/server/db/client.ts');
  const h3 = sourceRefHash('sveltekit-frontend/src/lib/server/db/client.ts');
  assert.equal(h1, h2);
  assert.equal(h1, h3);
});

test('sourceRefHash: different files produce different hashes', () => {
  const h1 = sourceRefHash('src/lib/server/db/client.ts');
  const h2 = sourceRefHash('src/lib/server/redis.ts');
  assert.notEqual(h1, h2);
});

test('sourceRefHash: empty input returns empty string', () => {
  assert.equal(sourceRefHash(''), '');
});

// ── isGeneratedPath ──────────────────────────────────────────────────────────

test('isGeneratedPath: .svelte-kit/ is generated', () => {
  assert.equal(isGeneratedPath('.svelte-kit/types/src/routes/$types.d.ts'), true);
});

test('isGeneratedPath: build/ is generated', () => {
  assert.equal(isGeneratedPath('build/index.js'), true);
});

test('isGeneratedPath: node_modules/ is generated', () => {
  assert.equal(isGeneratedPath('node_modules/vite/dist/index.js'), true);
});

test('isGeneratedPath: .d.ts is generated', () => {
  assert.equal(isGeneratedPath('src/lib/server/db/schema.d.ts'), true);
});

test('isGeneratedPath: real source file is not generated', () => {
  assert.equal(isGeneratedPath('src/lib/server/db/client.ts'), false);
});

test('isGeneratedPath: scripts file is not generated', () => {
  assert.equal(isGeneratedPath('scripts/atlas/extract-db-usage.mjs'), false);
});
