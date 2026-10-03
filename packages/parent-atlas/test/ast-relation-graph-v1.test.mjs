import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAstMiniRecordV1 } from '../dist/core/ast-mini-record-v1.js';
import { buildAstRelationGraphV1 } from '../dist/core/ast-relation-graph-v1.js';

const sha = (letter) => `sha256:${letter.repeat(64)}`;
const ws = sha('f');
function mini({ ref = 'src/a.ts', rev = sha('a'), id, tree = `tree-${id}` }) {
  return buildAstMiniRecordV1({ sourceRef: ref, sourceRevision: rev, workspaceRevision: ws,
    sourceContentDigest: rev, treeNodeId: tree, upstreamNodeId: id, nodeKind: 'function_declaration',
    qualifiedSymbol: id, startByte: 0, endByte: 20, startLine: 1, endLine: 2,
    producerName: 'tree-sitter', producerVersion: 'v1' });
}
function fact({ id, src, dst, ref = 'src/a.ts', rev = sha('a'), kind = 'call' }) {
  return {
    schema: 'atlas.structural-reference-fact.v1', reference_id: id, reference_kind: kind,
    source_ref: ref, source_revision: rev, workspace_revision: ws, upstream_source_node_id: src,
    upstream_target_node_id: dst, upstream_chunk_id: `chunk-${src}`, target_text: dst,
    resolution_status: 'unresolved', captures: {}, evidence_refs: [`span:${id}`],
    extractor: 'treesitter_chunker', extractor_revision: 'sha256:' + 'e'.repeat(64),
  };
}

test('resolves exact revision-qualified relation endpoints and allows cycles', () => {
  const nodes = [mini({ id: 'a' }), mini({ id: 'b', tree: 'tree-b' })];
  const references = [fact({ id: 'r1', src: 'a', dst: 'b' }), fact({ id: 'r2', src: 'b', dst: 'a' })];
  const graph = buildAstRelationGraphV1({ workspaceRevision: ws, graphProducerRevision: 'ast-graph:v1', nodes, references });
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.unresolved.length, 0);
  assert.equal(graph.canonicalAuthority, false);
});

test('rejects unresolved, ambiguous and stale source endpoints as edges', () => {
  const nodes = [mini({ id: 'a' }), mini({ id: 'a', tree: 'tree-a-duplicate' }), mini({ id: 'b', tree: 'tree-b' })];
  const references = [
    fact({ id: 'ambiguous', src: 'a', dst: 'b' }),
    fact({ id: 'missing-target', src: 'b', dst: 'absent' }),
    fact({ id: 'stale-source', src: 'b', dst: 'a', rev: sha('c') }),
  ];
  const graph = buildAstRelationGraphV1({ workspaceRevision: ws, graphProducerRevision: 'ast-graph:v1', nodes, references });
  assert.equal(graph.edges.length, 0);
  assert.deepEqual(graph.unresolved.map((item) => item.reason).sort(), [
    'SOURCE_NODE_AMBIGUOUS', 'SOURCE_REVISION_MISMATCH', 'TARGET_NODE_MISSING',
  ]);
});

test('is deterministic for input ordering and rejects mixed workspace nodes', () => {
  const a = mini({ id: 'a' });
  const b = mini({ id: 'b', tree: 'tree-b' });
  const refs = [fact({ id: 'r1', src: 'a', dst: 'b' }), fact({ id: 'r2', src: 'a', dst: 'b' })];
  const first = buildAstRelationGraphV1({ workspaceRevision: ws, graphProducerRevision: 'ast-graph:v1', nodes: [a, b], references: refs });
  const second = buildAstRelationGraphV1({ workspaceRevision: ws, graphProducerRevision: 'ast-graph:v1', nodes: [b, a], references: [...refs].reverse() });
  assert.equal(first.checksum, second.checksum);
  assert.deepEqual(first.edges[0].evidenceRefs, ['r1', 'r2', 'span:r1', 'span:r2']);
  const mixed = { ...b, identity: { ...b.identity, workspaceRevision: sha('d') } };
  assert.throws(() => buildAstRelationGraphV1({ workspaceRevision: ws, graphProducerRevision: 'ast-graph:v1', nodes: [a, mixed], references: [] }), /MIXED_WORKSPACE/);
});
