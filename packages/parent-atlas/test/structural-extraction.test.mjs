import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileStructuralExtractionFabric,
} from '../dist/core/structural-extraction-fabric.js';
import {
  groundedLangExtractObservationSchema,
} from '../dist/core/structural-symbol.js';

const hash = 'a'.repeat(64);

test('treesitter-chunker IDs remain upstream provenance and do not mint canonical Atlas IDs', () => {
  const result = compileStructuralExtractionFabric({
    source_ref: 'src/routes/api/cases/[id]/+server.ts',
    source_revision: 'src-rev-1',
    workspace_revision: 'ws-742',
    language: 'typescript',
    chunker_revision: 'treesitter-chunker:test',
    ast_grep_revision: 'ast-grep:test',
    langextract_revision: 'langextract:test',
    chunks: [{
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
    }],
    xref_edges: [],
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
      attributes: { role: 'authorization' },
      confidence: 0.9,
      extractor_revision: 'langextract:test',
      canonical_authority: false,
    }],
  }, { producer_revision: 'atlas-test' });

  assert.equal(result.chunks[0].upstream_symbol_id, 'symbol-1');
  assert.equal(result.symbol_nominations[0].upstream_symbol_id, 'symbol-1');
  assert.equal(result.receipt.canonical_identity_created, false);
  assert.equal(result.ast_grep_observations[0].canonical_authority, false);
  assert.equal(result.langextract_observations[0].canonical_authority, false);
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
