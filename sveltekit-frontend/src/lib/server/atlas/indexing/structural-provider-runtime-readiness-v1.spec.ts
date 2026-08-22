import { describe, expect, it } from 'vitest';

import type { AstProviderResult } from './graphify-structural-materializer.js';
import { classifyStructuralProviderRuntimeReadiness } from './structural-provider-runtime-readiness-v1.js';

function result(overrides: Partial<AstProviderResult> = {}): AstProviderResult {
  return {
    provider: 'treesitter-chunker-8095',
    status: 'PROVEN',
    diagnostics: [],
    ...overrides,
  };
}

describe('classifyStructuralProviderRuntimeReadiness', () => {
  it('blocks a valid HTTP payload whose parser engine is unavailable', () => {
    const readiness = classifyStructuralProviderRuntimeReadiness(result({
      status: 'RECOVERED_WITH_ERRORS',
      diagnostics: ['treesitter-chunker is unavailable; no replacement evidence was produced'],
      errorTag: 'ChunkingError',
      evidence: {
        schema: 'atlas.ast.evidence.v1',
        engine: 'unavailable',
        engine_version: 'unknown',
        language: 'typescript',
        file_path: 'src/example.ts',
        source_revision: 'sha256:test',
        chunks: [],
        edges: [],
        diagnostics: ['treesitter-chunker is unavailable; no replacement evidence was produced'],
        error_tag: 'ChunkingError',
        syntax_status: 'RECOVERED_WITH_ERRORS',
      },
    }));

    expect(readiness).toEqual({
      schema: 'atlas.structural-provider-runtime-readiness.v1',
      available: false,
      reason: 'ENGINE_UNAVAILABLE',
    });
  });

  it('blocks transport failures', () => {
    expect(classifyStructuralProviderRuntimeReadiness(result({
      status: 'FAILED',
      diagnostics: ['fetch failed: ECONNREFUSED 127.0.0.1:8095'],
      errorTag: 'SIDECAR_UNAVAILABLE_OR_SCHEMA_FAILURE',
    })).reason).toBe('SIDECAR_TRANSPORT_UNAVAILABLE');
  });

  it('blocks missing parser packages', () => {
    expect(classifyStructuralProviderRuntimeReadiness(result({
      provider: 'node-tree-sitter-challenger',
      status: 'FAILED',
      diagnostics: ['Cannot find module tree-sitter-typescript'],
    })).reason).toBe('PARSER_PACKAGE_UNAVAILABLE');
  });

  it('does not block a recovered parse when the engine exists', () => {
    const readiness = classifyStructuralProviderRuntimeReadiness(result({
      status: 'RECOVERED_WITH_ERRORS',
      diagnostics: ['TREE_SITTER_ERROR:10-15'],
      evidence: {
        schema: 'atlas.ast.evidence.v1',
        engine: 'treesitter-chunker',
        engine_version: '2.2.23',
        language: 'typescript',
        file_path: 'src/example.ts',
        source_revision: 'sha256:test',
        chunks: [],
        edges: [],
        diagnostics: ['TREE_SITTER_ERROR:10-15'],
        syntax_status: 'RECOVERED_WITH_ERRORS',
      },
    }));

    expect(readiness.available).toBe(true);
    expect(readiness.reason).toBeNull();
  });
});
