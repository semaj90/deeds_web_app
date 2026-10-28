import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { enrichLspTargetIdentityV1 } from '../dist/core/lsp-target-identity-enrichment-v1.js';

const input = {
  featureId: 'feature:call', packetKey: 'packet:source', workspaceRevision: 'sha256:workspace',
  source: { sourceRef: 'src/source.ts', sourceRevision: 'sha256:source' },
  target: { uri: 'file:///workspace/src/target.ts', range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 8 }, upstreamNodeId: 'node:target' },
  producer: { lspServerRevision: 'tsls:1', projectRevision: 'project:1', resolverRevision: 'resolver:1' },
};
const digest = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

function readers(rows = [{ stableSymbolId: 'symbol:target', symbolVersionId: 'symbol-version:target:1', treeNodeId: 'node:target', startByte: 0, endByte: 8, symbolRegistryRevision: 'registry:1' }]) {
  return {
    resolveSourceRef: () => 'src/target.ts',
    lookupSourceRevision: () => ({ sourceRef: 'src/target.ts', sourceRevision: 'sha256:target', sourceInventoryRevision: 'inventory:1', contentDigest: digest('Target()'), sourceText: 'Target()' }),
    lookupSymbols: () => rows,
  };
}

test('enriches an LSP target through exact tree identity', () => {
  const result = enrichLspTargetIdentityV1(input, readers());
  assert.equal(result.status, 'ENRICHED');
  assert.equal(result.targetIdentity.identityEvidence.lookupMethod, 'EXACT_TREE_NODE');
  assert.equal(result.targetIdentity.identityEvidence.positionEncoding, 'utf-16');
  assert.equal(result.resolution.targetSourceRevision, 'sha256:target');
  assert.equal(result.resolution.targetSymbolVersionId, 'symbol-version:target:1');
  assert.equal(result.resolution.canonicalAuthority, false);
});

test('fails closed for ambiguous and outside-workspace targets', () => {
  const ambiguous = enrichLspTargetIdentityV1(input, readers([
    { stableSymbolId: 'symbol:a', symbolVersionId: 'version:a', treeNodeId: null, startByte: 0, endByte: 8, symbolRegistryRevision: 'registry:1' },
    { stableSymbolId: 'symbol:b', symbolVersionId: 'version:b', treeNodeId: null, startByte: 0, endByte: 8, symbolRegistryRevision: 'registry:1' },
  ]));
  assert.equal(ambiguous.status, 'TARGET_IDENTITY_AMBIGUOUS');
  assert.equal(ambiguous.resolution.targetStableSymbolId, null);

  const outside = enrichLspTargetIdentityV1(input, { ...readers(), resolveSourceRef: () => null });
  assert.equal(outside.status, 'TARGET_SOURCE_NOT_FOUND');
  assert.equal(outside.resolution.resolutionClass, 'OUTSIDE_WORKSPACE');
});

test('resolves a cross-file Unicode target using each negotiated position encoding', () => {
  const sourceText = '// 😀\r\nexport function λtarget() {}';
  const prefix = 'export function ';
  const symbol = 'λtarget';
  const startByte = Buffer.byteLength(`// 😀\r\n${prefix}`, 'utf8');
  const endByte = startByte + Buffer.byteLength(symbol, 'utf8');
  for (const [positionEncoding, width] of [['utf-8', Buffer.byteLength(symbol, 'utf8')], ['utf-16', symbol.length], ['utf-32', [...symbol].length]]) {
    const result = enrichLspTargetIdentityV1({
      ...input,
      target: { ...input.target, upstreamNodeId: null, range: { startLine: 1, startCharacter: prefix.length, endLine: 1, endCharacter: prefix.length + width } },
      producer: { ...input.producer, positionEncoding },
    }, {
      resolveSourceRef: () => 'src/target.ts',
      lookupSourceRevision: () => ({ sourceRef: 'src/target.ts', sourceRevision: 'sha256:target', sourceInventoryRevision: 'inventory:1', contentDigest: digest(sourceText), sourceText }),
      lookupSymbols: (lookup) => {
        assert.equal(lookup.startByte, startByte);
        assert.equal(lookup.endByte, endByte);
        return [{ stableSymbolId: 'symbol:target', symbolVersionId: 'symbol-version:target:1', startByte, endByte, symbolRegistryRevision: 'registry:1' }];
      },
    });
    assert.equal(result.status, 'ENRICHED');
    assert.deepEqual(result.targetIdentity.targetRange, { startByte, endByte });
    assert.equal(result.targetIdentity.identityEvidence.positionEncoding, positionEncoding);
  }
});

test('rejects changed source bytes and mismatched node ranges before resolving an identity', () => {
  let symbolLookupCalled = false;
  const changedSourceReaders = {
    ...readers(),
    lookupSourceRevision: () => ({ sourceRef: 'src/target.ts', sourceRevision: 'sha256:target', sourceInventoryRevision: 'inventory:1', contentDigest: digest('Target()'), sourceText: 'Changed!' }),
    lookupSymbols: () => { symbolLookupCalled = true; return []; },
  };
  assert.throws(() => enrichLspTargetIdentityV1(input, changedSourceReaders), /LSP_TARGET_SOURCE_DIGEST_MISMATCH/);
  assert.equal(symbolLookupCalled, false);
  assert.throws(() => enrichLspTargetIdentityV1(input, readers([{ stableSymbolId: 'symbol:target', symbolVersionId: 'symbol-version:target:1', treeNodeId: 'node:target', startByte: 1, endByte: 8, symbolRegistryRevision: 'registry:1' }])), /LSP_TARGET_NODE_RANGE_MISMATCH/);
  assert.throws(() => enrichLspTargetIdentityV1(input, readers([{ stableSymbolId: 'symbol:target', symbolVersionId: 'symbol-version:target:1', treeNodeId: 'node:target', startByte: NaN, endByte: 8, symbolRegistryRevision: 'registry:1' }])), /LSP_TARGET_NODE_RANGE_MISMATCH/);
});
