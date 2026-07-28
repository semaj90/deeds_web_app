// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReadFileSync,
  mockGetFeatureDocumentEvidence,
  mockValidateExternalUrl,
  mockTracedQuery,
  mockBuildIndexedSourcePacket,
} = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockGetFeatureDocumentEvidence: vi.fn(),
  mockValidateExternalUrl: vi.fn(),
  mockTracedQuery: vi.fn(),
  mockBuildIndexedSourcePacket: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
  },
  readFileSync: mockReadFileSync,
}));

vi.mock('../../../src/lib/server/atlas/feature-document-evidence.js', async () => {
  const { z } = await import('zod');
  return {
    FeatureDocumentManifestSchema: z.object({
      schemaVersion: z.string().min(1).optional(),
      featureId: z.string().min(1),
      title: z.string().min(1).optional(),
      officialDocs: z.array(
        z.object({
          title: z.string().min(1),
          url: z.string().url(),
          sourceType: z.enum(['official_docs', 'github_repo', 'github_issue', 'web_page']).default('official_docs'),
          screenshotPaths: z.array(z.string()).default([]),
          filePaths: z.array(z.string()).default([]),
        })
      ).default([]),
      sources: z.array(
        z.object({
          sourceRef: z.string().min(1),
          sourceType: z.enum([
            'official_external',
            'first_party_repository',
            'local_spec',
            'api_schema',
            'runtime_report',
            'secondary_reference',
          ]),
          authorityClass: z.enum(['official', 'first_party', 'generated', 'secondary']),
          url: z.string().url().optional(),
          localPath: z.string().min(1).optional(),
          title: z.string().min(1).optional(),
          expectedContentHash: z.string().min(1).optional(),
        })
      ).default([]),
      storage: z.any().optional(),
    }),
    getFeatureDocumentEvidence: mockGetFeatureDocumentEvidence,
  };
});

vi.mock('$lib/server/security/url-validator.js', () => ({
  validateExternalUrl: mockValidateExternalUrl,
}));

vi.mock('$lib/server/db/client.js', () => ({
  tracedQuery: mockTracedQuery,
}));

vi.mock('$lib/server/enrichment/domain-classifier.js', () => ({
  CLASSIFIER_VERSION: 'domain-classifier-v1',
}));

vi.mock('$lib/server/ace/indexed-source-packet.js', () => ({
  buildIndexedSourcePacket: mockBuildIndexedSourcePacket,
}));

