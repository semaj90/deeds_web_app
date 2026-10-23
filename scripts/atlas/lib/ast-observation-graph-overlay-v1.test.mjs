import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { addAstObservationOverlayV1, verifyAstSourceBindingReceiptV1 } from './ast-observation-graph-overlay-v1.mjs';
import { traverseDirectoryPackageGraphV1 } from './directory-package-graph-v1.mjs';

const observation = { source_ref: 'src/a.ts', source_revision: `sha256:${'a'.repeat(64)}`,
  workspace_revision: `sha256:${'b'.repeat(64)}`, tree_node_occurrence_id: `sha256:${'c'.repeat(64)}`,
  symbol_name: 'run', symbol_kind: 'function', signature: 'function run()', ast_kind: 'function_declaration',
  start_byte: 0, end_byte: 12, start_line: 1, end_line: 1, extractor: 'ast-grep',
  extractor_revision: '@ast-grep/napi@0.45.3', canonical_symbol_id: null, symbol_version_id: null, canonical_write: false };
const evidence = new Map([['src/a.ts', { sourceSha256: 'a'.repeat(64), workspaceRevision: `sha256:${'b'.repeat(64)}` }]]);

function bindingReceiptFor(sourceBytes, overrides = {}) {
  const sourceRef = 'src/a.ts';
  const sourceRevision = createHash('sha256').update(sourceBytes).digest('hex');
  const workspaceRevision = `sha256:${'b'.repeat(64)}`;
  const snapshotRevision = `sha256:${'d'.repeat(64)}`;
  const body = {
    schema: 'atlas.directory-intelligence.source-binding-readback.v1',
    status: 'EXACT_SOURCE_BINDINGS_READBACK_VERIFIED',
    sourceBindingOwner: 'public.atlas_workspace_source_bindings',
    queryMode: 'REPEATABLE_READ_READ_ONLY',
    workspaceRevision,
    inputSnapshotRevision: snapshotRevision,
    candidateCount: 1,
    exactBindingCount: 1,
    canonicalAuthority: false,
    writesPerformed: false,
    datastoreWrites: false,
    bindings: [{ sourceRef, sourceRevision: `sha256:${sourceRevision}`, workspaceRevision,
      contentDigest: sourceRevision, bindingChecksum: 'binding-checksum', producerRevision: 'test-producer@1',
      byteLength: sourceBytes.byteLength }],
    ...overrides,
  };
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
  const receiptSha256 = createHash('sha256').update(JSON.stringify(sort(body))).digest('hex');
  return { receipt: { ...body, receiptSha256 }, sourceRef, workspaceRevision, snapshotRevision, sourceRevision, sourceBytes };
}

test('verifies source-binding receipt against frozen AST bytes and revisions', () => {
  const setup = bindingReceiptFor(Buffer.from('export const a = 1;'));
  const sourceEvidence = new Map([[setup.sourceRef, { sourceSha256: setup.sourceRevision,
    workspaceRevision: setup.workspaceRevision, sourceBytes: setup.sourceBytes }]]);
  const result = verifyAstSourceBindingReceiptV1({ receipt: setup.receipt, sourceEvidence,
    workspaceRevision: setup.workspaceRevision, snapshotRevision: setup.snapshotRevision });
  assert.equal(result.status, 'SOURCE_BINDINGS_MATCH_AST_COHORT');
  assert.equal(result.exactBindingCount, 1);
  assert.equal(result.canonicalAuthority, false);
});

