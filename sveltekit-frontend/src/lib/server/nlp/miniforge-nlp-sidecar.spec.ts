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
        return new Response(JSON.stringify({
          status: 'ok',
          model: 'miniforge-nlp-sidecar',
          capabilities: { spacy: true, spacy_pos: false },
          capabilityDetails: { spacy_model: { installed: false, loaded: false, pos_ready: false } },
        }), { status: 200 });
      }
      if (url.endsWith('/analyze')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.passes).toEqual(['structural', 'semantic', 'sequence']);
        expect(body.grounded_extraction_required).toBe(true);
        expect(body.source_revision).toBe('sha256:source-rev-1');
        expect(body.workspace_revision).toBe('sha256:workspace-rev-1');
        expect(body.source_namespace).toBe('src');
        expect(body.tree_node_id).toBe('tree:hello');
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
          capabilities: { spacy: true, langextract: true, tree_sitter: true, ast_grep: true, torch: false, classification_helper: true },
          classification_proposal: {
            schema: 'atlas.nlp-classification-proposal.v1',
            sourceRef: 'src/example.ts',
            sourceRevision: 'sha256:source-rev-1',
            workspaceRevision: 'sha256:workspace-rev-1',
            canonicalAuthority: false,
            writesPerformed: false,
          },
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
    expect(health.capabilities?.spacy).toBe(true);
    expect(health.capabilities?.spacy_pos).toBe(false);
    expect(health.capabilityDetails?.spacy_model?.pos_ready).toBe(false);

    const analysis = await client.analyze({
      text: 'export function hello() { return 1; }',
      sourceType: 'codebase',
      extractionMode: 'full',
      documentId: 'doc-1',
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source-rev-1',
      workspaceRevision: 'sha256:workspace-rev-1',
      sourceNamespace: 'src',
      treeNodeId: 'tree:hello',
      passes: ['structural', 'semantic', 'sequence'],
      groundedExtractionRequired: true,
    });

    expect(analysis.document_id).toBe('doc-1');
    expect(analysis.provider_revision).toContain('parent-atlas-nlp-sidecar:analysis-v1');
    expect(Array.isArray(analysis.entities)).toBe(true);
    expect(analysis.event_hypergraph?.events).toEqual([]);
    expect(analysis.event_hypergraph?.recommendation_feature_rows).toEqual([]);
    expect(analysis.capabilities.classification_helper).toBe(true);
    expect(analysis.classification_proposal?.sourceRevision).toBe('sha256:source-rev-1');
    expect(analysis.classification_proposal?.canonicalAuthority).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('normalizes sidecar pass evidence and compiles one noncanonical matrix only with explicit lineage', async () => {
    const now = '2026-09-23T12:00:00.000Z';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      document_id: 'doc-fixture',
      source_type: 'codebase',
      extraction_mode: 'full',
      entities: [], relationships: [], concepts: [], chunks: [], features: [],
      metadata: {},
      capabilities: { spacy: false, langextract: false, tree_sitter: true, ast_grep: true, torch: false },
      pass_results: [{
        request_id: 'request-fixture',
        packet_key: 'packet-fixture',
        source_ref: 'src/fixture.ts',
        source_revision: 'sha256:source-fixture',
        workspace_revision: 'sha256:workspace-fixture',
        family: 'structural',
        pass_name: 'treesitter_chunk',
        pass_revision: 'treesitter_chunk-v1',
        backend: 'tree-sitter',
        backend_version: '1',
        device: 'cpu',
        input_hash: 'sha256:input-fixture',
        output_hash: 'sha256:output-fixture',
        started_at: now,
        completed_at: now,
        status: 'succeeded',
        features: { ast_units: 2 },
        artifacts: {}, evidence: [], warnings: [],
      }],
      // A Python-side matrix is deliberately ignored; TS is the sole compiler.
      experiment_feature_matrix: { candidate_id: 'untrusted-python-matrix' },
      control5: { structural_confidence: 0.99 },
    }), { status: 200 }));

    const { createMiniforgeNlpSidecarClient } = await import('./miniforge-nlp-sidecar.js');
    const client = createMiniforgeNlpSidecarClient();
    const aligned = await client.analyze({
      text: 'export const fixture = 1;', documentId: 'request-fixture',
      packetKey: 'packet-fixture', sourceRef: 'src/fixture.ts',
      sourceRevision: 'sha256:source-fixture', workspaceRevision: 'sha256:workspace-fixture',
    });

    expect(aligned.pass_results).toHaveLength(1);
    expect(aligned.experiment_feature_matrix).toMatchObject({
      packetKey: 'packet-fixture', sourceRef: 'src/fixture.ts',
      sourceRevision: 'sha256:source-fixture', workspaceRevision: 'sha256:workspace-fixture',
      canonicalAuthority: false, ast_match: null,
    });
    expect(aligned.control5?.structural_confidence).toBeNull();
    expect(aligned.metadata.experiment_feature_matrix_status).toBe('COMPILED');

    const mismatched = await client.analyze({
      text: 'export const fixture = 1;', documentId: 'request-fixture',
      packetKey: 'packet-fixture', sourceRef: 'src/fixture.ts',
      sourceRevision: 'sha256:source-fixture', workspaceRevision: 'sha256:other-workspace',
    });
    expect(mismatched.experiment_feature_matrix).toBeNull();
    expect(mismatched.control5).toBeNull();
    expect(mismatched.metadata.experiment_feature_matrix_status).toBe('SKIPPED_LINEAGE_MISMATCH');

    const unqualified = await client.analyze({
      text: 'export const fixture = 1;', documentId: 'request-fixture',
      sourceRef: 'src/fixture.ts', sourceRevision: 'sha256:source-fixture',
      workspaceRevision: 'sha256:workspace-fixture',
    });
    expect(unqualified.experiment_feature_matrix).toBeNull();
    expect(unqualified.control5).toBeNull();
    expect(unqualified.metadata.experiment_feature_matrix_status)
      .toBe('SKIPPED_MISSING_EXPLICIT_LINEAGE');
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
