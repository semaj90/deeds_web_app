import assert from 'node:assert/strict';
import test from 'node:test';
import { bindLspResolutionToRevisionQualifiedSymbol, buildRevisionQualifiedSymbolCacheKey, buildRevisionQualifiedSymbolResolution } from '../dist/core/revision-qualified-symbol-resolution-v1.js';

const base = {
  schema: 'atlas.revision-qualified-symbol-resolution.v1',
  featureId: 'feature:parseFoo',
  packetKey: 'packet:parseFoo',
  sourceRef: 'src/parse.ts',
  sourceRevision: 'sha256:source-1',
  workspaceRevision: 'sha256:workspace-1',
  targetSourceRef: 'src/target.ts',
  targetSourceRevision: 'sha256:target-1',
  targetStableSymbolId: 'symbol:target',
  targetSymbolVersionId: 'symbol-version:target:1',
  targetUpstreamNodeId: 'node:target',
  graphRevision: null,
  stableSymbolId: 'symbol:parseFoo',
  symbolVersionId: 'symbol-version:parseFoo:1',
  upstreamNodeId: 'node:1',
  resolutionClass: 'EXACT_SYMBOL',
  evidenceRefs: ['span:1'],
  producerRevision: 'resolver:v1',
  canonicalAuthority: false,
};

test('builds deterministic revision-qualified resolution', () => {
  const first = buildRevisionQualifiedSymbolResolution(base);
  const second = buildRevisionQualifiedSymbolResolution(base);
  assert.deepEqual(first, second);
  assert.equal(first.canonicalAuthority, false);
  assert.equal(first.resolutionChecksum.length, 64);
});

test('cache key changes when a revision or packet coordinate changes', () => {
  const key = buildRevisionQualifiedSymbolCacheKey(base);
  assert.equal(key, buildRevisionQualifiedSymbolCacheKey(base));
  assert.notEqual(key, buildRevisionQualifiedSymbolCacheKey({ ...base, sourceRevision: 'sha256:source-2' }));
  assert.notEqual(key, buildRevisionQualifiedSymbolCacheKey({ ...base, packetKey: 'packet:other' }));
});

test('LSP binding rejects unresolved or incomplete target identity', () => {
  const input = {
    featureId: 'feature:call', packetKey: 'packet:call', sourceRef: 'src/call.ts',
    sourceRevision: 'sha256:source-1', workspaceRevision: 'sha256:workspace-1',
    targetSourceRef: 'src/target.ts', targetSourceRevision: 'sha256:target-1',
    targetStableSymbolId: 'symbol:target', targetSymbolVersionId: 'symbol-version:target:1',
    targetUpstreamNodeId: 'node:target', resolutionStatus: 'resolved', evidenceRefs: ['lsp:1'], producerRevision: 'lsp:v1',
  };
  const result = bindLspResolutionToRevisionQualifiedSymbol(input);
  assert.equal(result.targetSourceRef, 'src/target.ts');
  assert.equal(result.targetSourceRevision, 'sha256:target-1');
  assert.throws(() => bindLspResolutionToRevisionQualifiedSymbol({ ...input, targetSourceRevision: null }), /LSP_TARGET_REVISION_SYMBOL_BINDING_REQUIRED/);
  assert.throws(() => bindLspResolutionToRevisionQualifiedSymbol({ ...input, resolutionStatus: 'ambiguous' }), /LSP_TARGET_NOT_RESOLVED/);
});
