// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMkdir,
  mockWriteFile,
  mockBuildIndexedSourcePacket,
  mockSearchLdrHistory,
  mockLdrQuickSummary,
  mockStartLdrResearch,
  mockGetFeatureDocumentEvidence,
} = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockBuildIndexedSourcePacket: vi.fn(),
  mockSearchLdrHistory: vi.fn(),
  mockLdrQuickSummary: vi.fn(),
  mockStartLdrResearch: vi.fn(),
  mockGetFeatureDocumentEvidence: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

vi.mock('../../../src/lib/server/ace/indexed-source-packet.js', () => ({
  buildIndexedSourcePacket: mockBuildIndexedSourcePacket,
}));

vi.mock('../../../src/lib/server/analytics/ldr-client.js', () => ({
  searchLdrHistory: mockSearchLdrHistory,
  ldrQuickSummary: mockLdrQuickSummary,
  startLdrResearch: mockStartLdrResearch,
}));

vi.mock('../../../src/lib/server/atlas/feature-document-evidence.js', () => ({
  getFeatureDocumentEvidence: mockGetFeatureDocumentEvidence,
}));

describe('populateFeatureDocuments', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetFeatureDocumentEvidence
      .mockResolvedValueOnce({
        featureId: 'trace-mcp',
        featureNotePath: null,
        docsDirectory: null,
        manifestPath: null,
        manifestValid: false,
        artifacts: [],
        counts: {
          officialDocs: 0,
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
        status: 'DOCS_PENDING',
        warnings: ['feature_note_missing', 'manifest_missing'],
        nextActions: [],
      })
      .mockResolvedValueOnce({
        featureId: 'trace-mcp',
        featureNotePath: 'docs/features/feature_trace-mcp.md',
        docsDirectory: 'docs/trace-mcp',
        manifestPath: 'docs/trace-mcp/manifest.json',
        manifestValid: true,
        artifacts: [],
        counts: {
          officialDocs: 2,
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

    mockSearchLdrHistory.mockResolvedValue({
      taskId: 'ldr-1',
      query: 'trace-mcp TRACE MCP / Agentic Tool Surface model context protocol tool orchestration official API docs architecture integration',
      queryHash: 'hash-1',
      status: 'completed',
      summary: 'TRACE MCP exposes the read-only tool surface for Atlas graph, retrieval, and context workflows.',
      sources: [
        {
          title: 'Model Context Protocol Introduction',
          url: 'https://modelcontextprotocol.io/introduction',
          snippet: 'MCP overview',
        },
        {
          title: 'MCP TypeScript SDK',
          url: 'https://github.com/modelcontextprotocol/typescript-sdk',
          snippet: 'SDK repo',
        },
      ],
      completedAt: '2026-07-26T12:00:00.000Z',
    });
    mockLdrQuickSummary.mockResolvedValue(null);
    mockStartLdrResearch.mockResolvedValue(null);
    mockBuildIndexedSourcePacket.mockResolvedValue({
      mode: 'source-fallback',
      fromCache: false,
      normalizedSourceRef: 'docs/features/feature_trace-mcp.md',
      clusterId: null,
      laneIds: ['source-to-packet'],
      packet: {
        packet_id: 'packet-1',
        query: 'TRACE MCP / Agentic Tool Surface',
        query_hash: 'packet-hash',
        source_refs: ['docs/features/feature_trace-mcp.md'],
        feature_ids: ['trace-mcp'],
        lane_ids: ['source-to-packet'],
        cluster_id: null,
        som_cluster: null,
        ranked_cards: [],
      },
    });
  });

  it('writes a feature note and manifest from LDR evidence, then seeds a compact packet', async () => {
    const mod = await import('../../../src/lib/server/atlas/feature-doc-population.js');
    const result = await mod.populateFeatureDocuments({
      featureId: 'trace-mcp',
      forceRefresh: true,
    });

    expect(result.summaryMode).toBe('history');
    expect(result.sourcesFound).toBe(2);
    expect(result.packet.status).toBe('built');
    expect(result.evidenceAfter?.status).toBe('READY_FOR_INGESTION');

    const markdownWrite = mockWriteFile.mock.calls.find(([target]: [string]) => String(target).endsWith('.md'));
    expect(markdownWrite).toBeTruthy();
    expect(String(markdownWrite?.[1])).toContain('featureId: "trace-mcp"');
    expect(String(markdownWrite?.[1])).toContain('title: "TRACE MCP / Agentic Tool Surface"');
    expect(String(markdownWrite?.[1])).toContain('[Model Context Protocol Introduction](https://modelcontextprotocol.io/introduction)');

    const manifestWrite = mockWriteFile.mock.calls.find(([target]: [string]) => String(target).endsWith('manifest.json'));
    expect(manifestWrite).toBeTruthy();
    const manifest = JSON.parse(String(manifestWrite?.[1]));
    expect(manifest.featureId).toBe('trace-mcp');
    expect(manifest.officialDocs).toHaveLength(2);
    expect(manifest.officialDocs[0].sourceType).toBe('web_page');
    expect(manifest.officialDocs[1].sourceType).toBe('github_repo');

    expect(mockBuildIndexedSourcePacket).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: 'trace-mcp',
        forceRefresh: true,
      })
    );
  });
});