test('rejects missing, duplicate, mismatched, stale, or tampered source bindings', () => {
  const setup = bindingReceiptFor(Buffer.from('export const a = 1;'));
  const sourceEvidence = new Map([[setup.sourceRef, { sourceSha256: setup.sourceRevision,
    workspaceRevision: setup.workspaceRevision, sourceBytes: setup.sourceBytes }]]);
  const verify = (receipt = setup.receipt, evidence = sourceEvidence, workspace = setup.workspaceRevision,
    snapshot = setup.snapshotRevision) => verifyAstSourceBindingReceiptV1({ receipt, sourceEvidence: evidence,
    workspaceRevision: workspace, snapshotRevision: snapshot });
  assert.throws(() => verify({ ...setup.receipt, receiptSha256: '0'.repeat(64) }), /SOURCE_BINDING_RECEIPT_CHECKSUM_INVALID/);
  assert.throws(() => verify({ ...setup.receipt, inputSnapshotRevision: 'stale' }), /SOURCE_BINDING_RECEIPT_CHECKSUM_INVALID/);
  assert.throws(() => verify(setup.receipt, sourceEvidence, setup.workspaceRevision, 'stale'), /SOURCE_BINDING_RECEIPT_REVISION_MISMATCH/);
  assert.throws(() => verify({ ...setup.receipt, bindings: [] }), /SOURCE_BINDING_RECEIPT_CHECKSUM_INVALID/);
  const duplicate = bindingReceiptFor(setup.sourceBytes, { bindings: [...setup.receipt.bindings, ...setup.receipt.bindings], exactBindingCount: 2 });
  assert.throws(() => verify(duplicate.receipt), /SOURCE_BINDING_MISSING_OR_AMBIGUOUS/);
  const mismatchedBytes = Buffer.from('export const a = 2;');
  const mismatchedEvidence = new Map([[setup.sourceRef, { sourceSha256: createHash('sha256').update(mismatchedBytes).digest('hex'),
    workspaceRevision: setup.workspaceRevision, sourceBytes: mismatchedBytes }]]);
  assert.throws(() => verify(setup.receipt, mismatchedEvidence), /SOURCE_BINDING_SOURCE_REVISION_MISMATCH/);
  const wrongWorkspaceEvidence = new Map([[setup.sourceRef, { sourceSha256: setup.sourceRevision,
    workspaceRevision: 'another-workspace', sourceBytes: setup.sourceBytes }]]);
  assert.throws(() => verify(setup.receipt, wrongWorkspaceEvidence), /SOURCE_BINDING_AST_WORKSPACE_REVISION_MISMATCH/);
  assert.throws(() => verify(setup.receipt, new Map()), /SOURCE_BINDING_RECEIPT_COUNT_MISMATCH/);
});

test('adds an existing AST occurrence as noncanonical evidence and supports directory-to-observation traversal', () => {
  const result = addAstObservationOverlayV1({ graphNodes: [], graphEdges: [], directoryPaths: ['.', 'src'],
    observations: [observation], sourceEvidence: evidence });
  const traversal = traverseDirectoryPackageGraphV1({ nodes: result.nodes, edges: result.edges,
    startNodeKey: 'dir:src', maxHops: 2 });
  assert.deepEqual(traversal.reached.map(row => row.nodeType), ['FILE', 'AST_OBSERVATION']);
  assert.equal(result.nodes.find(row => row.nodeType === 'AST_OBSERVATION').identityStatus,
    'EXISTING_OCCURRENCE_ID_ONLY_NO_CANONICAL_SYMBOL_ID');
});

test('rejects canonical identity, source mismatch, missing parents, and repeated occurrence IDs', () => {
  const args = { graphNodes: [], graphEdges: [], directoryPaths: ['.', 'src'], observations: [observation], sourceEvidence: evidence };
  assert.throws(() => addAstObservationOverlayV1({ ...args, observations: [{ ...observation, canonical_symbol_id: 'made-up' }] }), /AST_CANONICAL_IDENTITY_NOT_ALLOWED/);
  assert.throws(() => addAstObservationOverlayV1({ ...args, sourceEvidence: new Map() }), /AST_SOURCE_REVISION_BINDING_MISMATCH/);
  assert.throws(() => addAstObservationOverlayV1({ ...args, directoryPaths: ['.'] }), /AST_PARENT_DIRECTORY_NOT_IN_FROZEN_SNAPSHOT/);
  assert.throws(() => addAstObservationOverlayV1({ ...args, observations: [observation, observation] }), /AST_OCCURRENCE_ID_MISSING_OR_DUPLICATE/);
});

