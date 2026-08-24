import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrpcClient } from '../dist/grpc/client.js';

function createMockClient() {
  const calls = [];
  const client = createGrpcClient({
    address: '127.0.0.1',
    transport: {
      async searchCodebase(request) {
        calls.push(['searchCodebase', request]);
        return { chunks: [{ chunkId: 'chunk-1', filePath: 'src/example.ts', score: 0.9 }], totalMs: 4 };
      },
      async searchEvidence(request) {
        calls.push(['searchEvidence', request]);
        return { results: [], bundles: [], cacheSource: 'memory' };
      },
      async *streamCodebase() {
        yield { progress: { stage: 'search' } };
        yield { chunk: { chunkId: 'chunk-1' } };
      },
      async *streamEvidence() {
        yield { progress: { stage: 'embed' } };
      },
      async health() {
        return { status: 'degraded', pgvectorConnected: true, qdrantConnected: true, redisConnected: false, embeddingServiceUp: true };
      },
    },
  });
  return { client, calls };
}

test('maps typed SearchEvidence requests and preserves response fields', async () => {
  const { client, calls } = createMockClient();
  const response = await client.searchEvidence({ query: 'contract', queryEmbedding: new Float32Array([1, 2]), limit: 3 });
  assert.equal(response.cacheSource, 'memory');
  assert.deepEqual(calls[0][1].queryEmbedding, [1, 2]);
  assert.equal(calls[0][1].limit, 3);
});

test('consumes streaming RPCs as async iterables', async () => {
  const { client } = createMockClient();
  const codebaseEvents = [];
  for await (const event of client.streamCodebase({ query: 'x' })) codebaseEvents.push(event);
  const evidenceEvents = [];
  for await (const event of client.streamEvidence({ query: 'x' })) evidenceEvents.push(event);
  assert.equal(codebaseEvents.length, 2);
  assert.equal(evidenceEvents.length, 1);
});

test('health remains strict while healthDetails preserves degraded state', async () => {
  const { client } = createMockClient();
  const details = await client.healthDetails();
  assert.equal(details.status, 'degraded');
  assert.equal(details.redisConnected, false);
  assert.equal(await client.health(), false);
});

test('close releases an injected transport', async () => {
  let closed = false;
  const client = createGrpcClient({
    address: '127.0.0.1',
    transport: {
      async searchCodebase() { return { chunks: [] }; },
      async searchEvidence() { return {}; },
      async *streamCodebase() {},
      async *streamEvidence() {},
      async health() { return {}; },
      close() { closed = true; },
    },
  });
  await client.close();
  assert.equal(closed, true);
});
