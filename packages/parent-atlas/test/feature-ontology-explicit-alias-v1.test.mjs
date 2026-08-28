import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasSelectionChecksum,
  classifyExplicitAliasCandidate,
  proposeFrontendRootPrefixAlias,
} from '../../../scripts/atlas/lib/feature-ontology-explicit-alias-v1.mjs';

test('proposes only explicit frontend root-prefix alias', () => {
  const result = proposeFrontendRootPrefixAlias('src/lib/server/ai/trace-reranker.ts');
  assert.equal(result.resolutionKind, 'ROOT_PREFIX_ALIAS');
  assert.equal(result.canonicalSourceRef, 'sveltekit-frontend/src/lib/server/ai/trace-reranker.ts');
  assert.equal(result.promotable, false);
});

test('does not prefix non-src refs', () => {
  const result = proposeFrontendRootPrefixAlias('scripts/atlas/foo.mjs');
  assert.equal(result.resolutionKind, 'NOT_FRONTEND_RELATIVE');
  assert.equal(result.canonicalSourceRef, null);
});

test('rejects dual namespace collision', () => {
  const canonical = 'sveltekit-frontend/src/lib/server/valkey.ts';
  const result = classifyExplicitAliasCandidate({
    aliasSourceRef: 'src/lib/server/valkey.ts',
    canonicalSourceRef: canonical,
    observationBindings: new Map([[canonical, {}]]),
    rawRepoRefObserved: true,
    graphifyCanonicalCount: 0,
    graphifyAliasCount: 0,
  });
  assert.equal(result.classification, 'DUAL_NAMESPACE_COLLISION');
  assert.equal(result.promotable, false);
});

test('requires canonical candidate in current observation', () => {
  const canonical = 'sveltekit-frontend/src/lib/server/ai/trace-reranker.ts';
  const result = classifyExplicitAliasCandidate({
    aliasSourceRef: 'src/lib/server/ai/trace-reranker.ts',
    canonicalSourceRef: canonical,
    observationBindings: new Map(),
  });
  assert.equal(result.classification, 'CANONICAL_TARGET_NOT_OBSERVED');
});

test('review-ready alias is still not promotable', () => {
  const canonical = 'sveltekit-frontend/src/lib/server/ai/trace-reranker.ts';
  const result = classifyExplicitAliasCandidate({
    aliasSourceRef: 'src/lib/server/ai/trace-reranker.ts',
    canonicalSourceRef: canonical,
    observationBindings: new Map([[canonical, {}]]),
  });
  assert.equal(result.classification, 'EXPLICIT_ALIAS_REVIEW_READY');
  assert.equal(result.promotable, false);
});

test('selection checksum is order invariant', () => {
  const rows = [
    { aliasSourceRef: 'src/b.ts', canonicalSourceRef: 'sveltekit-frontend/src/b.ts', classification: 'EXPLICIT_ALIAS_REVIEW_READY' },
    { aliasSourceRef: 'src/a.ts', canonicalSourceRef: 'sveltekit-frontend/src/a.ts', classification: 'EXPLICIT_ALIAS_REVIEW_READY' },
  ];
  assert.equal(aliasSelectionChecksum(rows), aliasSelectionChecksum([...rows].reverse()));
});