test('admits only exact-span static import candidates between matching frozen source bindings', () => {
  const sourceBytes = Buffer.from('import "./target.js";\n');
  const targetBytes = Buffer.from('export {};\n');
  const sourceHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const sourceRevision = sourceHash(sourceBytes);
  const targetRevision = sourceHash(targetBytes);
  const workspace = `sha256:${'e'.repeat(64)}`;
  const boundEvidence = new Map([
    ['src/from.ts', { sourceSha256: sourceRevision, workspaceRevision: workspace, sourceBytes }],
    ['src/target.ts', { sourceSha256: targetRevision, workspaceRevision: workspace, sourceBytes: targetBytes }],
  ]);
  const makeObservation = (sourceRef, hash, occurrence) => ({ ...observation, source_ref: sourceRef,
    source_revision: `sha256:${hash}`, workspace_revision: workspace, tree_node_occurrence_id: `sha256:${occurrence.repeat(64)}` });
  const candidate = { sourcePath: 'src/from.ts', sourceSha256: sourceRevision, sourceRevision,
    workspaceRevision: workspace, targetSourcePath: 'src/target.ts', targetSourceSha256: targetRevision,
    targetWorkspaceRevision: workspace, importSpecifier: './target.js', importSpanText: '"./target.js"',
    relationKind: 'STATIC_IMPORT', typeOnlyStatus: 'NO_EXPLICIT_TYPE_MODIFIER',
    startByte: 7, endByte: 20, line1: 1, edgeType: 'IMPORTS_SOURCE_CANDIDATE',
    evidenceStatus: 'EXACT_SOURCE_SPAN_AND_REVISION; STATIC_MODULE_REFERENCE_ONLY; NONCANONICAL' };
  const result = addAstObservationOverlayV1({ graphNodes: [], graphEdges: [], directoryPaths: ['.', 'src'],
    observations: [makeObservation('src/from.ts', sourceRevision, 'f'), makeObservation('src/target.ts', targetRevision, 'a')],
    sourceEvidence: boundEvidence, importCandidates: [candidate] });
  const edge = result.edges.find(row => row.edgeType === 'IMPORTS_SOURCE_CANDIDATE');
  assert.equal(edge.evidenceStatus, candidate.evidenceStatus);
  assert.equal(edge.sourcePath, 'src/from.ts');
  assert.equal(edge.targetSourcePath, 'src/target.ts');
  assert.throws(() => addAstObservationOverlayV1({ graphNodes: [], graphEdges: [], directoryPaths: ['.', 'src'],
    observations: [makeObservation('src/from.ts', sourceRevision, 'f'), makeObservation('src/target.ts', targetRevision, 'a')],
    sourceEvidence: boundEvidence, importCandidates: [{ ...candidate, endByte: 500 }] }), /AST_IMPORT_SPAN_INVALID/);
  assert.throws(() => addAstObservationOverlayV1({ graphNodes: [], graphEdges: [], directoryPaths: ['.', 'src'],
    observations: [makeObservation('src/from.ts', sourceRevision, 'f'), makeObservation('src/target.ts', targetRevision, 'a')],
    sourceEvidence: boundEvidence, importCandidates: [{ ...candidate, targetWorkspaceRevision: 'other' }] }), /AST_IMPORT_SOURCE_BINDING_MISMATCH/);
  assert.throws(() => addAstObservationOverlayV1({ graphNodes: [], graphEdges: [], directoryPaths: ['.', 'src'],
    observations: [makeObservation('src/from.ts', sourceRevision, 'f'), makeObservation('src/target.ts', targetRevision, 'a')],
    sourceEvidence: boundEvidence, importCandidates: [{ ...candidate, relationKind: 'STATIC_REEXPORT' }] }), /AST_IMPORT_SOURCE_BINDING_MISMATCH/);
});
