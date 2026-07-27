// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFileSync, mockGetFeatureDocumentEvidence, mockValidateExternalUrl } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockGetFeatureDocumentEvidence: vi.fn(),
  mockValidateExternalUrl: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    existsSync: vi.fn((candidate: string) => !String(candidate).includes('missing')),
    statSync: vi.fn(() => ({ isFile: () => true })),
    realpathSync: { native: vi.fn((candidate: string) => String(candidate).replace(/\\/g, '/')) },
  },
  readFileSync: mockReadFileSync,
  existsSync: vi.fn((candidate: string) => !String(candidate).includes('missing')),
  statSync: vi.fn(() => ({ isFile: () => true })),
  realpathSync: { native: vi.fn((candidate: string) => String(candidate).replace(/\\/g, '/')) },
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
    FeatureDocumentManifestSourceSchema: z.object({
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
    }),
    getFeatureDocumentEvidence: mockGetFeatureDocumentEvidence,
  };
});

vi.mock('$lib/server/security/url-validator.js', () => ({
  validateExternalUrl: mockValidateExternalUrl,
}));

describe('buildFeatureDocumentIngestionPlan', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetFeatureDocumentEvidence.mockResolvedValue({
      featureId: 'trace-mcp',
      featureNotePath: 'C:/repo/sveltekit-frontend/docs/features/feature_trace-mcp.md',
      docsDirectory: 'C:/repo/sveltekit-frontend/docs/trace-mcp',
      manifestPath: 'C:/repo/sveltekit-frontend/docs/trace-mcp/manifest.json',
      manifestValid: true,
      artifacts: [],
      counts: {
        officialDocs: 3,
        manifestSources: 1,
        firstPartySources: 1,
        screenshots: 0,
        files: 0,
        parentAtlasDocuments: 0,
        atlasFeatureMapRows: 1,
      },
      storage: {
        postgres: { documentsTable: 'library_documents', chunksTable: 'legal_chunks' },
        seaweedfs: { bucket: 'legal-documents' },
        qdrant: { collection: 'documents', embeddingDimension: 768 },
      },
      status: 'READY_FOR_INGESTION',
      warnings: [],
      nextActions: [],
    });

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        featureId: 'trace-mcp',
        title: 'TRACE MCP / Agentic Tool Surface',
        officialDocs: [
          { title: 'MCP Intro', url: 'https://modelcontextprotocol.io/introduction', sourceType: 'web_page', screenshotPaths: [], filePaths: [] },
          { title: 'MCP TS SDK', url: 'https://github.com/modelcontextprotocol/typescript-sdk', sourceType: 'github_repo', screenshotPaths: [], filePaths: [] },
          { title: 'Bad', url: 'http://127.0.0.1/private', sourceType: 'web_page', screenshotPaths: [], filePaths: [] },
        ],
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

    mockValidateExternalUrl.mockImplementation((url: string) => {
      if (url.includes('127.0.0.1')) {
        return { valid: false, error: 'Local/private addresses are blocked' };
      }
      return { valid: true };
    });
  });

  it('builds a validated docs-ingestion plan from a feature manifest', async () => {
    const mod = await import('../../../src/lib/server/atlas/feature-doc-ingestion.js');
    const result = await mod.buildFeatureDocumentIngestionPlan('trace-mcp');

    expect(result.plan.featureId).toBe('trace-mcp');
    expect(result.plan.corpusType).toBe('docs');
    expect(result.plan.remoteCrawlSources).toHaveLength(2);
    expect(result.plan.localRepositorySources).toEqual([
      expect.objectContaining({
        sourceRef: 'src/mcp/trace-mcp-server.ts',
        ingestionAdapter: 'local_file',
        accepted: true,
      }),
    ]);
    expect(result.plan.rejectedSources).toEqual([
      expect.objectContaining({
        sourceRef: 'http://127.0.0.1/private',
        rejectionReason: 'Local/private addresses are blocked',
      }),
    ]);
    expect(result.plan.storage.documentsTable).toBe('library_documents');
    expect(result.plan.warnings).toContain('feature_document_sources_rejected');
  });
});
