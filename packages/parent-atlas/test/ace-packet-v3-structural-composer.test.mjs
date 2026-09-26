import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeatureRelationship } from '../dist/core/feature-intelligence.js';
import { aceHypergraphPayloadSchema } from '../dist/core/ace-hypergraph-payload.js';
import { buildAcePacketV2 } from '../dist/core/ace-packet-v2.js';
import { runHypergraphFusionFacade } from '../dist/core/hypergraph-fusion-facade.js';
import { buildAcePacketV3, verifyAcePacketV3 } from '../dist/core/ace-packet-v3.js';
import { attachStructuralEvidenceToAcePacketV3 } from '../dist/core/ace-packet-v3-structural-composer.js';
import { compileStructuralExtractionFabric } from '../dist/core/structural-extraction-fabric.js';

const SRC = 'src/routes/case.ts';
const sha = (n) => `sha256:${String(n).repeat(64)}`;

async function makePacket() {
  const relationship = buildFeatureRelationship({
    relationship_id: 'rel:case', relationship_type: 'route_uses_feature',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: 'feature:case' },
      { role: 'route', entity_type: 'route', entity_id: 'route:case' },
    ], cardinality: [], source_ref: SRC, source_revision: 'source-r1', relationship_revision: 'rel-r1',
    producer_revision: 'test-r1', evidence_refs: ['evidence:route'], confidence: 0.9, metadata: {},
  });
  const result = await runHypergraphFusionFacade({
    query_id: 'query:case', source_snapshot_revision: 'workspace-r1', producer_revision: 'test-r1',
    candidates: [{ canonical_id: 'route:case', family: 'entity', packet_key: 'packet:case', source_ref: SRC, feature_id: 'feature:case', score: 1 }],
    repository: { async findRelationshipsForEntities() { return [relationship]; } }, relationship_resolver: async () => [],
    expectation: { schema: 'atlas.query-evidence-expectation.v1', query_id: 'query:case', expected_entity_types: ['feature', 'route'],
      expected_relationship_types: ['route_uses_feature'], required_evidence_kinds: ['source_ast'], minimum_relationships: 1, minimum_evidence_refs: 1 },
    relationship_types: ['route_uses_feature'], maximum_hop_count: 1, fanout_limit: 4,
    semantic_scores: { 'rel:case': 1 }, ppr_scores: { 'rel:case': 0.5 }, extraction_confidence: { 'rel:case': 1 },
    evidence_inventory: { evidence_kinds: ['source_ast'], contradiction_refs: [], stale_refs: [] }, semantic_executors: ['postgres'],
  });
  const hypergraph = aceHypergraphPayloadSchema.parse(result.ace_payloads[0]);
  const base = buildAcePacketV2({ packet_revision: 'packet-r1',
    envelope: { packet_key: 'packet:case', source_ref: SRC, canonical_source_ref: SRC, feature_id: 'feature:case', source_revision: 'source-r1' },
    hypergraph, producer_revision: 'test-r1' });
  const section = (data, status = 'CURRENT') => ({ status, revision: 'r1', evidence_refs: [], data });
  const packet = buildAcePacketV3({ base, identity: {
    packet_key: 'packet:case', source_ref: SRC, workspace_revision: 'workspace-r1', source_revision: 'source-r1',
    packet_revision: 'packet-r1', producer_revision: 'composer-r1', representation_id: 'semantic_768',
    representation_revision: null, feature_revision: null, graph_revision: null, symbol_version_id: null, tree_node_id: null,
  },
  source: section({ language: 'typescript', source_digest: sha(1), start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' }),
  semantic: section({ summary: section({ text: null, input_digest: null, model_revision: null }, 'PENDING'),
    embedding: section({ model: null, dimension: null, input_digest: null, embedding_digest: null, vector_ref: null }, 'PENDING'),
    keywords: [], entities: [], concept_ids: [], domain_class: null }),
  topology: section({ community_id: null, pagerank: null, som: null, kmeans_cluster: null, centroid_refs: [] }, 'PENDING'),
  residency: section({ tier: 'COLD', lod: 'IDENTITY', utility: null, prefetch_reasons: [], cache_identity_checksum: null }, 'PENDING'),
  evidence: section({ refs: [], contradictions: [], stale_refs: [] }),
  });
  return { packet, hypergraph };
}

function makeStructural({ chunks = [], observations = [], xrefEdges = [], lspObservations = [], sourceRevision = 'source-r1', workspaceRevision = 'workspace-r1' } = {}) {
  return compileStructuralExtractionFabric({
    source_ref: SRC, source_revision: sourceRevision, workspace_revision: workspaceRevision, language: 'typescript',
    chunker_revision: 'treesitter-chunker@4.0.0', ast_grep_revision: 'ast-grep-napi@0.44.0',
    langextract_revision: 'langextract@fixture', chunks, xref_edges: xrefEdges, lsp_observations: lspObservations,
    ast_grep_observations: observations, langextract_observations: [], diagnostics: [],
  }, { producer_revision: 'structural-fabric@fixture' });
}

test('composes revision-bound Tree-sitter and ast-grep facts without minting canonical IDs', async () => {
  const { packet } = await makePacket();
  const tree = { upstream_node_id: 'backend-node:1', upstream_file_id: 'backend-file:1', upstream_symbol_id: 'backend-symbol:1',
    upstream_chunk_id: 'backend-chunk:1', source_ref: SRC, language: 'typescript', node_type: 'function_declaration',
    kind: 'function', symbol_name: 'saveCase', parent_route: [], byte_start: 0, byte_end: 40, start_line: 1, end_line: 2,
    content_hash: 'a'.repeat(64), calls: ['db.update'], imports: ['zod'], exports: ['saveCase'] };
  const targetTree = { ...tree, upstream_node_id: 'backend-node:2', upstream_file_id: 'backend-file:2', upstream_symbol_id: 'symbol-b',
    upstream_chunk_id: 'backend-chunk:2', symbol_name: 'authorizeCase', byte_start: 45, byte_end: 80, start_line: 3, end_line: 4,
    content_hash: 'f'.repeat(64), calls: [], imports: [], exports: [] };
  tree.upstream_symbol_id = 'symbol-a';
  const observation = { schema: 'atlas.ast-grep-observation.v1', observation_id: 'obs:1', rule_id: 'rule:function', source_ref: SRC,
    source_revision: 'source-r1', byte_start: 0, byte_end: 40, matched_text_hash: 'b'.repeat(64), captures: { name: 'saveCase' },
    observation_kind: 'function', confidence: 1, extractor_revision: 'ast-grep-napi@0.44.0', canonical_authority: false };
  const structural = makeStructural({
    chunks: [tree, targetTree], observations: [observation],
    xrefEdges: [{ src: 'symbol-a', dst: 'symbol-b', type: 'CALLS', weight: 1 }],
    lspObservations: [{
      observation_id: 'lsp:definition', reference_id: 'treesitter-chunker-xref:symbol-a:symbol-b:CALLS:source-r1',
      source_ref: SRC, source_tree_node_id: 'backend-node:1', source_revision: 'source-r1', workspace_revision: 'workspace-r1',
      server_id: 'typescript-language-server', server_revision: 'tsls@fixture', project_revision: 'tsconfig@fixture',
      project_config_checksum: `sha256:${'1'.repeat(64)}`, capability_checksum: `sha256:${'2'.repeat(64)}`, position_encoding: 'utf-16',
      operation: 'DEFINITION', source_range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
      target_uri: 'file:///workspace/src/auth.ts', target_source_ref: 'src/auth.ts', target_range: null,
      target_text: 'authorizeCase', target_upstream_node_id: 'backend-node:2', result_status: 'resolved',
      evidence_refs: ['lsp-evidence:1'], checksum: `sha256:${'3'.repeat(64)}`, canonical_authority: false,
    }],
  });
  const result = attachStructuralEvidenceToAcePacketV3({ packet, structural });
  assert.equal(result.structural.status, 'CURRENT');
  assert.equal(result.structural.revision, 'source-r1');
  assert.deepEqual(result.structural.data.imports, ['zod']);
  assert.deepEqual(result.structural.data.calls, ['db.update']);
  assert.deepEqual(result.structural.data.ast_grep_rule_ids, ['rule:function']);
  assert.equal(result.structural.data.lsp_references[0].resolution_status, 'resolved');
  assert.equal(result.structural.data.lsp_references[0].target_upstream_node_id, 'backend-node:2');
  assert.equal(result.structural.data.symbol_nominations.length, 2);
  assert.equal(result.structural.data.symbol_nominations[0].identity_status, 'nominated');
  assert.equal('stable_symbol_id' in result.structural.data.symbol_nominations[0], false);
  assert.equal(result.structural.data.reference_facts.length, 1);
  assert.equal(result.structural.data.reference_facts[0].reference_kind, 'call');
  assert.equal(result.structural.data.reference_facts[0].source_revision, 'source-r1');
  assert.equal(result.structural.data.symbols[0].name, 'saveCase');
  assert.equal('symbol_id' in result.structural.data.symbols[0], false);
  assert.equal(result.identity.tree_node_id, null);
  assert.equal(result.identity.symbol_version_id, null);
  assert.equal(verifyAcePacketV3(JSON.parse(JSON.stringify(result))).integrity.packet_checksum, result.integrity.packet_checksum);
});

test('empty structural evidence stays HINT; receipt/source/revision mismatches fail closed', async () => {
  const { packet } = await makePacket();
  const empty = makeStructural();
  const hint = attachStructuralEvidenceToAcePacketV3({ packet, structural: empty });
  assert.equal(hint.structural.status, 'HINT');
  assert.equal(hint.structural.data.provider_revision, null);
  assert.throws(() => attachStructuralEvidenceToAcePacketV3({ packet,
    structural: { ...empty, receipt: { ...empty.receipt, source_ref: 'src/other.ts' } } }), /LINEAGE_IDENTITY_MISMATCH/);
  const stale = makeStructural({ sourceRevision: 'source-old' });
  assert.throws(() => attachStructuralEvidenceToAcePacketV3({ packet, structural: stale }), /LINEAGE_IDENTITY_MISMATCH/);
  const provider = makeStructural({ chunks: [], observations: [{
    schema: 'atlas.ast-grep-observation.v1', observation_id: 'obs:provider-drift', rule_id: 'rule:function', source_ref: SRC,
    source_revision: 'source-r1', byte_start: 0, byte_end: 1, matched_text_hash: 'e'.repeat(64), captures: {},
    observation_kind: 'function', confidence: 1, extractor_revision: 'ast-grep-napi@old', canonical_authority: false,
  }] });
  assert.throws(() => attachStructuralEvidenceToAcePacketV3({ packet, structural: provider }), /PROVIDER_REVISION_MISMATCH/);
  const wrongNomination = { ...empty,
    receipt: { ...empty.receipt, symbol_nomination_count: 1 },
    symbol_nominations: [{
    schema: 'atlas.structural-symbol-nomination.v1', nomination_id: 'nom:wrong', symbol_key: 'sym:key',
    identity_status: 'nominated', role: 'definition', kind: 'function', language: 'typescript', name: 'other',
    qualified_name: 'other', source_ref: SRC, source_revision: 'source-old', workspace_revision: 'workspace-r1',
    upstream_file_id: 'file:1', upstream_node_id: 'node:1', upstream_chunk_id: 'chunk:1', byte_start: 0, byte_end: 1,
    declaration_hash: 'a'.repeat(64), extractor: 'treesitter_chunker', extractor_revision: 'treesitter-chunker@4.0.0',
  }] };
  assert.throws(() => attachStructuralEvidenceToAcePacketV3({ packet, structural: wrongNomination }), /NOMINATION_REVISION_MISMATCH/);
});
