// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('$lib/server/nlp/miniforge-nlp-sidecar.js', () => ({
  createMiniforgeNlpSidecarClient: (...args: unknown[]) => mocks.createClient(...args),
}));

describe('/api/nlp/analyze', () => {
  beforeEach(() => {
    mocks.analyze.mockReset();
    mocks.createClient.mockReset();
    mocks.createClient.mockReturnValue({
      analyze: mocks.analyze,
    });
    mocks.analyze.mockResolvedValue({
      document_id: 'doc-1',
      source_type: 'codebase',
      extraction_mode: 'full',
      entities: [],
      relationships: [],
      concepts: ['tree-sitter', 'semantic card'],
      chunks: [],
      features: [],
      metadata: { source: 'proof-fixture' },
      capabilities: {
        spacy: true,
        langextract: true,
        tree_sitter: true,
        ast_grep: true,
        torch: false,
      },
      pass_results: [
        {
          pass_name: 'structural',
          source: 'tree-sitter',
          status: 'succeeded',
          structured: { ast_units: 1 },
          evidence: [],
          warnings: [],
          features: { ast_unit_count: 1 },
        },
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
        packetKey: 'packet-1',
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
        events: [{ event_id: 'evt:1', event_type: 'semantic_annotation' }],
        ontology_event_tuples: [{ tuple_id: 'tuple:1' }],
        recommendation_feature_rows: [{ candidate_key: 'evt:1' }],
        recommendation_judgment: { candidate_key: 'evt:1', action: 'inspect' },
      },
      processing_time_ms: 7,
    });
  });

  it('returns structured compiler outputs from the sidecar', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/nlp/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'export function hello() { return 1; }',
        sourceType: 'codebase',
        extractionMode: 'full',
        documentId: 'doc-1',
        packetKey: 'packet-1',
        passes: ['structural', 'semantic', 'sequence'],
        groundedExtractionRequired: true,
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'export function hello() { return 1; }',
        passes: ['structural', 'semantic', 'sequence'],
        groundedExtractionRequired: true,
        packetKey: 'packet-1',
      }),
    );

    const body = await response.json();
    expect(body.document_id).toBe('doc-1');
    expect(body.structured.pass_results).toHaveLength(1);
    expect(body.structured.control5.structural).toBe(true);
    expect(body.structured.experiment_feature_matrix.featureRevision).toBe('nlp-feature-compiler-v1');
    expect(body.structured.event_hypergraph.events).toHaveLength(1);
  });
});
