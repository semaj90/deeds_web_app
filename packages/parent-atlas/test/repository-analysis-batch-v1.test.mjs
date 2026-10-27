import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepositoryAnalysisBatchV1, repositoryAnalysisBatchV1Schema } from '../dist/core/repository-analysis-batch-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const inventoryDigest = `sha256:${'b'.repeat(64)}`;
const contentDigest = 'c'.repeat(64);

function file(sourceRef, sourceIdentityKey = `repo:root:${sourceRef}`) {
  return {
    schema: 'atlas.repository-analysis-file.v1',
    sourceIdentityKey,
    sourceRef,
    sourceRepositoryScope: 'repo:root',
    repositoryRelativePath: sourceRef,
    sourceRevision: `sha256:${contentDigest}`,
    contentDigest,
    byteLength: 42,
    languageObservation: { status: 'DETECTED', namespace: 'FILE_EXTENSION', label: '.ts', evidenceRef: 'inventory:language:1' },
    astEvidence: {
      schema: 'atlas.ast.evidence.v1', engine: 'tree-sitter', engine_version: '4.0.0', language: 'typescript',
      file_path: sourceRef, source_revision: `sha256:${contentDigest}`,
      chunks: [{ node_type: 'function_declaration', kind: 'function', start_byte: 0, end_byte: 42, start_line: 0, end_line: 2 }],
    },
  };
}

test('builds a proposal-only batch with deterministic source ordering', () => {
  const batch = buildRepositoryAnalysisBatchV1({
    workspaceRevision,
    sourceInventoryDigest: inventoryDigest,
    files: [file('src/z.ts'), file('src/a.ts')],
  });
  assert.deepEqual(batch.files.map((item) => item.sourceRef), ['src/a.ts', 'src/z.ts']);
  assert.equal(batch.mode, 'PROPOSAL_ONLY');
  assert.equal(batch.sourceInventoryStatus, 'INCREMENTAL_SOURCE_INVENTORY_PROPOSAL_NOT_ADMITTED');
  assert.equal(batch.canonicalAuthority, false);
  assert.equal(batch.writesPerformed, false);
});

test('rejects duplicate source refs and duplicate source identity keys', () => {
  assert.throws(() => buildRepositoryAnalysisBatchV1({ workspaceRevision, sourceInventoryDigest: inventoryDigest, files: [file('src/a.ts'), file('src/a.ts', 'repo:root:other')] }), /DUPLICATE_SOURCE_REF/);
  assert.throws(() => buildRepositoryAnalysisBatchV1({ workspaceRevision, sourceInventoryDigest: inventoryDigest, files: [file('src/a.ts', 'same'), file('src/b.ts', 'same')] }), /DUPLICATE_SOURCE_IDENTITY_KEY/);
});

test('rejects mismatched content revision and AST spans outside exact source bytes', () => {
  const badRevision = { ...file('src/a.ts'), sourceRevision: `sha256:${'d'.repeat(64)}` };
  assert.equal(repositoryAnalysisBatchV1Schema.safeParse({
    schema: 'atlas.repository-analysis-batch.v1', mode: 'PROPOSAL_ONLY', workspaceRevision,
    sourceInventorySchema: 'atlas.incremental-workspace-source-inventory.v1', sourceInventoryDigest: inventoryDigest,
    sourceInventoryStatus: 'INCREMENTAL_SOURCE_INVENTORY_PROPOSAL_NOT_ADMITTED', files: [badRevision], canonicalAuthority: false, writesPerformed: false,
  }).success, false);
  const badSpan = file('src/a.ts');
  badSpan.astEvidence.chunks[0].end_byte = 43;
  assert.throws(() => buildRepositoryAnalysisBatchV1({ workspaceRevision, sourceInventoryDigest: inventoryDigest, files: [badSpan] }), /AST_SPAN_EXCEEDS_SOURCE_BYTES/);
});

test('rejects language-label drift and mismatched chunker lineage', () => {
  const badLanguage = {
    ...file('src/a.ts'),
    languageResolution: {
      schema: 'atlas.language-label-resolution.v1', inputNamespace: 'FILE_EXTENSION', inputLabel: '.svelte', status: 'RESOLVED',
      targetNamespace: 'PARSER_GRAMMAR_ID', targetLabel: 'svelte', matchedBindings: 1, evidenceRefs: ['binding:1'], canonicalAuthority: false, writesPerformed: false,
    },
  };
  assert.throws(() => buildRepositoryAnalysisBatchV1({ workspaceRevision, sourceInventoryDigest: inventoryDigest, files: [badLanguage] }), /LANGUAGE_RESOLUTION_INPUT_MISMATCH/);
  const badChunker = { ...file('src/a.ts'), chunkerReceipt: {
    source_ref: 'src/other.ts', source_revision: `sha256:${contentDigest}`, chunk_count: 0, xref_edge_count: 0,
    native_node_id_count: 0, native_file_id_count: 0, native_chunk_id_count: 0, native_symbol_id_count: 0,
    compatibility_node_id_count: 0, compatibility_file_id_count: 0, compatibility_chunk_id_count: 0,
    strict_native_provenance: false, producer_revision: 'fixture:1',
  } };
  assert.throws(() => buildRepositoryAnalysisBatchV1({ workspaceRevision, sourceInventoryDigest: inventoryDigest, files: [badChunker] }), /CHUNKER_SOURCE_BINDING_MISMATCH/);
});
