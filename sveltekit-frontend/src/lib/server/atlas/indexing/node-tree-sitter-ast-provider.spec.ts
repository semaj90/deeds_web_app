import { describe, expect, it } from 'vitest';

import { GraphifyStructuralMaterializer } from './graphify-structural-materializer.js';
import { createNodeTreeSitterAstProvider } from './node-tree-sitter-ast-provider.js';

describe('Node Tree-sitter AstProvider challenger', () => {
  it('emits structural evidence without minting canonical/native provenance ids', async () => {
    const provider = createNodeTreeSitterAstProvider();
    const result = await provider.materialize({
      sourceRef: 'src/example.ts',
      sourceRevision: 'source-1',
      language: 'typescript',
      source: 'export function score(value: number) { return value + 1; }',
    });

    expect(result.provider).toBe('node-tree-sitter');
    expect(result.status).toBe('PROVEN');
    expect(result.evidence?.schema).toBe('atlas.ast.evidence.v1');
    expect(result.evidence?.chunks.some((chunk) => chunk.kind === 'FUNCTION' && chunk.name === 'score')).toBe(true);
    for (const chunk of result.evidence?.chunks ?? []) {
      expect(chunk.upstream_chunk_id).toBeUndefined();
      expect(chunk.upstream_node_id).toBeUndefined();
      expect(chunk.upstream_file_id).toBeUndefined();
      expect(chunk.upstream_symbol_id).toBeUndefined();
    }
  });

  it('remains non-promotable through Graphify until canonical provenance parity is accepted', async () => {
    const materializer = new GraphifyStructuralMaterializer(createNodeTreeSitterAstProvider());
    const result = await materializer.materialize({
      sourceRef: 'src/example.ts',
      sourceRevision: 'source-1',
      language: 'typescript',
      source: 'export const answer = 42;',
    });

    expect(result.provider).toBe('node-tree-sitter');
    expect(result.status).toBe('PROVEN');
    expect(result.provenanceReadiness.status).toBe('COMPATIBILITY_ONLY');
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(false);
    expect(result.persistence).toBe('NOT_ATTEMPTED');
  });

  it('reports malformed syntax as recovered evidence rather than throwing the whole provider call', async () => {
    const result = await createNodeTreeSitterAstProvider().materialize({
      sourceRef: 'src/broken.ts',
      sourceRevision: 'source-2',
      language: 'typescript',
      source: 'export function broken( {',
    });

    expect(result.provider).toBe('node-tree-sitter');
    expect(['RECOVERED_WITH_ERRORS', 'FAILED']).toContain(result.status);
    if (result.status === 'RECOVERED_WITH_ERRORS') {
      expect(result.diagnostics.some((diagnostic) => diagnostic.startsWith('TREE_SITTER_'))).toBe(true);
    }
import type { AstProvider } from './graphify-structural-materializer.js';
import { GraphifyStructuralMaterializer } from './graphify-structural-materializer.js';

const anchorOnly = (sourceRef: string, source: string) => ({
  sourceRef,
  sourceRevision: null,
  sourceVersionAnchor: 'content:fixture',
  sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY' as const,
  language: 'typescript',
  source,
});

describe('Node Tree-sitter AstProvider challenger boundary', () => {
  it('accepts a challenger through the shared AstProvider interface without granting canonical promotion', async () => {
    const challenger: AstProvider = {
      async materialize(input) {
        return {
          provider: 'node-tree-sitter-challenger',
          status: 'PROVEN',
          diagnostics: [],
          evidence: {
            schema: 'atlas.ast.evidence.v1',
            engine: 'node-tree-sitter-challenger',
            engine_version: 'fixture',
            language: 'typescript',
            file_path: input.sourceRef,
            source_revision: input.sourceRevision,
            chunks: [{
              node_type: 'function_declaration',
              kind: 'function',
              name: 'alpha',
              parent_route: [],
              parent_context: null,
              start_byte: 0,
              end_byte: input.source.length,
              start_line: 0,
              start_column: 0,
              end_line: 0,
              end_column: input.source.length,
              calls: [],
              imports: [],
              exports: [],
            }],
            edges: [],
            diagnostics: [],
            error_tag: null,
            syntax_status: 'CLEAN',
          },
        };
      },
    };

    const result = await new GraphifyStructuralMaterializer(challenger).materialize(
      anchorOnly('src/alpha.ts', 'export function alpha(){ return 1; }'),
    );

    expect(result.provider).toBe('node-tree-sitter-challenger');
    expect(result.status).toBe('PROVEN');
    expect(result.provenanceReadiness.status).toBe('COMPATIBILITY_ONLY');
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(false);
    expect(result.sourceRevision).toBeNull();
    expect(result.sourceRevisionAuthority).toBe('CONTENT_ANCHOR_ONLY');
    expect(result.parserSourceRevisionToken).toBe('anchor:content:fixture');
    expect(result.diagnostics).toContain('STRUCTURAL_PROVENANCE_COMPATIBILITY_ONLY');
    expect(result.diagnostics).toContain('SOURCE_REVISION_AUTHORITY_UNPROVEN');
    expect(result.persistence).toBe('NOT_ATTEMPTED');
  });

  it('does not silently fall back to 8095 when the challenger fails', async () => {
    const challenger: AstProvider = {
      async materialize() {
        return {
          provider: 'node-tree-sitter-challenger',
          status: 'FAILED',
          diagnostics: ['NODE_TREE_SITTER_CHALLENGER_FAILURE:fixture'],
          errorTag: 'NODE_TREE_SITTER_CHALLENGER_FAILURE',
        };
      },
    };

    const result = await new GraphifyStructuralMaterializer(challenger).materialize(
      anchorOnly('src/broken.ts', 'export function broken( {'),
    );

    expect(result.provider).toBe('node-tree-sitter-challenger');
    expect(result.status).toBe('FAILED');
    expect(result.evidence).toBeNull();
    expect(result.normalized).toBeNull();
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(false);
    expect(result.sourceRevision).toBeNull();
    expect(result.fallback).toBe('NONE');
  });
});
