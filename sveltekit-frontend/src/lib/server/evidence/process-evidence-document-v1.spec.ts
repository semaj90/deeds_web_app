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
  // SEAWEED_EVIDENCE_BUCKET must match the fixture's object_bucket; the production check stays fail-closed.
  ENV: { LANGEXTRACT_ENABLED: true, EMBEDDING_STRICT_BASE_URL: 'http://embedding.invalid', SEAWEED_EVIDENCE_BUCKET: 'legal-evidence' },
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

describe('evidence text embedding lane', () => {
  it('uses EmbeddingGemma 2 when its model directory is configured, v1 otherwise, and rejects unknown lanes', async () => {
    const { resolveEvidenceTextEmbeddingLaneV1 } = await import('./process-evidence-document-v1.js');
    expect(resolveEvidenceTextEmbeddingLaneV1({ lane: undefined, modelDir: 'C:/models/eg2' })).toBe('embeddinggemma2_onnx');
    expect(resolveEvidenceTextEmbeddingLaneV1({ lane: undefined, modelDir: '  ' })).toBe('semantic_768_v1');
    expect(resolveEvidenceTextEmbeddingLaneV1({ lane: 'semantic_768_v1', modelDir: 'C:/models/eg2' })).toBe('semantic_768_v1');
    expect(() => resolveEvidenceTextEmbeddingLaneV1({ lane: 'ollama', modelDir: null })).toThrow('EVIDENCE_TEXT_EMBEDDING_LANE_INVALID');
  });

  it('persists an EmbeddingGemma 2 chunk as a document_chunk row bound to the case and source revision', async () => {
    const { createEmbeddingGemma2TextIndexerDependenciesV1 } = await import('./process-evidence-document-v1.js');
    const sha = (label: string) => 'sha256:' + createHash('sha256').update(label).digest('hex');
    const produced = {
      embedding: Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0)),
      model: 'fixture-eg2',
      modelArtifactSha256: sha('artifact'),
      modelRevision: 'rev',
      preprocessingRevision: 'atlas.embeddinggemma2.text-document-title-none-q8.v1',
      inputSha256: sha('chunk'),
      outputSha256: sha('output'),
      tokenCount: 12,
    };
    const embed = vi.fn(async () => produced);
    const persist = vi.fn(async () => ({ id: 'row', qdrantPointId: 'point', outputSha256: produced.outputSha256, sourceLocatorSha256: 'x' }));
    const database = {} as never;
    const deps = createEmbeddingGemma2TextIndexerDependenciesV1({ caseId: 'case-1', modelDir: 'C:/models/eg2', embed, persist, database });

    const out = await deps.embed('chunk text');
    expect(embed).toHaveBeenCalledWith({ text: 'chunk text', kind: 'document', modelDir: 'C:/models/eg2' });
    await deps.persist({
      evidenceId: 'evidence-1', sourceRevision: sha('source'), chunkIndex: 3, content: 'chunk text',
      embedding: out.vector, model: out.model, outputChecksum: out.outputChecksum, provenance: out.provenance,
      metadata: { startOffset: 10, endOffset: 20 },
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect((persist.mock.calls[0] as unknown[])[1]).toMatchObject({
      evidenceId: 'evidence-1',
      caseId: 'case-1',
      sourceRevision: sha('source'),
      modality: 'document_chunk',
      sourceLocator: { kind: 'text_chunk', chunkIndex: 3, startOffset: 10, endOffset: 20 },
      modelArtifactSha256: produced.modelArtifactSha256,
      outputSha256: produced.outputSha256,
      metadata: { content: 'chunk text' },
    });
  });

  it('fails closed without a case id or for a vector this run did not produce', async () => {
    const { createEmbeddingGemma2TextIndexerDependenciesV1 } = await import('./process-evidence-document-v1.js');
    const noCase = createEmbeddingGemma2TextIndexerDependenciesV1({ caseId: null, modelDir: 'C:/models/eg2', embed: vi.fn(), persist: vi.fn() });
    await expect(noCase.embed('text')).rejects.toThrow('EVIDENCE_TEXT_CASE_ID_REQUIRED');
    const persist = vi.fn();
    const deps = createEmbeddingGemma2TextIndexerDependenciesV1({ caseId: 'case-1', modelDir: 'C:/models/eg2', embed: vi.fn(), persist });
    await expect(deps.persist({
      evidenceId: 'e', sourceRevision: 's', chunkIndex: 0, content: 'c', embedding: [], model: 'm', outputChecksum: 'sha256:unknown',
      provenance: {} as never, metadata: {},
    })).rejects.toThrow('EVIDENCE_TEXT_EMBEDDING_NOT_PRODUCED_BY_THIS_RUN');
    expect(persist).not.toHaveBeenCalled();
  });
});
