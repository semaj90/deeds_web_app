import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichLspTargetIdentityV1 } from '../dist/core/lsp-target-identity-enrichment-v1.js';

const input = {
  featureId: 'feature:call', packetKey: 'packet:source', workspaceRevision: 'sha256:workspace',
  source: { sourceRef: 'src/source.ts', sourceRevision: 'sha256:source' },
  target: { uri: 'file:///workspace/src/target.ts', range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 8 }, upstreamNodeId: 'node:target' },
  producer: { lspServerRevision: 'tsls:1', projectRevision: 'project:1', resolverRevision: 'resolver:1' },
};

function readers(rows = [{ stableSymbolId: 'symbol:target', symbolVersionId: 'symbol-version:target:1', treeNodeId: 'node:target', startByte: 0, endByte: 8, symbolRegistryRevision: 'registry:1' }]) {
  return {
    resolveSourceRef: () => 'src/target.ts',
    lookupSourceRevision: () => ({ sourceRef: 'src/target.ts', sourceRevision: 'sha256:target', sourceInventoryRevision: 'inventory:1', contentDigest: 'digest:target', sourceText: 'Target()' }),
    lookupSymbols: () => rows,
  };
}

test('enriches an LSP target through exact tree identity', () => {
  const result = enrichLspTargetIdentityV1(input, readers());
  assert.equal(result.status, 'ENRICHED');
  assert.equal(result.targetIdentity.identityEvidence.lookupMethod, 'EXACT_TREE_NODE');
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
