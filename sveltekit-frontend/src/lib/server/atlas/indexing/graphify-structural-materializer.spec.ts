import { describe, expect, it } from 'vitest';
import { GraphifyStructuralMaterializer, type AstProvider } from './graphify-structural-materializer.js';

const input = {
  sourceRef: 'src/example.ts',
  sourceRevision: 'source-r1',
  language: 'typescript',
  source: 'export function example(){ return 1; }',
};

function provider(
  status: 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED',
  options: { native?: boolean } = {},
): AstProvider {
  return {
    async materialize() {
      if (status === 'FAILED') return { provider: 'treesitter-chunker-8095', status, diagnostics: ['sidecar unavailable'] };
      const native = options.native ?? true;
      return {
        provider: 'treesitter-chunker-8095',
        status,
        diagnostics: status === 'PROVEN' ? [] : ['Tree-sitter ERROR at line 1'],
        evidence: {
          schema: 'atlas.ast.evidence.v1', engine: 'treesitter-chunker', engine_version: 'test', language: 'typescript', file_path: input.sourceRef, source_revision: input.sourceRevision,
          chunks: [{
            upstream_chunk_id: native ? 'chunk-1' : undefined,
            upstream_node_id: native ? 'node-1' : undefined,
            upstream_file_id: native ? 'file-1' : undefined,
            upstream_symbol_id: native ? 'symbol-1' : undefined,
            node_type: 'function_declaration', kind: 'function', name: 'example',
            parent_route: ['module', 'example'], parent_context: 'module',
            start_byte: 0, end_byte: input.source.length, start_line: 1, start_column: 0, end_line: 1, end_column: input.source.length,
            calls: [], imports: [], exports: [],
          }], edges: [], diagnostics: status === 'PROVEN' ? [] : ['Tree-sitter ERROR at line 1'], syntax_status: status === 'PROVEN' ? 'CLEAN' : 'RECOVERED_WITH_ERRORS',
        },
      };
    },
  };
}

describe('GraphifyStructuralMaterializer', () => {
  it('normalizes 8095 evidence without assigning canonical persistence IDs', async () => {
    const result = await new GraphifyStructuralMaterializer(provider('PROVEN')).materialize(input);
    expect(result.status).toBe('PROVEN');
    expect(result.normalized?.symbols[0]?.symbolId).toBeNull();
    expect(result.normalized?.symbols[0]?.upstreamChunkId).toBe('chunk-1');
    expect(result.normalized?.symbols[0]?.upstreamNodeId).toBe('node-1');
    expect(result.persistence).toBe('NOT_ATTEMPTED');
    expect(result.fallback).toBe('NONE');
  });

  it('marks complete native provenance as eligible for GIS evaluation, not automatic promotion', async () => {
    const result = await new GraphifyStructuralMaterializer(provider('PROVEN', { native: true })).materialize(input);

    expect(result.provenanceReadiness.status).toBe('NATIVE_READY');
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(true);
    expect(result.provenanceReadiness.nativeNodeIds).toBe(1);
    expect(result.provenanceReadiness.nativeFileIds).toBe(1);
    expect(result.normalized?.symbols[0]?.symbolId).toBeNull();
  });

  it('blocks GIS promotion when only compatibility provenance is available', async () => {
    const result = await new GraphifyStructuralMaterializer(provider('PROVEN', { native: false })).materialize(input);

    expect(result.status).toBe('PROVEN');
    expect(result.provenanceReadiness.status).toBe('COMPATIBILITY_ONLY');
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(false);
    expect(result.diagnostics).toContain('STRUCTURAL_PROVENANCE_COMPATIBILITY_ONLY');
    expect(result.normalized?.symbols[0]?.symbolId).toBeNull();
  });

  it('preserves recovered diagnostics as observable status', async () => {
    const result = await new GraphifyStructuralMaterializer(provider('RECOVERED_WITH_ERRORS')).materialize(input);
    expect(result.status).toBe('RECOVERED_WITH_ERRORS');
    expect(result.diagnostics.some((value) => value.includes('Tree-sitter ERROR'))).toBe(true);
  });

  it('fails closed for sidecar failure without legacy fallback', async () => {
    const result = await new GraphifyStructuralMaterializer(provider('FAILED')).materialize(input);
    expect(result.status).toBe('FAILED');
    expect(result.normalized).toBeNull();
    expect(result.provenanceReadiness.status).toBe('NO_EVIDENCE');
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(false);
    expect(result.fallback).toBe('NONE');
  });
});
