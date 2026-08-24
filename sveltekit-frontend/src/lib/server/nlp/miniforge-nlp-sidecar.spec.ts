// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    MINIFORGE_SIDECAR_URL: 'http://127.0.0.1:9997',
    LANGEXTRACT_URL: '',
  },
}));

describe('miniforge-nlp-sidecar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports a client factory', async () => {
    const mod = await import('./miniforge-nlp-sidecar.js');
    expect(typeof mod.createMiniforgeNlpSidecarClient).toBe('function');
  });

  it('builds health and analyze requests against the miniforge base url', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok', model: 'miniforge-nlp-sidecar', capabilities: { spacy: true } }), { status: 200 });
      }
      if (url.endsWith('/analyze')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.passes).toEqual(['structural', 'semantic', 'sequence']);
        expect(body.grounded_extraction_required).toBe(true);
        return new Response(JSON.stringify({
          document_id: 'doc-1',
          provider_revision: 'parent-atlas-nlp-sidecar:analysis-v1|ast-grep=0.44.0',
          source_type: 'codebase',
          extraction_mode: 'full',
          entities: [],
          relationships: [],
          concepts: ['tree-sitter'],
          chunks: [],
          features: [],
          metadata: {},
          capabilities: { spacy: true, langextract: true, tree_sitter: true, ast_grep: true, torch: false },
          pass_results: [],
          control5: null,
          experiment_feature_matrix: null,
          event_hypergraph: {
            events: [],
            ontology_event_tuples: [],
            event_breadth_features: null,
            recommendation_feature_rows: [],
            recommendation_judgment: null,
          },
          processing_time_ms: 5,
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { createMiniforgeNlpSidecarClient } = await import('./miniforge-nlp-sidecar.js');
    const client = createMiniforgeNlpSidecarClient();

    const health = await client.health();
    expect(health.ready).toBe(true);

    const analysis = await client.analyze({
      text: 'export function hello() { return 1; }',
      sourceType: 'codebase',
      extractionMode: 'full',
      documentId: 'doc-1',
      passes: ['structural', 'semantic', 'sequence'],
      groundedExtractionRequired: true,
    });

    expect(analysis.document_id).toBe('doc-1');
    expect(analysis.provider_revision).toContain('parent-atlas-nlp-sidecar:analysis-v1');
    expect(Array.isArray(analysis.entities)).toBe(true);
    expect(analysis.event_hypergraph?.events).toEqual([]);
    expect(analysis.event_hypergraph?.recommendation_feature_rows).toEqual([]);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('validates the atlas structural evidence endpoint without promoting upstream ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      expect(String(input)).toBe('http://127.0.0.1:9997/ast/chunk');
      return new Response(JSON.stringify({
        schema: 'atlas.ast.evidence.v1',
        engine: 'treesitter-chunker',
        engine_version: '0.1.0',
        language: 'typescript',
        file_path: 'src/example.ts',
        source_revision: 'rev-1',
        chunks: [{
          upstream_chunk_id: 'upstream-only',
          node_type: 'function_declaration',
          kind: 'function',
          name: 'hello',
          start_byte: 0,
          end_byte: 32,
          start_line: 1,
          start_column: 0,
          end_line: 1,
          end_column: 32,
          calls: [],
          imports: [],
          exports: [],
        }],
        edges: [{
          from_evidence_key: 'example:hello',
          to_evidence_key: 'world',
          type: 'CALLS',
          evidence_start_line: 1,
          evidence_start_column: 0,
          evidence_end_line: 1,
          evidence_end_column: 32,
          resolved: false,
          resolution: 'unresolved',
        }],
        diagnostics: [],
      }), { status: 200 });
    });

    const { createMiniforgeNlpSidecarClient } = await import('./miniforge-nlp-sidecar.js');
    const client = createMiniforgeNlpSidecarClient();
    const evidence = await client.astChunk({
      source: 'export function hello() { return 1; }',
      language: 'typescript',
      filePath: 'src/example.ts',
      sourceRevision: 'rev-1',
    });

    expect(evidence.schema).toBe('atlas.ast.evidence.v1');
    expect(evidence.chunks[0]?.upstream_chunk_id).toBe('upstream-only');
    expect(evidence.chunks[0]?.kind).toBe('function');
    expect(evidence.edges[0]?.type).toBe('CALLS');
    expect(evidence.edges[0]?.resolved).toBe(false);
  });
});
