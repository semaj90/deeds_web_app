// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  createClient: vi.fn(),
  callOllamaChat: vi.fn(),
  bifrostChat: vi.fn(),
  traceLLM: vi.fn(),
  getJsonbDocument: vi.fn(),
  setCache: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    BIFROST_ENABLED: false,
    QDRANT_URL: 'http://127.0.0.1:6333',
    MINIFORGE_SIDECAR_URL: 'http://127.0.0.1:8095',
  },
}));

vi.mock('$lib/server/nlp/miniforge-nlp-sidecar.js', () => ({
  createMiniforgeNlpSidecarClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceLLM: (...args: unknown[]) => mocks.traceLLM(...args),
}));

vi.mock('$lib/server/ollama.js', () => ({
  callOllamaChat: (...args: unknown[]) => mocks.callOllamaChat(...args),
  bifrostChat: (...args: unknown[]) => mocks.bifrostChat(...args),
}));

vi.mock('$lib/server/cache.js', () => ({
  setCache: (...args: unknown[]) => mocks.setCache(...args),
  cognitiveCache: {
    getJsonbDocument: (...args: unknown[]) => mocks.getJsonbDocument(...args),
  },
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
  fastJsonParse: (value: string) => JSON.parse(value),
  isSimdJsonAvailable: () => true,
}));

vi.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => mocks.readFileSync(...args),
  statSync: (...args: unknown[]) => mocks.statSync(...args),
}));

describe('/api/codebase-index/analyze', () => {
  beforeEach(() => {
    mocks.analyze.mockReset();
    mocks.createClient.mockReset();
    mocks.callOllamaChat.mockReset();
    mocks.bifrostChat.mockReset();
    mocks.traceLLM.mockReset();
    mocks.getJsonbDocument.mockReset();
    mocks.setCache.mockReset();
    mocks.readFileSync.mockReset();
    mocks.statSync.mockReset();

    mocks.getJsonbDocument.mockResolvedValue(null);
    mocks.setCache.mockResolvedValue(undefined);
    mocks.readFileSync.mockReturnValue('export function hello() { return 1; }');
    mocks.statSync.mockReturnValue({ size: 38 } as any);
    mocks.callOllamaChat.mockResolvedValue(JSON.stringify({
      summary: 'Legacy summary',
      risks: [],
      dependencies: [],
      suggestions: [],
      couplingScore: 1,
      complexityScore: 1,
      healthGrade: 'A',
    }));
    mocks.traceLLM.mockImplementation(async (_label: unknown, _meta: unknown, fn: (gen: { end: (payload: unknown) => void }) => Promise<string>) => fn({ end: vi.fn() }));
    mocks.analyze.mockResolvedValue({
      document_id: 'src/lib/example.ts',
      source_type: 'codebase',
      extraction_mode: 'full',
      entities: [],
      relationships: [],
      concepts: ['ast-unit'],
      chunks: [],
      features: [],
      metadata: { source: 'sidecar-proof' },
      capabilities: { spacy: true, langextract: true, tree_sitter: true, ast_grep: true, torch: false },
      pass_results: [
        { pass_name: 'structural', source: 'tree-sitter', status: 'succeeded', evidence: [], warnings: [], features: { ast_unit_count: 1 } },
      ],
      control5: {
        sourceRef: 'src/lib/example.ts',
        structural: true,
        lexical: true,
        linguistic: true,
        semantic: true,
        grounded: false,
      },
      experiment_feature_matrix: {
        sourceRef: 'src/lib/example.ts',
        packetKey: 'src/lib/example.ts',
        featureRevision: 'nlp-feature-compiler-v1',
        graphRevision: 'graph-rev-1',
        candidateCount: 1,
        control5: {
          sourceRef: 'src/lib/example.ts',
          structural: true,
          lexical: true,
          linguistic: true,
          semantic: true,
          grounded: false,
        },
      },
      event_hypergraph: {
        events: [{ event_id: 'evt:1', event_type: 'call_execution' }],
        ontology_event_tuples: [{ tuple_id: 'tuple:1' }],
        recommendation_feature_rows: [{ candidate_key: 'evt:1' }],
        recommendation_judgment: { candidate_key: 'evt:1', action: 'inspect' },
      },
      processing_time_ms: 4,
    });
    mocks.createClient.mockReturnValue({ analyze: mocks.analyze });
  });

  it('threads the structured sidecar compiler into the existing file analysis request shape', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/codebase-index/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: 'src/lib/example.ts' }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('export function hello()'),
      sourceType: 'codebase',
      extractionMode: 'full',
      documentId: 'src/lib/example.ts',
      packetKey: 'src/lib/example.ts',
      groundedExtractionRequired: false,
    }));

    const body = await response.json();
    expect(body.filePath).toBe('src/lib/example.ts');
    expect(body.analysis.summary).toBe('Legacy summary');
    expect(body.structured.pass_results).toHaveLength(1);
    expect(body.structured.control5.structural).toBe(true);
    expect(body.structured.experiment_feature_matrix.featureRevision).toBe('nlp-feature-compiler-v1');
    expect(body.structured.event_hypergraph.events).toHaveLength(1);
  });
});
