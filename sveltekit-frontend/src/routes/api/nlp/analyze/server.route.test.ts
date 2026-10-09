// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHash } from 'node:crypto';

const groundedRequestText = 'export function hello() { return 1; }';
const groundedSourceRevision = `sha256:${createHash('sha256').update(groundedRequestText, 'utf8').digest('hex')}`;

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  createClient: vi.fn(),
  resolveGroundedSourceBinding: vi.fn(),
}));

vi.mock('$lib/server/nlp/miniforge-nlp-sidecar.js', () => ({
  MiniforgeNlpRuntimeBindingUnavailableError: class extends Error {
    readonly code = 'GROUNDED_SIDECAR_RUNTIME_BINDING_UNAVAILABLE';
  },
  createMiniforgeNlpSidecarClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('$lib/server/atlas/identity/grounded-extraction-source-binding-v1.js', () => ({
  GroundedExtractionSourceBindingError: class extends Error {},
  resolveGroundedExtractionSourceBindingV1: (...args: unknown[]) => mocks.resolveGroundedSourceBinding(...args),
}));

describe('/api/nlp/analyze', () => {
  beforeEach(() => {
    mocks.analyze.mockReset();
    mocks.createClient.mockReset();
    mocks.resolveGroundedSourceBinding.mockReset();
    mocks.resolveGroundedSourceBinding.mockResolvedValue({
      schema: 'atlas.grounded-extraction-source-binding-receipt.v1',
      status: 'VERIFIED_SOURCE_BINDING',
      canonicalPacketKey: 'packet:v2-fixture',
      storagePacketKey: 'packet:1',
      packetResolutionSource: 'V2_DIRECT',
      sourceRef: 'src/lib/example.ts',
      sourceRevision: groundedSourceRevision,
      workspaceRevision: 'sha256:' + '2'.repeat(64),
      sourceBindingChecksum: 'a'.repeat(64),
      submittedTextChecksum: groundedSourceRevision,
      byteLength: Buffer.byteLength(groundedRequestText, 'utf8'),
      checksum: 'b'.repeat(64),
      canonicalAuthority: false,
      writesPerformed: false,
    });
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
        classification_helper: true,
      },
      classification_proposal: {
        schema: 'atlas.nlp-classification-proposal.v1',
        sourceRevision: groundedSourceRevision,
        workspaceRevision: 'sha256:' + '2'.repeat(64),
        canonicalAuthority: false,
        writesPerformed: false,
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
        text: groundedRequestText,
        sourceType: 'codebase',
        extractionMode: 'full',
        documentId: 'doc-1',
        packetKey: 'packet-1',
        sourceRef: 'src/lib/example.ts',
        sourceRevision: groundedSourceRevision,
        workspaceRevision: 'sha256:' + '2'.repeat(64),
        passes: ['structural', 'semantic', 'sequence'],
        groundedExtractionRequired: true,
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.resolveGroundedSourceBinding).toHaveBeenCalledWith({
      packetKey: 'packet-1',
      sourceRef: 'src/lib/example.ts',
      sourceRevision: groundedSourceRevision,
      workspaceRevision: 'sha256:' + '2'.repeat(64),
      submittedText: groundedRequestText,
    });
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        text: groundedRequestText,
        passes: ['structural', 'semantic', 'sequence'],
        groundedExtractionRequired: true,
        packetKey: 'packet-1',
        sourceRef: 'src/lib/example.ts',
        sourceRevision: groundedSourceRevision,
        workspaceRevision: 'sha256:' + '2'.repeat(64),
      }),
    );

    const body = await response.json();
    expect(body.document_id).toBe('doc-1');
    expect(body.structured.pass_results).toHaveLength(1);
    expect(body.structured.control5.structural).toBe(true);
    expect(body.structured.experiment_feature_matrix.featureRevision).toBe('nlp-feature-compiler-v1');
    expect(body.structured.event_hypergraph.events).toHaveLength(1);
    expect(body.classification_proposal.schema).toBe('atlas.nlp-classification-proposal.v1');
    expect(body.classification_proposal.sourceRevision).toBe(groundedSourceRevision);
    expect(body.classification_proposal.canonicalAuthority).toBe(false);
    expect(body.grounded_source_binding.status).toBe('VERIFIED_SOURCE_BINDING');
  });

  it('rejects unbound or byte-mismatched grounded requests before invoking the sidecar', async () => {
    const { POST } = await import('./+server.js');
    const base = {
      text: groundedRequestText,
      sourceType: 'codebase',
      sourceRef: 'src/lib/example.ts',
      packetKey: 'packet-1',
      sourceRevision: groundedSourceRevision,
      workspaceRevision: 'sha256:' + '2'.repeat(64),
      groundedExtractionRequired: true,
    };
    const invalidBodies = [
      { ...base, packetKey: undefined },
      { ...base, sourceRevision: 'sha256:' + '1'.repeat(64) },
    ];

    for (const body of invalidBodies) {
      const request = new Request('http://localhost/api/nlp/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
      expect(response.status).toBe(400);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveGroundedSourceBinding).not.toHaveBeenCalled();
  });

  it('does not call the sidecar when canonical source binding resolution fails', async () => {
    mocks.resolveGroundedSourceBinding.mockRejectedValue(new Error('source binding unavailable'));
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/nlp/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: groundedRequestText,
        sourceType: 'codebase',
        packetKey: 'packet-1',
        sourceRef: 'src/lib/example.ts',
        sourceRevision: groundedSourceRevision,
        workspaceRevision: 'sha256:' + '2'.repeat(64),
        groundedExtractionRequired: true,
      }),
    });
    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('GROUNDED_SOURCE_BINDING_UNAVAILABLE');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('returns a stable unavailable response when the grounded runtime binding is missing', async () => {
    const { MiniforgeNlpRuntimeBindingUnavailableError } = await import('$lib/server/nlp/miniforge-nlp-sidecar.js');
    mocks.analyze.mockRejectedValue(new MiniforgeNlpRuntimeBindingUnavailableError());
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/nlp/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: groundedRequestText,
        sourceType: 'codebase',
        packetKey: 'packet-1',
        sourceRef: 'src/lib/example.ts',
        sourceRevision: groundedSourceRevision,
        workspaceRevision: 'sha256:' + '2'.repeat(64),
        groundedExtractionRequired: true,
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'GROUNDED_SIDECAR_RUNTIME_BINDING_UNAVAILABLE',
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });

  it.each(['entities', 'relationships', 'concepts', 'full'] as const)(
    'preserves the supported extraction mode %s',
    async (extractionMode) => {
      const { POST } = await import('./+server.js');
      const request = new Request('http://localhost/api/nlp/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'fixture text', extractionMode }),
      });

      const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);

      expect(response.status).toBe(200);
      expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({ extractionMode }));
    },
  );

  it('accepts the existing classify pass exposed by the sidecar contract', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/nlp/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'fixture text', passes: ['classify'] }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);

    expect(response.status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({ passes: ['classify'] }));
  });
});
