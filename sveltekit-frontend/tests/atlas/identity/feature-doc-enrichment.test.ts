// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReadFileSync,
  mockGetFeatureDocumentEvidence,
  mockValidateExternalUrl,
  mockTracedQuery,
} = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockGetFeatureDocumentEvidence: vi.fn(),
  mockValidateExternalUrl: vi.fn(),
  mockTracedQuery: vi.fn(),
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
      storage: z.any().optional(),
      okf: z.object({
        keywordCorpus: z.object({
          corpusVersion: z.string(),
          keywords: z.array(z.string()),
          sourceTerms: z.array(z.string()),
        }),
        domainClassification: z.object({
          primaryDomain: z.string().nullable(),
          secondaryDomains: z.array(z.string()),
          confidence: z.number(),
          classifierVersion: z.string(),
          evidenceTerms: z.array(z.string()),
        }),
        semanticOntology: z.object({
          ontologyVersion: z.string().nullable(),
          ontologyIds: z.array(z.string()),
          conceptIds: z.array(z.string()),
          extractionLane: z.string(),
          authorityClass: z.enum(['official', 'first_party', 'generated', 'secondary']),
        }),
        nlp: z.object({
          langextractVersion: z.string().nullable(),
          mixedbreadModel: z.string().nullable(),
          middleware: z.array(z.string()),
          sourceEngines: z.array(z.string()),
        }),
      }).optional(),
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

describe('buildFeatureDocumentEnrichmentPlan', () => {
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
          kind: 'feature_note',
          path: 'C:/repo/sveltekit-frontend/docs/features/feature_trace-mcp.md',
          sourceType: 'local_feature_note',
          trustTier: 'local_workspace',
          title: 'feature_trace-mcp.md',
        },
        {
          kind: 'official_doc',
          url: 'https://modelcontextprotocol.io/introduction',
          title: 'MCP Intro',
          sourceType: 'web_page',
          trustTier: 'unverified',
        },
        {
          kind: 'official_doc',
          url: 'http://127.0.0.1/private',
          title: 'Blocked',
          sourceType: 'web_page',
          trustTier: 'unverified',
        },
        {
          kind: 'file',
          path: 'C:/repo/sveltekit-frontend/docs/trace-mcp/openapi.json',
          sourceType: 'document_file',
          trustTier: 'local_workspace',
          title: 'openapi.json',
        },
      ],
      counts: {
        officialDocs: 2,
        screenshots: 0,
        files: 1,
        parentAtlasDocuments: 1,
        atlasFeatureMapRows: 1,
      },
      storage: {
        postgres: { documentsTable: 'library_documents', chunksTable: 'legal_chunks' },
        seaweedfs: { bucket: 'legal-documents' },
        qdrant: { collection: 'documents', embeddingDimension: 768 },
      },
      status: 'ATLAS_LINKED',
      warnings: [],
      nextActions: [],
    });

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        featureId: 'trace-mcp',
        title: 'TRACE MCP / Agentic Tool Surface',
        officialDocs: [
          { title: 'MCP Intro', url: 'https://modelcontextprotocol.io/introduction', sourceType: 'web_page', screenshotPaths: [], filePaths: [] },
          { title: 'Blocked', url: 'http://127.0.0.1/private', sourceType: 'web_page', screenshotPaths: [], filePaths: [] },
        ],
        okf: {
          keywordCorpus: {
            corpusVersion: 'keyword-corpus-v1',
            keywords: ['trace', 'mcp', 'agentic', 'tool'],
            sourceTerms: ['trace-mcp', 'TRACE MCP / Agentic Tool Surface'],
          },
          domainClassification: {
            primaryDomain: 'retrieval',
            secondaryDomains: ['api'],
            confidence: 0.91,
            classifierVersion: 'domain-classifier-v1',
            evidenceTerms: ['retrieval', 'api'],
          },
          semanticOntology: {
            ontologyVersion: 'okf-ontology-v1',
            ontologyIds: ['ontology:domain:retrieval'],
            conceptIds: ['concept:keyword:trace'],
            extractionLane: 'ldr',
            authorityClass: 'generated',
          },
          nlp: {
            langextractVersion: 'langextract-v1',
            mixedbreadModel: 'mixedbread-ai/mxbai-rerank-base-v2',
            middleware: ['ldr', 'langextract', 'mixedbread'],
            sourceEngines: ['searxng', 'wikipedia'],
          },
        },
      })
    );

    mockValidateExternalUrl.mockImplementation((url: string) => {
      if (url.includes('127.0.0.1')) {
        return { valid: false, error: 'Local/private addresses are blocked' };
      }
      return { valid: true };
    });

    mockTracedQuery.mockResolvedValue({
      rows: [
        {
          source_ref: 'src/mcp/trace-mcp-server.ts',
          packet_key: 'packet:trace-mcp-server',
          tree_node_id: 'tree:trace-mcp-server',
          qdrant_point_id: 'qdrant-1',
          document_id: null,
        },
      ],
    });
  });

  it('builds a bounded, deterministic enrichment plan from feature evidence', async () => {
    const mod = await import('../../../src/lib/server/atlas/feature-doc-enrichment.js');
    const result = await mod.buildFeatureDocumentEnrichmentPlan('trace-mcp');

    expect(result.plan.schemaVersion).toBe('feature-doc-enrichment.v1');
    expect(result.plan.evidenceState).toBe('ACTIVE_VERIFIED');
    expect(result.plan.manifestContentHash).toHaveLength(64);
    expect(result.plan.sourceCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceRef: 'https://modelcontextprotocol.io/introduction',
          sourceType: 'official_doc',
          accepted: true,
        }),
        expect.objectContaining({
          sourceRef: 'http://127.0.0.1/private',
          sourceType: 'official_doc',
          accepted: false,
          rejectionReason: 'Local/private addresses are blocked',
        }),
        expect.objectContaining({
          sourceRef: 'C:/repo/sveltekit-frontend/docs/trace-mcp/openapi.json',
          sourceType: 'api_schema',
        }),
        expect.objectContaining({
          sourceRef: 'src/mcp/trace-mcp-server.ts',
          sourceType: 'code_source',
        }),
      ])
    );
    expect(result.plan.extractionPlan.apiSchemas).toBe(true);
    expect(result.plan.classifierPlan.classifierVersion).toBe('domain-classifier-v1');
    expect(result.plan.sourceCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceRef: 'okf:trace-mcp',
          sourceType: 'runtime_report',
          accepted: true,
        }),
      ])
    );
    expect(result.plan.nextCommands.some((value: string) => value.includes('feature-doc-enrichment.test.ts'))).toBe(true);
  });
});
