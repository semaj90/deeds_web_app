import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileStructuralExtractionFabric } from '../dist/core/structural-extraction-fabric.js';
import { compileAstRelationGraphAdapterV1 } from '../dist/core/ast-relation-graph-adapter-v1.js';

const sha = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const shaBytes = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

function fabricFor(source, sourceRevision, workspaceRevision, nodePrefix = '') {
  const alphaStart = source.indexOf('function alpha');
  const betaStart = source.indexOf('function beta');
  const betaCallStart = source.indexOf('beta();');
  return compileStructuralExtractionFabric({
    source_ref: 'src/example.ts', source_revision: sourceRevision, workspace_revision: workspaceRevision,
    language: 'typescript', chunker_revision: 'chunker:v1', ast_grep_revision: 'ast-grep:v1',
    langextract_revision: 'langextract:v1',
    chunks: [
      { upstream_node_id: `${nodePrefix}alpha`, upstream_file_id: 'file-1', upstream_chunk_id: 'chunk-alpha',
        source_ref: 'src/example.ts', language: 'typescript', node_type: 'function_declaration', kind: 'function',
        symbol_name: 'alpha', parent_route: [], byte_start: alphaStart, byte_end: betaStart - 1, start_line: 0, end_line: 0,
        content_hash: shaBytes(source.slice(alphaStart, betaStart - 1)) },
      { upstream_node_id: `${nodePrefix}beta`, upstream_file_id: 'file-1', upstream_chunk_id: 'chunk-beta',
        source_ref: 'src/example.ts', language: 'typescript', node_type: 'function_declaration', kind: 'function',
        symbol_name: 'beta', parent_route: [], byte_start: betaStart, byte_end: source.length, start_line: 1, end_line: 1,
        content_hash: shaBytes(source.slice(betaStart)) },
    ],
    xref_edges: [{ src: `${nodePrefix}alpha`, dst: `${nodePrefix}beta`, type: 'CALLS' }],
  }, { producer_revision: 'fabric:v1' });
}

test('existing structural fabric wires to a byte- and revision-bound relation graph', () => {
  const source = 'function alpha(){ beta(); }\nfunction beta(){}';
  const sourceRevision = sha(source);
  const workspaceRevision = sha('workspace snapshot');
  const fabric = fabricFor(source, sourceRevision, workspaceRevision);
  const result = compileAstRelationGraphAdapterV1({
    fabric, sourceText: source, sourceRevision, workspaceRevision, graphProducerRevision: 'graph:v1',
  });

  assert.equal(result.status, 'COMPILED');
  assert.equal(result.nodes.length, 2);
  assert.equal(result.graph.edges.length, 1);
  assert.equal(result.graph.edges[0].relation, 'CALLS');
  assert.equal(result.graph.nodes[0].sourceContentDigest, sourceRevision);
  assert.equal(result.graph.canonicalAuthority, false);
});

test('legacy revisions and changed source bytes defer instead of guessing', () => {
  const source = 'function alpha(){ beta(); }\nfunction beta(){}';
  const workspaceRevision = sha('workspace snapshot');
  const legacy = compileAstRelationGraphAdapterV1({
    fabric: fabricFor(source, 'legacy-r1', workspaceRevision), sourceText: source,
    sourceRevision: 'legacy-r1', workspaceRevision, graphProducerRevision: 'graph:v1',
  });
  assert.equal(legacy.reason, 'SOURCE_REVISION_NOT_BYTE_DIGEST');

  const unproven = compileAstRelationGraphAdapterV1({
    fabric: fabricFor(source, sha(source), workspaceRevision), sourceText: source,
    sourceRevision: null, workspaceRevision, graphProducerRevision: 'graph:v1',
  });
  assert.equal(unproven.reason, 'SOURCE_REVISION_AUTHORITY_UNPROVEN');

  const mismatch = compileAstRelationGraphAdapterV1({
    fabric: fabricFor(source, sha(source), workspaceRevision), sourceText: `${source} `,
    sourceRevision: sha(source), workspaceRevision, graphProducerRevision: 'graph:v1',
  });
  assert.equal(mismatch.reason, 'SOURCE_REVISION_BYTES_MISMATCH');
});

test('compatibility node identifiers are not admitted as graph endpoints', () => {
  const source = 'function alpha(){ beta(); }\nfunction beta(){}';
  const sourceRevision = sha(source);
  const workspaceRevision = sha('workspace snapshot');
  const fabric = fabricFor(source, sourceRevision, workspaceRevision, 'compat:node:');
  const result = compileAstRelationGraphAdapterV1({
    fabric, sourceText: source, sourceRevision, workspaceRevision, graphProducerRevision: 'graph:v1',
  });
  assert.equal(result.reason, 'NON_NATIVE_NODE_LOCATOR');
});
