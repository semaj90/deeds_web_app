import assert from 'node:assert/strict';
import { buildPacketProjectionPageSql, packetProjectionParams } from '../src/packet-projection.js';
import { compareProjectionParity } from '../src/projection-parity.js';
import { evaluateReranker } from '../src/reranker-evaluation.js';

assert.match(buildPacketProjectionPageSql(false), /LIMIT \$1/);
assert.deepEqual(packetProjectionParams(null, 500), [500]);
assert.match(buildPacketProjectionPageSql(true), /packet_id > \$1/);
assert.deepEqual(packetProjectionParams('pkt-10', 500), ['pkt-10', 500]);

const parity = compareProjectionParity(
  { store: 'postgres', packetId: '1', packetKey: 'k', workspaceRevision: 'r', contentHash: 'h', projectionRevision: 'p', representationId: 'e' },
  [{ store: 'qdrant', packetId: '1', packetKey: 'k', workspaceRevision: 'r', contentHash: 'h', projectionRevision: 'p', representationId: 'e' }],
);
assert.equal(parity.pass, true);

const reranker = evaluateReranker([
  { queryId: 'q1', packetId: 'a', relevance: 3, baselineRank: 2, rerankedRank: 1, latencyMs: 20 },
  { queryId: 'q1', packetId: 'b', relevance: 0, baselineRank: 1, rerankedRank: 2, latencyMs: 20 },
]);
assert.ok(reranker.ndcgAt5Reranked > reranker.ndcgAt5Baseline);
console.log('integration-kit tests passed');
