import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildAstStructuralRevisionV1 } from './lib/ast-structural-revision-v1.mjs';

const input = {
  workspaceRevision: 'sha256:workspace-r1',
  sources: [
    { sourceRef: 'src/a.ts', sourceRevision: 'sha256:source-a-r1', contentDigest: 'source-a-r1' },
    { sourceRef: 'src/b.ts', sourceRevision: 'sha256:source-b-r1', contentDigest: 'source-b-r1' },
  ],
  parserName: 'tree-sitter-typescript', parserVersion: '0.23.2',
  materializerRevision: 'atlas-ast-materializer-r1', edgeExtractorRevision: 'atlas-ast-edges-r1',
  nodes: [
    { treeNodeId: 'tree:a', structuralKey: 'src/a.ts:function:main' },
    { treeNodeId: 'tree:b', structuralKey: 'src/b.ts:function:helper' },
  ],
  edges: [{ from: 'tree:a', type: 'CALLS', to: 'tree:b' }],
};

const first = buildAstStructuralRevisionV1(input);
const reordered = buildAstStructuralRevisionV1({ ...input, sources: [...input.sources].reverse(), nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse() });
assert.equal(first.astGraphRevision, reordered.astGraphRevision);
assert.equal(first.nodeTableChecksum, reordered.nodeTableChecksum);
assert.equal(first.edgeTableChecksum, reordered.edgeTableChecksum);
assert.notEqual(first.astGraphRevision, buildAstStructuralRevisionV1({ ...input, parserVersion: '0.23.3' }).astGraphRevision);
assert.notEqual(first.astGraphRevision, buildAstStructuralRevisionV1({ ...input, sources: input.sources.map((source) => source.sourceRef === 'src/a.ts' ? { ...source, sourceRevision: 'sha256:source-a-r2', contentDigest: 'source-a-r2' } : source) }).astGraphRevision);
assert.notEqual(first.astGraphRevision, buildAstStructuralRevisionV1({ ...input, edges: [...input.edges, { from: 'tree:b', type: 'REFERENCES', to: 'tree:a' }] }).astGraphRevision);
assert.notEqual(first.astGraphRevision, buildAstStructuralRevisionV1({ ...input, edgeExtractorRevision: 'atlas-ast-edges-r2' }).astGraphRevision);
assert.throws(() => buildAstStructuralRevisionV1({ ...input, sources: [{ sourceRef: 'src/a.ts' }] }), /AST_SOURCE_BINDING_REQUIRED/);

const report = {
  schema: 'atlas.ast-structural-revision-proof-receipt.v1', status: 'PROVEN_FIXTURE_ONLY', readOnly: true, canonicalAuthority: false, writesPerformed: false,
  checks: { reorderedInputInvariant: true, parserChangeChangesRevision: true, sourceRevisionChangeChangesRevision: true, astEdgeChangeChangesRevision: true, edgeExtractorChangeChangesRevision: true, incompleteSourceRejected: true },
  astGraphRevision: first.astGraphRevision, nodeTableChecksum: first.nodeTableChecksum, edgeTableChecksum: first.edgeTableChecksum,
  semantics: { sourceAuthority: 'sourceRevision/contentDigest', parserAuthority: 'parserName/parserVersion', materializerAuthority: 'materializerRevision/edgeExtractorRevision', separateFrom: 'relationshipGraphRevision' },
  notProven: ['live atlas_ast_nodes materialization', 'current source-lineage coverage', 'composite AST plus relationship projection', 'NetworkX/cuGraph production replay'],
};
const output = path.resolve('docs/reports/ast-structural-revision-v1.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath: output }, null, 2));

