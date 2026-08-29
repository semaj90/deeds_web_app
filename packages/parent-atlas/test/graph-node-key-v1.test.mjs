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
