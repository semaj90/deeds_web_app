import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';

describe('classifyAtlasQuery', () => {
  it('classifies a bounded file create and asks for exact promotion', () => {
    const out = classifyAtlasQuery({ requestId: 'r1', query: 'Create src/lib/cache/foo.ts with method invalidate for Parent Atlas cache' });
    expect(out.operation).toBe('FILE_MUTATION');
    expect(out.mutationKind).toBe('CREATE');
    expect(out.targetHints).toContain('src/lib/cache/foo.ts');
    expect(out.retrievalNeeds.semantic).toBe(true);
    expect(out.exactPromotionRequired).toBe(true);
  });

  it('routes code-connection questions across cache, agent and ACE retrieval domains', () => {
    const out = classifyAtlasQuery({
      requestId: 'valkey-ace-connection',
      query: 'Find the code that connects Valkey caching to the ACE assembler and explain its behavior',
    });

    expect(out.operation).toBe('INSPECT');
    expect(out.requiresMutation).toBe(false);
    expect(out.exactPromotionRequired).toBe(false);
    expect(out.domains).toEqual(['ace', 'cache']);
    expect(out.retrievalNeeds).toEqual({ lexical: true, ast: true, semantic: true, graph: true });
  });

  it('recognizes agent and tool domains without granting mutation or authority', () => {
    const out = classifyAtlasQuery({ requestId: 'agent-tool-lookup', query: 'Inspect the MCP agent tool caller for Valkey cache behavior' });

    expect(out.domains).toEqual(['agent', 'cache']);
    expect(out.requiresMutation).toBe(false);
    expect(out.exactPromotionRequired).toBe(false);
    expect(out.retrievalNeeds.ast).toBe(true);
  });

  it('recognizes inflected cache terms and compact ContextManifest spelling', () => {
    const out = classifyAtlasQuery({
      requestId: 'context-manifest-cache',
      query: 'Explain caching for the ContextManifest assembler',
    });

    expect(out.domains).toEqual(['ace', 'cache']);
    expect(out.requiresMutation).toBe(false);
    expect(out.retrievalNeeds.ast).toBe(true);
  });

  it('emits bounded advisory package, ordered n-gram, and explicit repository-scope hints', () => {
    const input = {
      requestId: 'query-adaptive-drizzle',
      query: 'Find SvelteKit 2 route helpers using Drizzle ORM repo:sveltekit-frontend package:@acme/db',
      producerRevision: 'query-classifier-fixture-v1',
    };
    const first = classifyAtlasQuery(input);
    const second = classifyAtlasQuery(input);

    expect(first.exactTerms.slice(0, 4)).toEqual(['Find', 'SvelteKit', '2', 'route']);
    expect(first.ngrams).toContain('sveltekit 2');
    expect(first.packageCandidates).toEqual(['@acme/db', '@sveltejs/kit', 'drizzle-orm']);
    expect(first.repositoryScopeCandidates).toEqual(['sveltekit-frontend']);
    expect(first.checksum).toBe(second.checksum);
    expect(first.retrievalNeeds).toEqual(second.retrievalNeeds);
    expect(first.repositoryScopeCandidates).toHaveLength(1);
  });

  it('does not infer repository scope from ordinary path or repository prose', () => {
    const out = classifyAtlasQuery({
      requestId: 'unscoped-repository-prose',
      query: 'Find a SvelteKit route in the nested repository src/routes/server.ts',
    });

    expect(out.targetHints).toContain('src/routes/server.ts');
    expect(out.repositoryScopeCandidates).toEqual([]);
  });
});
