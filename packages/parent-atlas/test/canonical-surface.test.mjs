import assert from 'node:assert/strict';
import { test } from 'node:test';

const pkg = await import('../dist/index.js');

test('parent-atlas exports canonical packet bridge and summary builders', () => {
  assert.equal(typeof pkg.extractPacketIdentityFromRow, 'function');
  assert.equal(typeof pkg.validatePacketIdentityFromRow, 'function');
  assert.equal(typeof pkg.verifyPacketIdentityConsistency, 'function');
  assert.equal(typeof pkg.createEnvelopeFromRow, 'function');
  assert.equal(typeof pkg.buildSummaryContext, 'function');
  assert.equal(typeof pkg.makeGemma4SummaryPacket, 'function');
  assert.equal(typeof pkg.makeChrom97Packet, 'function');
  assert.equal(typeof pkg.toNdjsonLine, 'function');
  assert.equal(typeof pkg.PacketValidator, 'function');
});

test('parent-atlas exports shared env helpers for repo routing', () => {
  assert.equal(typeof pkg.loadRepoEnv, 'function');
  assert.equal(typeof pkg.resolveRedisConfig, 'function');
  assert.equal(typeof pkg.resolveDatabaseUrl, 'function');
});

test('parent-atlas mirrors the shared Atlas contracts used for sharing logic', () => {
  assert.equal(typeof pkg.temporalPacketSchema, 'object');
  assert.equal(typeof pkg.processingPassSchema, 'object');
  assert.equal(typeof pkg.semanticPayloadEnvelopeSchema, 'object');
  assert.equal(typeof pkg.graphSnapshotManifestSchema, 'object');
  assert.equal(typeof pkg.atlasEventFlowSchema, 'object');
  assert.equal(typeof pkg.multiHopRetrievalConfigSchema, 'object');
  assert.equal(typeof pkg.buildFeatureEnvelopeObject, 'function');
  assert.equal(typeof pkg.buildAtlasEventFlow, 'function');
  assert.equal(typeof pkg.buildMultiHopRetrievalResult, 'function');
  assert.equal(typeof pkg.resolveAtlasQdrantDenseVectorName, 'function');
  assert.equal(pkg.resolveAtlasQdrantDenseVectorName(), 'dense_retrieval');

  const flow = pkg.buildAtlasEventFlow({
    flow_id: 'flow-1',
    repository: 'deeds-web-app',
    source_root: 'C:/Users/james/Videos/deeds-web-app',
    generated_at: '2026-07-21T00:00:00.000Z',
    status: 'PASS',
    summary: 'Daily graphify control-plane event flow',
    next_safe_action: 'Review the next bounded lane.',
    events: [
      {
        event_id: 'event-1',
        source: 'checkpoint',
        event: 'checkpoint',
        state: 'WIRED',
        lane: 'daily-graphify',
        summary: 'Checkpoint wired',
        created_at: '2026-07-21T00:00:00.000Z',
        updated_at: '2026-07-21T00:00:00.000Z',
        next_steps: ['Run the next pass'],
      },
    ],
  });

  assert.equal(flow.contract_version, 'atlas-event-flow-v1');
  assert.equal(flow.events[0].state, 'WIRED');
  assert.equal(flow.summary.event_count, 1);
  assert.equal(flow.next_safe_action, 'Review the next bounded lane.');
  assert.doesNotThrow(() => pkg.atlasEventFlowSchema.parse(flow));
  assert.equal(
    pkg.hashAtlasEventFlow({ z: 1, a: 2 }),
    pkg.hashAtlasEventFlow({ a: 2, z: 1 }),
  );
});

test('chrom97 packets preserve canonical summary identity fields', () => {
  const packet = pkg.makeChrom97Packet({
    packet_key: 'packet-1',
    source_ref: 'src/routes/api/foo.ts',
    canonical_source_ref: 'repo:src/routes/api/foo.ts',
    feature_id: 'feature.search.foo',
    feature_label: 'Foo Search',
    summary: 'Foo summary',
    domain_class: 'retrieval',
    ontology_label: 'api_route',
    topology_label: 'retrieval_layer',
    summary_packet_key: 'packet-1:summary',
    tags: ['retrieval'],
  });

  assert.equal(packet.packet_type, 'chrom97');
  assert.equal(packet.packet_key, 'packet-1');
  assert.equal(packet.source_ref, 'src/routes/api/foo.ts');
  assert.equal(packet.canonical_source_ref, 'repo:src/routes/api/foo.ts');
  assert.equal(packet.feature_id, 'feature.search.foo');
  assert.equal(packet.summary_packet_key, 'packet-1:summary');
  assert.equal(packet.topology_label, 'retrieval_layer');
  assert.ok(packet.packet_id);
  assert.ok(packet.record_hash);
});

test('Qdrant payload carries tree lineage and graph ranking fields', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({ status: 'ok', result: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const adapter = pkg.createQdrantAdapter('http://qdrant.test');
    await adapter.upsertPoint('codebase_chunks_768', 'point-1', [0.1, 0.2], {
      packet_key: 'packet-1',
      source_ref: 'src/routes/api/foo.ts',
      feature_id: 'feature.search.foo',
      title_id: 'title:foo',
      tree_node_id: '11111111-1111-4111-8111-111111111111',
      parent_packet_key: 'packet-parent',
      domain_class: 'retrieval',
      som_row: 8,
      som_col: 13,
      som_index: 173,
      kmeans_cluster: 12,
      community_id: 39582,
      page_rank_score: 0.75,
    }, 'trace-1');

    const payload = requestBody.points[0].payload;
    assert.equal(payload.tree_node_id, '11111111-1111-4111-8111-111111111111');
    assert.equal(payload.parent_packet_key, 'packet-parent');
    assert.equal(payload.som_row, 8);
    assert.equal(payload.som_col, 13);
    assert.equal(payload.page_rank_score, 0.75);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Neo4j packet upsert carries tree lineage for GDS fan-out', async () => {
  const originalFetch = globalThis.fetch;
  let statement = null;
  let parameters = null;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    statement = body.statements?.[0]?.statement;
    parameters = body.statements?.[0]?.parameters;
    return new Response(JSON.stringify({
      results: [{ columns: ['nodeId'], data: [{ row: [42] }] }],
      errors: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const adapter = pkg.createNeo4jAdapter('http://neo4j.test');
    const nodeId = await adapter.upsertPacketNode({
      packet_key: 'packet-1',
      source_ref: 'src/routes/api/foo.ts',
      feature_id: 'feature.search.foo',
      title_id: 'title:foo',
      tree_node_id: '11111111-1111-4111-8111-111111111111',
      parent_packet_key: 'packet-parent',
      domain_class: 'retrieval',
      som_row: 8,
      som_col: 13,
      som_index: 173,
      kmeans_cluster: 12,
      community_id: 39582,
      page_rank_score: 0.75,
    }, 'trace-1');

    assert.equal(nodeId, '42');
    assert.match(statement, /p\.tree_node_id = \$tree_node_id/);
    assert.equal(parameters.tree_node_id, '11111111-1111-4111-8111-111111111111');
    assert.equal(parameters.page_rank_score, 0.75);
    assert.equal(parameters.som_index, 173);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
