import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeatureRelationship } from '../dist/core/feature-intelligence.js';
import { aceHypergraphPayloadSchema } from '../dist/core/ace-hypergraph-payload.js';
import { buildAcePacketV2 } from '../dist/core/ace-packet-v2.js';
import { runHypergraphFusionFacade } from '../dist/core/hypergraph-fusion-facade.js';
import { attachHypergraphEvidenceToAcePacketV3, buildAcePacketV3, verifyAcePacketV3 } from '../dist/core/ace-packet-v3.js';

const sha = (c) => `sha256:${c.repeat(64)}`;
const SRC = 'src/routes/api/case/[id]/+server.ts';

async function baseV2(packetKey = 'packet:route-patch-case') {
  const auth = buildFeatureRelationship({
    relationship_id: 'rel:authorized-case-mutation',
    relationship_type: 'authorized_resource_mutation',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: 'feature:case-edit' },
      { role: 'route', entity_type: 'route', entity_id: 'route:patch-case' },
    ],
    cardinality: [], source_ref: SRC, source_revision: 'src-r1', relationship_revision: 'rel-r1',
    producer_revision: 'producer-r1', evidence_refs: ['evidence:route-ast'], confidence: 0.94, metadata: {},
  });
  const result = await runHypergraphFusionFacade({
    query_id: 'query:case-edit-auth', source_snapshot_revision: 'snapshot-r1', producer_revision: 'parent-atlas-test-r1',
    candidates: [{ canonical_id: 'route:patch-case', family: 'entity', packet_key: packetKey, source_ref: SRC, feature_id: 'feature:case-edit', score: 0.96 }],
    repository: { async findRelationshipsForEntities() { return [auth]; } },
    relationship_resolver: async () => [],
    expectation: {
      schema: 'atlas.query-evidence-expectation.v1', query_id: 'query:case-edit-auth',
      expected_entity_types: ['feature', 'route'], expected_relationship_types: ['authorized_resource_mutation'],
      required_evidence_kinds: ['source_ast'], minimum_relationships: 1, minimum_evidence_refs: 1,
    },
    relationship_types: ['authorized_resource_mutation'], maximum_hop_count: 1, fanout_limit: 10,
    semantic_scores: { 'rel:authorized-case-mutation': 0.96 }, ppr_scores: { 'rel:authorized-case-mutation': 0.9 },
    extraction_confidence: { 'rel:authorized-case-mutation': 0.98 },
    evidence_inventory: { evidence_kinds: ['source_ast'], contradiction_refs: [], stale_refs: [] },
    semantic_executors: ['qdrant'],
  });
  const hypergraph = aceHypergraphPayloadSchema.parse(result.ace_payloads[0]);
  return buildAcePacketV2({
    packet_revision: 'packet-r1',
    envelope: { packet_key: packetKey, source_ref: SRC, canonical_source_ref: SRC, feature_id: 'feature:case-edit', source_revision: 'src-r1' },
    hypergraph, producer_revision: 'parent-atlas-test-r1',
  });
}

const section = (data, status = 'CURRENT', revision = 'r1') => ({ status, revision, evidence_refs: [], data });

