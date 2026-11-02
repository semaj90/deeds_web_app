import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSeaweedFile: vi.fn(),
  processDocument: vi.fn(),
  indexEvidenceDocumentCanonicalV1: vi.fn(),
  synthesizeEvidenceClaimsV1: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({ db: {} }));
vi.mock('$lib/server/env.server.js', () => ({
  ENV: { LANGEXTRACT_ENABLED: true, EMBEDDING_STRICT_BASE_URL: 'http://embedding.invalid' },
}));
vi.mock('$lib/server/seaweed-client.js', () => ({ getSeaweedFile: mocks.getSeaweedFile }));
vi.mock('$lib/server/document-processor.js', () => ({ processDocument: mocks.processDocument }));
vi.mock('./evidence-embedding-producer.js', () => ({ createEvidenceEmbeddingProducer: vi.fn(() => vi.fn()) }));
vi.mock('./evidence-vector-persistence-v1.js', () => ({ persistEvidenceVectorForProjectionV1: vi.fn() }));
vi.mock('./evidence-document-indexer-v1.js', () => ({ indexEvidenceDocumentCanonicalV1: mocks.indexEvidenceDocumentCanonicalV1 }));
vi.mock('./evidence-visual-analysis-v1.js', () => ({ analyzeEvidenceImageV1: vi.fn() }));
vi.mock('./synthesis/evidence-synthesis-v1.js', () => ({ synthesizeEvidenceClaimsV1: mocks.synthesizeEvidenceClaimsV1 }));

describe('processEvidenceDocumentCanonicalV1 synthesis integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSeaweedFile.mockResolvedValue(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
    mocks.processDocument.mockResolvedValue({ rawText: 'Extracted witness statement.', extractionMethod: 'fixture-pdf-text' });
    mocks.indexEvidenceDocumentCanonicalV1.mockResolvedValue({ chunkCount: 1, persistedCount: 1 });
    mocks.synthesizeEvidenceClaimsV1.mockResolvedValue({ schema: 'atlas.evidence-synthesis.v1', status: 'DISABLED', claims: [] });
  });

  it('passes the verified original bytes and extracted text to proposal synthesis', async () => {
    const originalBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    const sourceRevision = `sha256:${createHash('sha256').update(originalBytes).digest('hex')}`;
    const evidenceId = '22222222-2222-4222-8222-222222222222';
    const caseId = '33333333-3333-4333-8333-333333333333';
    mocks.getSeaweedFile.mockResolvedValueOnce(originalBytes);

    const { processEvidenceDocumentCanonicalV1 } = await import('./process-evidence-document-v1.js');
    const result = await processEvidenceDocumentCanonicalV1({
      evidenceId,
      text: 'queued placeholder only',
      contentType: 'application/pdf',
      metadata: {
        object_bucket: 'legal-evidence',
        object_name: 'evidence/5/case-file.pdf',
        source_revision: sourceRevision,
        caseId,
        fileName: 'case-file.pdf',
      },
    });

    expect(mocks.synthesizeEvidenceClaimsV1).toHaveBeenCalledWith({
      evidenceId,
      sourceRevision,
      extractedText: 'Extracted witness statement.',
      caseId,
      enabled: true,
    }, originalBytes);
    expect(result).toMatchObject({
      sourceRevision,
      synthesis: { schema: 'atlas.evidence-synthesis.v1', status: 'DISABLED', claims: [] },
    });
  });
});
