import { describe, expect, it } from 'vitest';
import { GraphifyStructuralMaterializer, type AstProvider } from './graphify-structural-materializer.js';

const input = {
  sourceRef: 'src/example.ts',
  sourceRevision: 'source-r1',
  language: 'typescript',
  source: 'export function example(){ return 1; }',
};

function provider(status: 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED'): AstProvider {
  return {
    async materialize() {
      if (status === 'FAILED') return { provider: 'treesitter-chunker-8095', status, diagnostics: ['sidecar unavailable'] };
      return {
        provider: 'treesitter-chunker-8095',
        status,
        diagnostics: status === 'PROVEN' ? [] : ['Tree-sitter ERROR at line 1'],
        evidence: {
          schema: 'atlas.ast.evidence.v1', engine: 'treesitter-chunker', engine_version: 'test', language: 'typescript', file_path: input.sourceRef, source_revision: input.sourceRevision,
          chunks: [{ upstream_chunk_id: 'chunk-1', node_type: 'function_declaration', kind: 'function', name: 'example', start_byte: 0, end_byte: input.source.length, start_line: 1, start_column: 0, end_line: 1, end_column: input.source.length, calls: [], imports: [], exports: [] }], edges: [], diagnostics: status === 'PROVEN' ? [] : ['Tree-sitter ERROR at line 1'], syntax_status: status === 'PROVEN' ? 'CLEAN' : 'RECOVERED_WITH_ERRORS',
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
    expect(result.persistence).toBe('NOT_ATTEMPTED');
    expect(result.fallback).toBe('NONE');
  });

  it('preserves recovered diagnostics as observable status', async () => {
    const result = await new GraphifyStructuralMaterializer(provider('RECOVERED_WITH_ERRORS')).materialize(input);
    expect(result.status).toBe('RECOVERED_WITH_ERRORS');
    expect(result.diagnostics).toHaveLength(1);
  });

  it('fails closed for sidecar failure without legacy fallback', async () => {
    const result = await new GraphifyStructuralMaterializer(provider('FAILED')).materialize(input);
    expect(result.status).toBe('FAILED');
    expect(result.normalized).toBeNull();
    expect(result.fallback).toBe('NONE');
  });
});
