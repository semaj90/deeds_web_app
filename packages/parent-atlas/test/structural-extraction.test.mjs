import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileStructuralExtractionFabric,
} from '../dist/core/structural-extraction-fabric.js';
import {
  groundedLangExtractObservationSchema,
} from '../dist/core/structural-symbol.js';

const hash = 'a'.repeat(64);

function chunk(overrides = {}) {
  return {
    upstream_node_id: 'node-1',
    upstream_file_id: 'file-1',
    upstream_symbol_id: 'symbol-1',
    upstream_chunk_id: 'chunk-1',
    source_ref: 'src/routes/api/cases/[id]/+server.ts',
    language: 'typescript',
    node_type: 'function_declaration',
    kind: 'function_definition',
    symbol_name: 'PATCH',
    parent_route: ['module'],
    parent_context: 'module',
    byte_start: 0,
    byte_end: 64,
    start_line: 1,
    end_line: 3,
    content_hash: hash,
    calls: ['authorizeCase'],
    imports: [],
    exports: ['PATCH'],
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    source_ref: 'src/routes/api/cases/[id]/+server.ts',
    source_revision: 'src-rev-1',
    workspace_revision: 'ws-742',
    language: 'typescript',
    chunker_revision: 'treesitter-chunker:test',
    ast_grep_revision: 'ast-grep:test',
    langextract_revision: 'langextract:test',
    chunks: [chunk()],
    xref_edges: [],
    ast_grep_observations: [],
    langextract_observations: [],
    ...overrides,
  };
}

test('treesitter-chunker IDs remain upstream provenance and do not mint canonical Atlas IDs', () => {
  const result = compileStructuralExtractionFabric(baseInput({
    ast_grep_observations: [{
      observation_id: 'astg-1',
      rule_id: 'sveltekit-patch-route',
      source_ref: 'src/routes/api/cases/[id]/+server.ts',
      source_revision: 'src-rev-1',
      byte_start: 0,
      byte_end: 64,
      matched_text_hash: hash,
      captures: { handler: 'PATCH' },
      observation_kind: 'framework_route',
      confidence: 1,
      extractor_revision: 'ast-grep:test',
      canonical_authority: false,
    }],
    langextract_observations: [{
      extraction_id: 'lx-1',
      source_ref: 'src/routes/api/cases/[id]/+server.ts',
      source_revision: 'src-rev-1',
      extraction_class: 'authorization_behavior',
      extraction_text: 'PATCH handler authorizes case ownership',
      char_interval: { start_pos: 0, end_pos: 20 },
      alignment_status: 'match_exact',
      alignment_exact: true,
      attributes: { role: 'authorization' },
      confidence: 0.9,
      extractor_revision: 'langextract:test',
      canonical_authority: false,
    }],
  }), { producer_revision: 'atlas-test' });

  assert.equal(result.chunks[0].upstream_symbol_id, 'symbol-1');
  assert.equal(result.symbol_nominations[0].upstream_symbol_id, 'symbol-1');
  assert.equal(result.receipt.canonical_identity_created, false);
  assert.equal(result.ast_grep_observations[0].canonical_authority, false);
  assert.equal(result.langextract_observations[0].canonical_authority, false);
  assert.equal(result.langextract_observations[0].alignment_exact, true);
});

test('XRef edges keyed by native symbol_id resolve back to chunk node coordinates', () => {
  const result = compileStructuralExtractionFabric(baseInput({
    chunks: [
      chunk(),
      chunk({
        upstream_node_id: 'node-2',
        upstream_symbol_id: 'symbol-2',
        upstream_chunk_id: 'chunk-2',
        symbol_name: 'authorizeCase',
        byte_start: 65,
        byte_end: 110,
        start_line: 4,
        end_line: 6,
      }),
    ],
    xref_edges: [{
      src: 'symbol-1',
      dst: 'symbol-2',
      type: 'CALLS',
      weight: 1,
    }],
  }), { producer_revision: 'atlas-test' });

  assert.equal(result.reference_facts.length, 1);
  assert.equal(result.reference_facts[0].reference_kind, 'call');
  assert.equal(result.reference_facts[0].upstream_source_node_id, 'node-1');
  assert.equal(result.reference_facts[0].upstream_target_node_id, 'node-2');
  assert.equal(result.reference_facts[0].target_text, 'authorizeCase');
  assert.equal(result.reference_facts[0].captures.xref_source_key, 'symbol-1');
  assert.equal(result.reference_facts[0].captures.xref_target_key, 'symbol-2');
  assert.equal(result.receipt.unresolved_xref_source_count, 0);
});

test('LSP observations enrich matching XRefs without becoming canonical authority', () => {
  const result = compileStructuralExtractionFabric(baseInput({
    chunks: [chunk(), chunk({
      upstream_node_id: 'node-2', upstream_symbol_id: 'symbol-2', upstream_chunk_id: 'chunk-2',
      symbol_name: 'authorizeCase', byte_start: 65, byte_end: 110, start_line: 4, end_line: 6,
    })],
    xref_edges: [{ src: 'symbol-1', dst: 'symbol-2', type: 'CALLS', weight: 1 }],
    lsp_observations: [{
      observation_id: 'lsp:definition:1', reference_id: 'treesitter-chunker-xref:symbol-1:symbol-2:CALLS:src-rev-1',
      source_ref: 'src/routes/api/cases/[id]/+server.ts', source_tree_node_id: 'node-1', source_revision: 'src-rev-1', workspace_revision: 'ws-742',
      server_id: 'typescript-language-server', server_revision: 'tsls:test', project_revision: 'tsconfig:test', project_config_checksum: `sha256:${'a'.repeat(64)}`, capability_checksum: `sha256:${'b'.repeat(64)}`, position_encoding: 'utf-16', operation: 'DEFINITION',
      source_range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
      target_uri: 'file:///workspace/src/auth.ts', target_source_ref: 'src/auth.ts', target_range: null, target_text: 'authorizeCase',
      target_upstream_node_id: 'node-2', result_status: 'resolved', evidence_refs: ['evidence:lsp'], checksum: `sha256:${'c'.repeat(64)}`, canonical_authority: false,
    }],
  }), { producer_revision: 'atlas-test' });

  assert.equal(result.lsp_resolved_references.length, 1);
  assert.equal(result.lsp_resolved_references[0].resolution_status, 'resolved');
  assert.equal(result.lsp_resolved_references[0].canonical_authority, false);
  assert.equal(result.receipt.lsp_resolved_reference_count, 1);
});

test('unknown XRef source is observable instead of silently dropped', () => {
  const result = compileStructuralExtractionFabric(baseInput({
    xref_edges: [{
      src: 'missing-symbol',
      dst: 'symbol-1',
      type: 'CALLS',
      weight: 1,
    }],
  }), { producer_revision: 'atlas-test' });

  assert.equal(result.reference_facts.length, 0);
  assert.equal(result.receipt.unresolved_xref_source_count, 1);
  assert.equal(result.receipt.diagnostics.some((value) => value.includes('XREF_SOURCE_UNRESOLVED')), true);
});

test('LangExtract observation without a source char interval is rejected', () => {
  assert.throws(() => groundedLangExtractObservationSchema.parse({
    extraction_id: 'lx-ungrounded',
    source_ref: 'doc.md',
    source_revision: 'rev-1',
    extraction_class: 'requirement',
    extraction_text: 'unlocated inference',
    attributes: {},
    confidence: 0.5,
    extractor_revision: 'langextract:test',
    canonical_authority: false,
  }));
});