function body(base, over = {}) {
  return {
    base,
    identity: {
      packet_key: 'packet:route-patch-case', source_ref: SRC, workspace_revision: 'sha256:ws', source_revision: 'src-r1',
      packet_revision: 'packet-r1', producer_revision: 'composer-r1', representation_id: 'semantic_768', representation_revision: 'rep-r1',
      feature_revision: 'feat-r1', graph_revision: 'graph-r1', symbol_version_id: null, tree_node_id: null,
    },
    source: section({ language: 'typescript', source_digest: sha('a'), start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' }),
    semantic: section({
      summary: section({ text: 'Patches a case.', input_digest: sha('b'), model_revision: 'ornith-1' }),
      embedding: section({ model: 'embeddinggemma', dimension: 768, input_digest: sha('b'), embedding_digest: sha('c'), vector_ref: { kind: 'CANDIDATE_ORDINAL', value: '17' } }),
      keywords: ['case'], entities: [], concept_ids: ['c1'], domain_class: 'backend',
    }),
    topology: section({ community_id: '9', pagerank: 0.4, som: { row: 4, col: 17 }, kmeans_cluster: '12', centroid_refs: [{ kind: 'SOM_BMU', artifact_id: 'centroid:som:04:17', representation_id: 'semantic_768', representation_revision: 'rep-r1', artifact_checksum: sha('d'), similarity: 0.88 }] }),
    residency: section({ tier: 'HOT', lod: 'SOURCE_SPAN', utility: 0.5, prefetch_reasons: [], cache_identity_checksum: sha('e') }),
    evidence: section({ refs: ['evidence:route-ast'], contradictions: [], stale_refs: [] }),
    ...over,
  };
}

test('builds a sealed v3 packet with a deterministic checksum that verifies', async () => {
  const base = await baseV2();
  const a = buildAcePacketV3(body(base));
  const b = buildAcePacketV3(body(base));
  assert.equal(a.schema, 'atlas.ace-packet.v3');
  assert.match(a.integrity.packet_checksum, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.integrity.packet_checksum, b.integrity.packet_checksum);
  assert.equal(verifyAcePacketV3(JSON.parse(JSON.stringify(a))).integrity.packet_checksum, a.integrity.packet_checksum);
});

test('attaches only exact-snapshot hypergraph evidence and reseals the v3 packet', async () => {
  const v2 = await baseV2();
  const hypergraph = v2.hypergraph;
  const withoutHypergraph = { ...v2, hypergraph: null };
  const packetBody = body(withoutHypergraph);
  packetBody.identity.workspace_revision = hypergraph.lineage.source_snapshot_revision;
  const packet = buildAcePacketV3(packetBody);

  const attached = attachHypergraphEvidenceToAcePacketV3(packet, hypergraph);
  assert.deepEqual(attached.base.hypergraph, hypergraph);
  assert.notEqual(attached.integrity.packet_checksum, packet.integrity.packet_checksum);
  assert.equal(verifyAcePacketV3(attached).integrity.packet_checksum, attached.integrity.packet_checksum);
  assert.equal(
    attachHypergraphEvidenceToAcePacketV3(attached, hypergraph).integrity.packet_checksum,
    attached.integrity.packet_checksum,
  );

  const wrongPacketKey = structuredClone(hypergraph);
  wrongPacketKey.packet_key = 'packet:other';
  assert.throws(() => attachHypergraphEvidenceToAcePacketV3(packet, wrongPacketKey), /PACKET_KEY_MISMATCH/);

  const wrongSource = structuredClone(hypergraph);
  wrongSource.source_ref = 'src/other.ts';
  assert.throws(() => attachHypergraphEvidenceToAcePacketV3(packet, wrongSource), /SOURCE_REF_MISMATCH/);

  const wrongFeature = structuredClone(hypergraph);
  wrongFeature.feature_id = 'feature:other';
  assert.throws(() => attachHypergraphEvidenceToAcePacketV3(packet, wrongFeature), /FEATURE_ID_MISMATCH/);

  const wrongWorkspace = structuredClone(hypergraph);
  wrongWorkspace.lineage.source_snapshot_revision = 'snapshot:other';
  assert.throws(() => attachHypergraphEvidenceToAcePacketV3(packet, wrongWorkspace), /WORKSPACE_REVISION_MISMATCH/);
});

test('tampering with any section breaks verification (stale cache entry becomes a MISS)', async () => {
  const packet = JSON.parse(JSON.stringify(buildAcePacketV3(body(await baseV2()))));
  packet.topology.data.pagerank = 0.99;
  assert.throws(() => verifyAcePacketV3(packet), /packet_checksum/);
});

test('identity cannot diverge from the canonical envelope', async () => {
  const base = await baseV2();
  const b = body(base);
  b.identity.packet_key = 'packet:someone-else';
  assert.throws(() => buildAcePacketV3(b), /packet_key/);
  const c = body(base);
  c.identity.source_revision = 'src-r2';
  assert.throws(() => buildAcePacketV3(c), /source_revision/);
});

test('a CURRENT section must name a revision; HINT/STALE/PENDING sections may omit it', async () => {
  const base = await baseV2();
  const noRev = body(base, { source: section({ language: 'typescript', source_digest: sha('a'), start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' }, 'CURRENT', null) });
  assert.throws(() => buildAcePacketV3(noRev), /producing revision/);
  const hint = body(base, { source: section({ language: 'typescript', source_digest: sha('a'), start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' }, 'HINT', null) });
  assert.doesNotThrow(() => buildAcePacketV3(hint));
});

test('a CURRENT embedding without input/embedding digests or a vector reference is rejected (the July placeholder lesson)', async () => {
  const base = await baseV2();
  const semantic = (embedding) => section({
    summary: section({ text: 'x', input_digest: sha('b'), model_revision: 'm' }), embedding,
    keywords: [], entities: [], concept_ids: [], domain_class: null,
  });
  const noInput = body(base, { semantic: semantic(section({ model: 'embeddinggemma', dimension: 768, input_digest: null, embedding_digest: sha('c'), vector_ref: { kind: 'CANDIDATE_ORDINAL', value: '1' } })) });
  assert.throws(() => buildAcePacketV3(noInput), /input_digest and embedding_digest/);
  const noRef = body(base, { semantic: semantic(section({ model: 'embeddinggemma', dimension: 768, input_digest: sha('b'), embedding_digest: sha('c'), vector_ref: null })) });
  assert.throws(() => buildAcePacketV3(noRef), /vector_ref/);
  const legacyHint = body(base, { semantic: semantic(section({ model: 'embeddinggemma', dimension: 768, input_digest: null, embedding_digest: null, vector_ref: null }, 'STALE', null)) });
  assert.doesNotThrow(() => buildAcePacketV3(legacyHint));
});

test('centroid references cannot cross representations', async () => {
  const base = await baseV2();
  const b = body(base);
  b.topology.data.centroid_refs[0].representation_id = 'latent_64';
  assert.throws(() => buildAcePacketV3(b), /representation_id/);
});

test('unknown fields are rejected (strict sections, no inline vectors smuggled in)', async () => {
  const base = await baseV2();
  const b = body(base);
  b.semantic.data.embedding.data.vector = [0.1, 0.2];
  assert.throws(() => buildAcePacketV3(b));
});

test('optional structural section: absent keeps checksum; present is sealed; CURRENT needs provider_revision', async () => {
  const base = await baseV2();
  const plain = buildAcePacketV3(body(base));
  assert.equal(plain.structural, undefined);
  const structural = (rev, providerRev) => ({ status: 'CURRENT', revision: rev, evidence_refs: [], data: { provider: 'ast-grep-napi', provider_revision: providerRev, symbols: [{ name: 'patchCase', kind: 'function', byte_start: 10, byte_end: 90 }], imports: ['zod'], calls: ['db.update'], exports: ['PATCH'], ast_grep_rule_ids: ['r1'], structural_fact_refs: [] } });
  const withStruct = buildAcePacketV3(body(base, { structural: structural('s1', 'astgrep-0.44') }));
  assert.notEqual(withStruct.integrity.packet_checksum, plain.integrity.packet_checksum);
  assert.equal(verifyAcePacketV3(JSON.parse(JSON.stringify(withStruct))).structural.data.symbols[0].name, 'patchCase');
  assert.throws(() => buildAcePacketV3(body(base, { structural: structural('s1', null) })), /provider_revision/);
  const bad = structural('s1', 'x'); bad.data.symbols[0].byte_end = 5;
  assert.throws(() => buildAcePacketV3(body(base, { structural: bad })), /byte_end/);
});
