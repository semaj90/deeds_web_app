import { describe, expect, it } from 'vitest';
import type { AstProviderResult } from './graphify-structural-materializer.js';
import { classifyStructuralProviderRuntimeReadiness } from './structural-provider-runtime-readiness-v1.js';

function result(overrides: Partial<AstProviderResult> = {}): AstProviderResult {
  return { provider: 'treesitter-chunker-8095', status: 'PROVEN', diagnostics: [], ...overrides };
}

describe('classifyStructuralProviderRuntimeReadiness', () => {
  it('blocks a schema-valid payload whose parser engine is unavailable', () => {
    expect(classifyStructuralProviderRuntimeReadiness(result({
      status: 'RECOVERED_WITH_ERRORS',
      errorTag: 'ChunkingError',
      diagnostics: ['treesitter-chunker is unavailable; no replacement evidence was produced'],
      evidence: { engine: 'unavailable' } as AstProviderResult['evidence'],
    })).reason).toBe('ENGINE_UNAVAILABLE');
  });

  it('blocks transport failures', () => {
    expect(classifyStructuralProviderRuntimeReadiness(result({
      status: 'FAILED', diagnostics: ['fetch failed: ECONNREFUSED 127.0.0.1:8095'],
    })).reason).toBe('SIDECAR_TRANSPORT_UNAVAILABLE');
  });

  it('blocks missing parser packages', () => {
    expect(classifyStructuralProviderRuntimeReadiness(result({
      provider: 'node-tree-sitter-challenger', status: 'FAILED', diagnostics: ['Cannot find module tree-sitter-typescript'],
    })).reason).toBe('PARSER_PACKAGE_UNAVAILABLE');
  });

  it('allows a recovered parse when the engine exists', () => {
    const readiness = classifyStructuralProviderRuntimeReadiness(result({
      status: 'RECOVERED_WITH_ERRORS', diagnostics: ['TREE_SITTER_ERROR:10-15'],
      evidence: { engine: 'treesitter-chunker', engine_version: '2.2.23' } as AstProviderResult['evidence'],
    }));
    expect(readiness.available).toBe(true);
    expect(readiness.reason).toBeNull();
  });
});
