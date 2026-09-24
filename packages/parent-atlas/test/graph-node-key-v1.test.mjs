import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveGraphNodeKeyV1 } from '../dist/core/graph-node-key-v1.js';

test('prefers canonical symbol, packet, and chunk identities', () => {
  assert.equal(deriveGraphNodeKeyV1({ symbolVersionId: 'sv-1', packetKey: 'pk-1' }), 'symbol:sv-1');
  assert.equal(deriveGraphNodeKeyV1({ packetKey: 'pk-1' }), 'packet:pk-1');
  assert.equal(deriveGraphNodeKeyV1({ chunkId: 'chunk-1' }), 'chunk:chunk-1');
});

test('derives occurrence projection identity from exact source coordinates', () => {
  const a = deriveGraphNodeKeyV1({ sourceRef: 'src/a.ts', sourceRevision: 'sha256:a', upstreamNodeId: 'node-1', byteStart: 1, byteEnd: 9 });
  const b = deriveGraphNodeKeyV1({ sourceRef: 'src/a.ts', sourceRevision: 'sha256:a', upstreamNodeId: 'node-1', byteStart: 1, byteEnd: 9 });
  assert.equal(a, b);
  assert.match(a, /^occurrence:[a-f0-9]{64}$/);
});

test('does not use treeNodeId as identity', () => {
  assert.throws(() => deriveGraphNodeKeyV1({ treeNodeId: 'legacy-tree-id' }), /GRAPH_NODE_KEY_IDENTITY_INSUFFICIENT/);
});

test('keeps semantic node kinds separate from projection-address prefixes', async () => {
  const { graphNodeKeyV1Schema } = await import('../dist/core/graph-node-key-v1.js');
  for (const kind of ['concept', 'document', 'process', 'package', 'test', 'external_doc']) {
    assert.equal(graphNodeKeyV1Schema.safeParse(`${kind}:id-1`).success, false);
  }
  for (const prefix of ['symbol', 'packet', 'chunk', 'occurrence']) {
    assert.equal(graphNodeKeyV1Schema.safeParse(`${prefix}:id-1`).success, true);
  }
});
