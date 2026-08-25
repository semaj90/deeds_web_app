import assert from 'node:assert/strict';
import { test } from 'node:test';

const pkg = await import('../dist/index.js');
const { PacketValidator } = pkg;

const MOCK_PACKET_ROW = {
  packet_key: 'ace:packet:auth:001',
  source_ref: 'src/lib/server/auth.ts',
  feature_id: 'auth.sessions',
  trace_id: null,
  summary: 'Handles session validation.',
  embedding_status: 'complete',
  embedding_768d: [0.1, 0.2, 0.3],
  qdrant_point_id: null,
  neo4j_node_id: null,
  valkey_cache_key: null,
  seaweedfs_filer_path: null,
  som_x: 3,
  som_y: 4,
  karpathy_score: 0.5,
};

function makePgClient(row) {
  return { query: async () => ({ rows: [row] }) };
}

function makeRedisClient() {
  const calls = [];
  return { calls, setex: async (...args) => { calls.push(args); } };
}

test('materializeToMirrors reports honest not_implemented for Qdrant/Neo4j when no clients are injected (PACKET-MATERIALIZER-01 fix)', async () => {
  const validator = new PacketValidator(makePgClient(MOCK_PACKET_ROW), makeRedisClient());
  const report = await validator.materializeToMirrors(MOCK_PACKET_ROW.packet_key);

  assert.equal(report.mirrors.qdrant.synced, false);
  assert.match(report.mirrors.qdrant.error, /^not_implemented/);
  assert.equal(report.mirrors.neo4j.synced, false);
  assert.match(report.mirrors.neo4j.error, /^not_implemented/);
  // Redis must still be genuinely synced — this branch was never fabricated.
  assert.equal(report.mirrors.redis.synced, true);
});

test('materializeToMirrors performs a real Qdrant upsert and Neo4j MERGE when clients are injected', async () => {
  const upsertCalls = [];
  const qdrantClient = {
    upsert: async (collection, body) => { upsertCalls.push({ collection, body }); },
  };

  const runCalls = [];
  let sessionClosed = false;
  const neo4jDriver = {
    session: () => ({
      run: async (query, params) => { runCalls.push({ query, params }); return { records: [] }; },
      close: async () => { sessionClosed = true; },
    }),
  };

  const validator = new PacketValidator(
    makePgClient(MOCK_PACKET_ROW),
    makeRedisClient(),
    { qdrantClient, qdrantCollection: 'codebase_chunks_768_v2', neo4jDriver },
  );
  const report = await validator.materializeToMirrors(MOCK_PACKET_ROW.packet_key);

  assert.equal(report.mirrors.qdrant.synced, true);
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].collection, 'codebase_chunks_768_v2');
  assert.equal(upsertCalls[0].body.points[0].payload.packet_key, MOCK_PACKET_ROW.packet_key);

  assert.equal(report.mirrors.neo4j.synced, true);
  assert.equal(runCalls.length, 1);
  assert.match(runCalls[0].query, /MERGE \(p:AtlasPacket/);
  assert.equal(runCalls[0].params.packetKey, MOCK_PACKET_ROW.packet_key);
  assert.equal(sessionClosed, true);
});

test('materializeToMirrors reports synced:false (not a thrown error) when an injected client fails', async () => {
  const qdrantClient = { upsert: async () => { throw new Error('boom'); } };
  const neo4jDriver = {
    session: () => ({
      run: async () => { throw new Error('cypher boom'); },
      close: async () => {},
    }),
  };

  const validator = new PacketValidator(
    makePgClient(MOCK_PACKET_ROW),
    makeRedisClient(),
    { qdrantClient, qdrantCollection: 'codebase_chunks_768_v2', neo4jDriver },
  );
  const report = await validator.materializeToMirrors(MOCK_PACKET_ROW.packet_key);

  assert.equal(report.mirrors.qdrant.synced, false);
  assert.match(report.mirrors.qdrant.error, /boom/);
  assert.equal(report.mirrors.neo4j.synced, false);
  assert.match(report.mirrors.neo4j.error, /cypher boom/);
});

test('materializeToMirrors skips Qdrant entirely when the packet has no embedding, even with a client injected', async () => {
  const row = { ...MOCK_PACKET_ROW, embedding_status: 'missing', embedding_768d: null };
  const upsertCalls = [];
  const qdrantClient = { upsert: async (...args) => { upsertCalls.push(args); } };

  const validator = new PacketValidator(
    makePgClient(row),
    makeRedisClient(),
    { qdrantClient, qdrantCollection: 'codebase_chunks_768_v2' },
  );
  const report = await validator.materializeToMirrors(row.packet_key);

  assert.equal(upsertCalls.length, 0);
  assert.equal(report.mirrors.qdrant.synced, false);
  assert.equal(report.mirrors.qdrant.error, undefined);
  assert.equal(report.mirrors.qdrant.pointId, null);
});
