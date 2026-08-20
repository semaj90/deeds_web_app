import { describe, expect, it } from 'vitest';
import { compileGraphifyStructuralIntelligence } from './graphify-structural-intelligence-adapter.js';
import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';

const source = 'export function PATCH() { return authorizeCase(); }';

function materialization(status: 'PROVEN' | 'RECOVERED_WITH_ERRORS'): StructuralMaterializationResult {
  const nativeReady = status === 'PROVEN';
  return {
    sourceRef: 'src/routes/api/cases/[id]/+server.ts',
    sourceRevision: 'src-r1',
    provider: 'treesitter-chunker-8095',
    status,
    evidence: {
      schema: 'atlas.ast.evidence.v1',
      engine: 'treesitter-chunker',
      engine_version: 'test',
      language: 'typescript',
      file_path: 'src/routes/api/cases/[id]/+server.ts',
      source_revision: 'src-r1',
      chunks: [{
        upstream_node_id: 'node-patch',
        upstream_file_id: 'file-route',
        upstream_symbol_id: 'symbol-patch',
        upstream_chunk_id: 'chunk-patch',
        node_type: 'function_declaration',
        kind: 'function',
        name: 'PATCH',
        parent_route: ['module'],
        parent_context: 'module',
        start_byte: 0,
        end_byte: source.length,
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: source.length,
        calls: ['authorizeCase'],
        imports: [],
        exports: ['PATCH'],
      }],
      edges: [],
      diagnostics: status === 'PROVEN' ? [] : ['Tree-sitter ERROR at line 1'],
      syntax_status: status === 'PROVEN' ? 'CLEAN' : 'RECOVERED_WITH_ERRORS',
    },
    normalized: null,
    provenanceReadiness: {
      status: nativeReady ? 'NATIVE_READY' : 'NATIVE_RECOVERED',
      nativeNodeIds: 1,
      nativeFileIds: 1,
      nativeSymbolIds: 1,
      upstreamChunkIds: 1,
      symbolCount: 1,
      canonicalPromotionAllowed: nativeReady,
      reason: nativeReady ? 'native proven fixture' : 'recovered fixture',
    },
    diagnostics: status === 'PROVEN' ? [] : ['STRUCTURAL_PROVENANCE_RECOVERED_NOT_PROMOTABLE'],
    persistence: 'NOT_ATTEMPTED',
    fallback: 'NONE',
  };
}

const revisions = {
  chunker: 'chunker-test',
  astGrep: 'ast-grep-test',
  langExtract: 'langextract-test',
  adapter: 'adapter-test',
  fabric: 'fabric-test',
};

describe('Graphify structural intelligence adapter', () => {
  it('compiles native evidence + ast-grep + grounded LangExtract without creating canonical identity', () => {
    const result = compileGraphifyStructuralIntelligence({
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('PROVEN'),
      astGrepFeatures: [{
        type: 'ast_function',
        name: 'PATCH',
        description: 'function',
        source: 'ast-grep',
        rawText: source,
        lineNumber: 1,
        byteStart: 0,
        byteEnd: source.length,
        ruleId: 'function_declaration',
        captures: { name: 'PATCH' },
        confidence: 1,
      }],
      langExtractMetadata: {
        grounded_extractions: [{
          class: 'authorization_behavior',
          text: 'authorizeCase',
          char_interval: { start_pos: source.indexOf('authorizeCase'), end_pos: source.indexOf('authorizeCase') + 'authorizeCase'.length },
          alignment_status: 'match_exact',
          attributes: { role: 'authorization' },
        }],
      },
      revisions,
    });

    expect(result.receipt.status).toBe('COMPILED_NATIVE');
    expect(result.receipt.canonicalPromotionMayBeAttempted).toBe(true);
    expect(result.receipt.compatibilityNodeIdCount).toBe(0);
    expect(result.receipt.compatibilityFileIdCount).toBe(0);
    expect(result.receipt.compatibilityChunkIdCount).toBe(0);
    expect(result.receipt.astGrepObservationCount).toBe(1);
    expect(result.receipt.langExtractObservationCount).toBe(1);
    expect(result.receipt.canonicalIdentityCreated).toBe(false);
    expect(result.fabric?.symbol_nominations[0]?.upstream_symbol_id).toBe('symbol-patch');
    expect(result.fabric?.ast_grep_observations[0]?.upstream_node_id).toBe('node-patch');
  });

  it('compiles recovered evidence for search but blocks canonical promotion', () => {
    const result = compileGraphifyStructuralIntelligence({
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('RECOVERED_WITH_ERRORS'),
      revisions,
    });

    expect(result.receipt.status).toBe('COMPILED_NONPROMOTABLE');
    expect(result.receipt.canonicalPromotionMayBeAttempted).toBe(false);
    expect(result.receipt.provenanceStatus).toBe('NATIVE_RECOVERED');
    expect(result.fabric).not.toBeNull();
  });
});
