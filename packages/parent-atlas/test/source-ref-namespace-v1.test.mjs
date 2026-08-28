import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApprovedAliasMap, classifySourceRef, normalizeSourceRef } from '../../../scripts/atlas/lib/source-ref-namespace-v1.mjs';

test('normalizes separators without stripping meaningful namespaces', () => {
  assert.equal(normalizeSourceRef('./sveltekit-frontend\\src\\lib\\x.ts'), 'sveltekit-frontend/src/lib/x.ts');
});

test('classifies exact current identity before aliases', () => {
  const aliases = buildApprovedAliasMap([{ aliasSourceRef: 'src/lib/x.ts', canonicalSourceRef: 'sveltekit-frontend/src/lib/x.ts' }]);
  assert.equal(classifySourceRef({ manifestRef: 'sveltekit-frontend/src/lib/x.ts', projectionRefs: ['sveltekit-frontend/src/lib/x.ts', 'src/lib/x.ts'], approvedAliases: aliases }).classification, 'EXACT_CURRENT');
});

test('accepts one explicitly approved alias only', () => {
  const aliases = buildApprovedAliasMap([{ aliasSourceRef: 'src/lib/x.ts', canonicalSourceRef: 'sveltekit-frontend/src/lib/x.ts' }]);
  const result = classifySourceRef({ manifestRef: 'sveltekit-frontend/src/lib/x.ts', projectionRefs: ['src/lib/x.ts'], approvedAliases: aliases });
  assert.equal(result.classification, 'APPROVED_ALIAS_CURRENT');
  assert.deepEqual(result.aliasSourceRefs, ['src/lib/x.ts']);
});

test('does not fuzzy-resolve an unknown basename', () => {
  const result = classifySourceRef({ manifestRef: 'sveltekit-frontend/src/lib/x.ts', projectionRefs: ['x.ts'] });
  assert.equal(result.classification, 'UNRESOLVED');
});

test('rejects conflicting approved aliases', () => {
  assert.throws(() => buildApprovedAliasMap([
    { aliasSourceRef: 'src/lib/x.ts', canonicalSourceRef: 'a/x.ts' },
    { aliasSourceRef: 'src/lib/x.ts', canonicalSourceRef: 'b/x.ts' },
  ]), /conflicting approved aliases/);
});
