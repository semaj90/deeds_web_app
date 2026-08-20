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
  });
});
