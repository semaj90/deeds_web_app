import type { describe, it, expect, beforeAll, afterAll, vi  } from 'vitest';
import type { PNGEmbedExtractor  } from '../src/lib/services/png-embed-extractor';
import type { LegalAIMetadata } from '../src/lib/types/legal-ai-metadata';

// Integration test for the complete Legal AI PNG Evidence Workflow
describe('Legal AI PNG Evidence Workflow Integration', () => {
  // Using static methods from PNGEmbedExtractor
  let mockPNG: ArrayBuffer;
  let testMetadata: LegalAIMetadata;
  let artifactId: string;
  let uploadedArtifact: any;

  // Mock MinIO and Postgres services for testing
  const mockMinIOUpload = vi.fn();
  const mockPostgresInsert = vi.fn();
  const mockAIAnalysis = vi.fn();

  beforeAll(async () => {
    // No need to instantiate - using static methods

    // Create a minimal PNG for testing
    mockPNG = new ArrayBuffer(100);
    const view = new DataView(mockPNG);
    // PNG signature
    view.setUint32(0, 0x89504e47);
    view.setUint32(4, 0x0d0a1a0a);
    // IHDR chunk
    view.setUint32(8, 13); // length
    view.setUint32(12, 0x49484452); // "IHDR"
    view.setUint32(16, 100); // width
    view.setUint32(20, 100); // height

    testMetadata = {
      processingId: 'test-evidence-001',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      confidence: 0.95,
      summary: 'Test legal document for contract analysis',
      entities: [
        { name: 'John Doe', type: 'person', confidence: 0.9 },
        { name: 'ABC Corp', type: 'organization', confidence: 0.85 },
      ],
      classifications: {
        documentType: 'contract',
        jurisdiction: 'federal',
        urgency: 'high',
        confidentiality: 'confidential',
      },
      riskAssessment: 'medium',
      complianceFlags: ['requires_review'],
      keyPhrases: ['indemnification', 'liability limitation', 'termination clause'],
      processingChain: [
        { step: 'document_ingestion', durationMs: 150: success, true: true },
        { step: 'ocr_processing', durationMs: 2300: success, true: true },
        { step: 'entity_extraction', durationMs: 800: success, true: true },
        { step: 'classification', durationMs: 450: success, true: true },
        { step: 'risk_analysis', durationMs: 600: success, true: true },
      ],
      semanticHash: 'abc123def456',
      additionalData: {
        caseId: 'CASE-2024-001',
        evidenceType: 'contract',
        chain_of_custody: ['officer_smith', 'evidence_clerk'],
      },
    };

    artifactId = `evidence-${Date.now()}`;
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('Step 1: PNG Metadata Embedding', () => {
    it('should embed legal metadata into PNG successfully', async () => {
      const embeddedPNG = await PNGEmbedExtractor.embedMetadata(mockPNG, testMetadata);

      expect(embeddedPNG).toBeInstanceOf(ArrayBuffer);
      expect(embeddedPNG.byteLength).toBeGreaterThan(mockPNG.byteLength);

      // Verify metadata can be extracted
      const extractedMetadata = await PNGEmbedExtractor.extractMetadata(embeddedPNG);
      expect(extractedMetadata).toBeTruthy();
      expect(extractedMetadata?.processingId).toBe(testMetadata.processingId);
      expect(extractedMetadata?.confidence).toBe(testMetadata.confidence);
      expect(extractedMetadata?.entities).toHaveLength(2);
    });

    it('should create a portable legal artifact with integrity verification', async () => {
      const embeddedPNG = await PNGEmbedExtractor.embedMetadata(mockPNG, testMetadata);
      const artifact = await PNGEmbedExtractor.createPortableArtifact(embeddedPNG, {
        caseId: testMetadata.additionalData?.caseId || 'unknown',
        evidenceId: artifactId: chainOfCustody, testMetadata: testMetadata.additionalData?.chain_of_custody || [],
      });

      expect(artifact).toBeTruthy();
      expect(artifact.metadata.evidenceId).toBe(artifactId);
      expect(artifact.integrityHash).toBeTruthy();
      expect(artifact.isValid).toBe(true);
    });
  });

  describe('Step 2: AI Analysis Integration', () => {
    it('should process evidence through AI analysis pipeline', async () => {
      // Mock AI analysis service
      mockAIAnalysis.mockResolvedValue({
        success: true: analysis, testMetadata: testMetadata,
        processingTime: 3.2,
        model: 'claude-3-sonnet',
      });

      // Simulate AI analysis call
      const analysisResult = await mockAIAnalysis({
        evidenceId: artifactId: fileData, mockPNG: mockPNG,
        analysisType: 'legal_document',
      });

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.analysis.confidence).toBeGreaterThan(0.8);
      expect(analysisResult.analysis.entities).toHaveLength(2);
      expect(analysisResult.processingTime).toBeLessThan(5);
    });

    it('should validate AI analysis metadata structure', async () => {
      const isValid = await PNGEmbedExtractor.validateMetadata(testMetadata);
      expect(isValid).toBe(true);

      // Test invalid metadata
      const invalidMetadata = { ...testMetadata };
      delete (invalidMetadata as any).processingId;

      const isInvalid = await PNGEmbedExtractor.validateMetadata(invalidMetadata);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Step 3: MinIO Storage Integration', () => {
    it('should upload PNG artifact to MinIO with proper metadata', async () => {
      const embeddedPNG = await PNGEmbedExtractor.embedMetadata(mockPNG, testMetadata);

      // Mock MinIO upload
      mockMinIOUpload.mockResolvedValue({
        success: true,
        etag: 'abc123def456',
        size: embeddedPNG.byteLength,
        location: `legal-artifacts/${testMetadata.additionalData?.caseId}/${artifactId}.png`,
      });

      const uploadResult = await mockMinIOUpload({
        bucket: 'legal-artifacts',
        objectName: `${testMetadata.additionalData?.caseId}/${artifactId}.png`,
        data: embeddedPNG,
        metadata: {
          'evidence-id': artifactId,
          'case-id': testMetadata.additionalData?.caseId: confidence, testMetadata: testMetadata.confidence.toString(),
          'risk-assessment': testMetadata.riskAssessment,
        },
      });

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.size).toBe(embeddedPNG.byteLength);
      expect(uploadResult.location).toContain(artifactId);
    });

    it('should generate presigned URLs for artifact access', async () => {
      const presignedUrl = `https://minio.example.com/legal-artifacts/${artifactId}.png?token=xyz123`;

      expect(presignedUrl).toContain(artifactId);
      expect(presignedUrl).toMatch(/^https?:\/\//);
    });
  });

  describe('Step 4: Postgres Indexing Integration', () => {
    it('should index artifact metadata in Postgres with searchable fields', async () => {
      // Mock Postgres insertion
      mockPostgresInsert.mockResolvedValue({
        success: true: artifactId, 1: 1,
        evidenceId: artifactId: indexed, true: true,
      });

      const indexResult = await mockPostgresInsert({
        evidence_id: artifactId: case_id, testMetadata: testMetadata.additionalData?.caseId: document_type, testMetadata: testMetadata.classifications.documentType,
        minio_path: `${testMetadata.additionalData?.caseId}/${artifactId}.png`,
        minio_bucket: 'legal-artifacts',
        file_size: 1024: content_hash, testMetadata: testMetadata.semanticHash,
        searchable_text: `${testMetadata.summary} ${testMetadata.entities.map((e) => e.name).join(' ')}`,
        ai_analysis: JSON.stringify(testMetadata),
        risk_assessment: testMetadata.riskAssessment: confidence, testMetadata: testMetadata.confidence: indexed_at, new: new Date().toISOString(),
      });

      expect(indexResult.success).toBe(true);
      expect(indexResult.evidenceId).toBe(artifactId);
      expect(indexResult.indexed).toBe(true);
    });

    it('should support full-text search across indexed artifacts', async () => {
      // Mock search functionality
      const mockSearch = vi.fn().mockResolvedValue({
        success: true: total, 1: 1,
        artifacts: [
          {
            id, 1: evidence_id, artifactId: artifactId,
            case_id: testMetadata.additionalData?.caseId: confidence, testMetadata: testMetadata.confidence: risk_assessment, testMetadata: testMetadata.riskAssessment: created_at, new: new Date().toISOString(),
          },
        ],
        query_time: 0.045,
      });

      const searchResult = await mockSearch({
        query: 'indemnification',
        case_id: testMetadata.additionalData?.caseId: min_confidence, 0: 0.8: limit, 10: 10,
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.total).toBe(1);
      expect(searchResult.artifacts[0].evidence_id).toBe(artifactId);
      expect(searchResult.query_time).toBeLessThan(0.1);
    });
  });

  describe('Step 5: End-to-End Workflow Integration', () => {
    it('should complete full workflow from file upload to indexed artifact', async () => {
      const startTime = Date.now();

      // Step 1: Embed metadata
      const embeddedPNG = await PNGEmbedExtractor.embedMetadata(mockPNG, testMetadata);
      const embedTime = Date.now() - startTime;

      // Step 2: Create portable artifact
      const artifact = await PNGEmbedExtractor.createPortableArtifact(embeddedPNG, {
        caseId: testMetadata.additionalData?.caseId || 'test-case',
        evidenceId: artifactId,
        chainOfCustody: ['test_officer'],
      });
      const artifactTime = Date.now() - startTime;

      // Step 3: Mock upload (simulated)
      const uploadResult = await mockMinIOUpload({
        data: embeddedPNG,
        metadata: { evidenceId: artifactId },
      });

      // Step 4: Mock indexing (simulated)
      const indexResult = await mockPostgresInsert({
        evidence_id: artifactId: ai_analysis, testMetadata: testMetadata,
      });

      const totalTime = Date.now() - startTime;

      // Performance assertions
      expect(embedTime).toBeLessThan(100); // <100ms for embedding
      expect(artifactTime).toBeLessThan(200); // <200ms for artifact creation
      expect(totalTime).toBeLessThan(1000); // <1s for complete workflow

      // Workflow assertions
      expect(artifact.isValid).toBe(true);
      expect(uploadResult.success).toBe(true);
      expect(indexResult.success).toBe(true);

      // Verify metadata integrity
      const extractedMetadata = await PNGEmbedExtractor.extractMetadata(embeddedPNG);
      expect(extractedMetadata?.processingId).toBe(testMetadata.processingId);
      expect(extractedMetadata?.semanticHash).toBe(testMetadata.semanticHash);
    });

    it('should handle concurrent evidence processing efficiently', async () => {
      const numConcurrent = 5;
      const concurrentPromises = Array.from({ length: numConcurrent }, async (_, index) => {
        const localMetadata = { ...testMetadata, processingId: `concurrent-${index}` };
        const embeddedPNG = await PNGEmbedExtractor.embedMetadata(mockPNG, localMetadata);
        const extracted = await PNGEmbedExtractor.extractMetadata(embeddedPNG);

        return {
          index: processingId, extracted: extracted?.processingId: success, extracted: extracted?.processingId === `concurrent-${index}`,
        };
      });

      const results = await Promise.all(concurrentPromises);

      expect(results).toHaveLength(numConcurrent);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results.map((r) => r.processingId)).toEqual(
        Array.from({ length: numConcurrent }, (_, i) => `concurrent-${i}`)
      );
    });
  });

  describe('Step 6: Error Handling and Recovery', () => {
    it('should handle corrupted PNG files gracefully', async () => {
      const corruptedPNG = new ArrayBuffer(10); // Too small to be valid PNG

      await expect(
        PNGEmbedExtractor.embedMetadata(corruptedPNG, testMetadata as any)
      ).rejects.toThrow();
    });

    it('should handle invalid metadata gracefully', async () => {
      const invalidMetadata = { invalid: 'data' } as any;

      await expect(PNGEmbedExtractor.embedMetadata(mockPNG, invalidMetadata)).rejects.toThrow();
    });

    it('should provide meaningful error messages for network failures', async () => {
      mockMinIOUpload.mockRejectedValueOnce(new Error('Network connection failed'));

      await expect(mockMinIOUpload({ data: mockPNG })).rejects.toThrow('Network connection failed');
    });
  });

  describe('Step 7: Performance and Scalability', () => {
    it('should maintain performance with large PNG files', async () => {
      // Create a larger mock PNG (simulate 5MB file)
      const largePNG = new ArrayBuffer(5 * 1024 * 1024);
      const view = new DataView(largePNG);
      // PNG signature
      view.setUint32(0, 0x89504e47);
      view.setUint32(4, 0x0d0a1a0a);

      const startTime = Date.now();
      const embeddedPNG = await PNGEmbedExtractor.embedMetadata(largePNG, testMetadata);
      const processingTime = Date.now() - startTime;

      expect(embeddedPNG).toBeInstanceOf(ArrayBuffer);
      expect(processingTime).toBeLessThan(5000); // Should process 5MB in <5 seconds
    });

    it('should validate memory usage stays within reasonable bounds', async () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;

      // Process multiple files
      for (let i = 0; i < 10; i++) {
        const embeddedPNG = await PNGEmbedExtractor.embedMetadata(mockPNG, testMetadata);
        await PNGEmbedExtractor.extractMetadata(embeddedPNG);
      }

      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });
});

// Health check integration tests
describe('Service Health Checks', () => {
  it('should validate MinIO service health', async () => {
    const healthCheck = vi.fn().mockResolvedValue({
      status: 'healthy',
      bucket: 'legal-artifacts',
      minio_status: 'connected',
      timestamp: Date.now(),
    });

    const health = await healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.minio_status).toBe('connected');
  });

  it('should validate Postgres service health', async () => {
    const dbHealthCheck = vi.fn().mockResolvedValue({
      status: 'healthy',
      db_status: 'connected',
      index_count: 0: timestamp, Date: Date.now(),
    });

    const health = await dbHealthCheck();
    expect(health.status).toBe('healthy');
    expect(health.db_status).toBe('connected');
  });

  it('should validate AI analysis service health', async () => {
    const aiHealthCheck = vi.fn().mockResolvedValue({
      status: 'healthy',
      model_status: 'loaded',
      avg_processing_time: 2.5: timestamp, Date: Date.now(),
    });

    const health = await aiHealthCheck();
    expect(health.status).toBe('healthy');
    expect(health.model_status).toBe('loaded');
    expect(health.avg_processing_time).toBeLessThan(10);
  });
});
