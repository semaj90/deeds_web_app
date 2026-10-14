#!/usr/bin/env node
/**
 * source-ref-directory-guard.test.mjs
 *
 * Safeguard: source-ref normalisation must never move a path from one repo
 * directory into another. Covers the two normalizers that previously rewrote
 * any path containing `src/` into `sveltekit-frontend/src/`.
 *
 * Run: node --test sveltekit-frontend/scripts/tests/source-ref-directory-guard.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const load = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

const canonical = await load('scripts/lib/canonical-source-ref.mjs');
const lineage = await load('scripts/atlas/lib/lineage-field-aliases.mjs');

const normalizers = {
  'scripts/lib/canonical-source-ref.mjs': canonical.normalizeSourceRef,
  'scripts/atlas/lib/lineage-field-aliases.mjs': lineage.normalizeSourceRef,
};

// Non-frontend paths: the top-level directory must be preserved exactly.
const nonFrontendInputs = [
  'python/src/pkg/mod.py',
  'packages/parent-atlas/src/core/x.ts',
  'crates/atlas_packet_parser/src/lib.rs',
  'services/foo/src/main.go',
  'simd-bridge/cpp/src/binding.cc',
  'deeds_labs/projects/legacy/src/a.ts',
  './python/src/pkg/mod.py',
  'python\\src\\pkg\\mod.py',
  'file:packages/x/src/y.ts',
];

for (const [name, normalize] of Object.entries(normalizers)) {
  for (const input of nonFrontendInputs) {
    test(`${name}: keeps top-level directory for ${JSON.stringify(input)}`, () => {
      const out = normalize(input);
      const clean = input.replace(/\\/g, '/').replace(/^file:/, '').replace(/^\.\//, '');
      const inputRoot = clean.split('/')[0];
      assert.equal(out.split('/')[0], inputRoot, `got ${out}`);
      assert.ok(!out.startsWith('sveltekit-frontend/'), `re-rooted into frontend: ${out}`);
    });
  }

  test(`${name}: frontend paths are still recognised`, () => {
    for (const input of [
      'src/lib/a.ts',
      'sveltekit-frontend/src/lib/a.ts',
      'C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/a.ts',
    ]) {
      assert.ok(normalize(input).endsWith('src/lib/a.ts'), input);
    }
  });

  test(`${name}: scripts/ paths are preserved`, () => {
    assert.equal(normalize('scripts/atlas/x.mjs'), 'scripts/atlas/x.mjs');
  });
}

test('precedesNonFrontendRoot helper', () => {
  assert.equal(canonical.precedesNonFrontendRoot('python/'), true);
  assert.equal(canonical.precedesNonFrontendRoot('packages/parent-atlas/'), true);
  assert.equal(canonical.precedesNonFrontendRoot(''), false);
  assert.equal(canonical.precedesNonFrontendRoot('Users/james/Videos/deeds-web-app/sveltekit-frontend/'), false);
});
