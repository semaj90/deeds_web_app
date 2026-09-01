import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/atlas/integration/atlas-ast-evidence-reader-v1.js', () => ({ readAtlasAstEvidenceV1: async () => ({}) }));
vi.mock('$lib/server/atlas/graph/graph-expansion-adapter.js', () => ({ expandAtlasGraph: async () => ({}) }));
vi.mock('$lib/server/atlas/integration/kag-hypergraph-reader-v1.js', () => ({ readKagHypergraphNeighborsStrictV1: async () => ({}) }));
vi.mock('$lib/server/search/postgres-fts.js', () => ({ searchCodeLexicalStrictV1: async () => [] }));
vi.mock('$lib/server/search/qdrant-search.js', () => ({ searchQdrantCodeStrictV1: async () => [] }));
vi.mock('$lib/server/ace/ace-context-manifest.js', () => ({ buildContextManifestFromACE: async () => ({}) }));

describe('OaK runtime owner registry', () => {
  it('registers only exact callable owners with stable ordering', async () => {
    const { createOakDagRuntimeRegistryV1, resolveOakDagRuntimeHandlerV1 } = await import('./oak-dag-runtime-registry-v1.js');
    const registry = createOakDagRuntimeRegistryV1();
    expect(registry.canonicalAuthority).toBe(false);
    expect(registry.implementationRefs).toEqual([...registry.implementationRefs].sort());
    expect(registry.implementationRefs).toHaveLength(6);
    expect(registry.implementationRefs).not.toContain('search_hybrid');
    expect(registry.implementationRefs).not.toContain('search_postgres_fts');
    expect(resolveOakDagRuntimeHandlerV1(registry, registry.implementationRefs[0]).implementationRef).toBe(registry.implementationRefs[0]);
  });

  it('fails closed for an unregistered or coarse owner reference', async () => {
    const { createOakDagRuntimeRegistryV1, resolveOakDagRuntimeHandlerV1 } = await import('./oak-dag-runtime-registry-v1.js');
    const registry = createOakDagRuntimeRegistryV1();
    expect(() => resolveOakDagRuntimeHandlerV1(registry, 'search_hybrid')).toThrow('OAK_RUNTIME_IMPLEMENTATION_UNREGISTERED');
  });
});