describe('materializeFeatureEvidenceTuples', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetFeatureDocumentEvidence.mockResolvedValue({
      featureId: 'trace-mcp',
      featureNotePath: 'C:/repo/sveltekit-frontend/docs/features/feature_trace-mcp.md',
      docsDirectory: 'C:/repo/sveltekit-frontend/docs/trace-mcp',
      manifestPath: 'C:/repo/sveltekit-frontend/docs/trace-mcp/manifest.json',
      manifestValid: true,
      artifacts: [
        {
          kind: 'file',
          path: 'src/mcp/trace-mcp-server.ts',
          sourceType: 'first_party_repository',
          trustTier: 'local_workspace',
          title: 'TRACE MCP server implementation',
        },
      ],
      counts: {
        officialDocs: 1,
        manifestSources: 1,
        firstPartySources: 1,
        screenshots: 0,
        files: 0,
        parentAtlasDocuments: 1,
        atlasFeatureMapRows: 1,
      },
      storage: {
        postgres: { documentsTable: 'library_documents', chunksTable: 'legal_chunks' },
        seaweedfs: { bucket: 'legal-documents' },
        qdrant: { collection: 'documents', embeddingDimension: 768 },
      },
      status: 'ATLAS_LINKED',
      warnings: ['atlas_feature_map_missing'],
      nextActions: [],
    });

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        featureId: 'trace-mcp',
        title: 'TRACE MCP / Agentic Tool Surface',
        officialDocs: [],
        sources: [
          {
            sourceRef: 'src/mcp/trace-mcp-server.ts',
            sourceType: 'first_party_repository',
            authorityClass: 'first_party',
            localPath: 'src/mcp/trace-mcp-server.ts',
            title: 'TRACE MCP server implementation',
          },
        ],
      })
    );

    mockValidateExternalUrl.mockReturnValue({ valid: true });
    mockBuildIndexedSourcePacket.mockResolvedValue({
      packet: {
        packet_id: 'ace-packet-trace-mcp',
      },
    });

    mockTracedQuery.mockImplementation((label: string) => {
      if (label.includes('linked_sources')) {
        return Promise.resolve({ rows: [] });
      }
      if (label.includes('packet_rows')) {
        return Promise.resolve({
          rows: [
            {
              source_ref: 'src/mcp/trace-mcp-server.ts',
              packet_key: 'packet:trace-mcp-server',
              tree_node_id: 'tree:trace-mcp-server',
              qdrant_point_id: 'qdrant-1',
              document_id: null,
              domain_class: 'retrieval',
            },
          ],
        });
      }
      if (label.includes('library_documents')) {
        return Promise.resolve({
          rows: [
            {
              id: 'document-trace-mcp',
              title: 'src/mcp/trace-mcp-server.ts',
              official_url: null,
            },
          ],
        });
      }
      if (label.includes('ontology')) {
        return Promise.resolve({
          rows: [
            {
              packet_key: 'packet:trace-mcp-server',
              ontology_ids: ['ontology:tooling'],
              concept_ids: ['concept:mcp'],
              ontology_version: 'ontology-v1',
            },
          ],
        });
      }
      if (label.includes('lexical')) {
        return Promise.resolve({
          rows: [
            {
              packet_key: 'packet:trace-mcp-server',
              lexical_features: ['trace', 'mcp', 'tool'],
              extractor_version: 'lex-v1',
            },
          ],
        });
      }
      if (label.includes('structural')) {
        return Promise.resolve({
          rows: [
            {
              packet_key: 'packet:trace-mcp-server',
              ast_symbols: ['registerTool'],
              parser_version: 'tree-sitter-v1',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it('materializes read-only evidence tuples aligned to canonical packet identity', async () => {
    const mod = await import('../../../src/lib/server/atlas/feature-doc-enrichment.js');
    const result = await mod.materializeFeatureEvidenceTuples('trace-mcp', { maxTuples: 4 });

    expect(result.plan.evidenceState).toBe('ACTIVE_DEGRADED');
    expect(result.tuples).toHaveLength(1);
    expect(result.tuples[0]).toEqual(
      expect.objectContaining({
        schemaVersion: 'feature-evidence-tuple.v1',
        featureId: 'trace-mcp',
        sourceRef: 'src/mcp/trace-mcp-server.ts',
        packetKey: 'packet:trace-mcp-server',
        treeNodeId: 'tree:trace-mcp-server',
        qdrantPointId: 'qdrant-1',
        domainClass: 'retrieval',
        ontologyIds: ['ontology:tooling'],
        conceptIds: ['concept:mcp'],
        astSymbols: ['registerTool'],
        lexicalFeatures: ['trace', 'mcp', 'tool'],
        ontologyLinkedTuples: expect.arrayContaining([
          expect.objectContaining({
            schemaVersion: 'ontology-linked-tuple.v1',
            sourceRef: 'src/mcp/trace-mcp-server.ts',
            label: 'retrieval',
            labelKind: 'ontology',
            labelSource: 'semantic_tagger',
            ontologyIds: ['ontology:tooling'],
            conceptIds: ['concept:mcp'],
          }),
        ]),
        evidenceState: 'ACTIVE_DEGRADED',
      })
    );
    expect(result.tuples[0]?.provenance.sourceTables).toEqual(
      expect.arrayContaining([
        'atlas_packets',
        'feature_ontology_tuples',
        'feature_lexical_facts',
        'feature_structural_facts',
      ])
    );
  });

  it('falls back to local first-party evidence when atlas packet rows are absent', async () => {
    mockTracedQuery.mockImplementation((label: string) => {
      if (label.includes('linked_sources')) return Promise.resolve({ rows: [] });
      if (label.includes('packet_rows')) return Promise.resolve({ rows: [] });
      if (label.includes('library_documents')) {
        return Promise.resolve({
          rows: [
            {
              id: 'document-trace-mcp',
              title: 'src/mcp/trace-mcp-server.ts',
              official_url: null,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const mod = await import('../../../src/lib/server/atlas/feature-doc-enrichment.js');
    const result = await mod.materializeFeatureEvidenceTuples('trace-mcp', { maxTuples: 4 });

    expect(result.tuples).toEqual([
      expect.objectContaining({
        sourceRef: 'src/mcp/trace-mcp-server.ts',
        packetKey: 'ace-packet-trace-mcp',
        documentId: 'document-trace-mcp',
      }),
    ]);
    expect(result.tuples[0]?.provenance.sourceTables).toEqual(
      expect.arrayContaining(['library_documents', 'ace_packet_runtime'])
    );
  });
});
