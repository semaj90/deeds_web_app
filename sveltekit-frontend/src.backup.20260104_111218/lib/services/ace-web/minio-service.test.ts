/**
 * MinIO Service Tests
 * Tests for ACE Web Ingestion MinIO service
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MinIOService } from './minio-service.js';
;

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();

  return {
    S3Client: vi.fn(() => ({
      send: mockSend,
    })),
    PutObjectCommand: vi.fn((input) => ({ input })),
    GetObjectCommand: vi.fn((input) => ({ input })),
    HeadObjectCommand: vi.fn((input) => ({ input })),
    DeleteObjectCommand: vi.fn((input) => ({ input })),
  };
});

describe('MinIOService', () => {
  let service: MinIOService;
  let mockSend: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Get mock send function
    const { S3Client } = require('@aws-sdk/client-s3');
    const clientInstance = new S3Client({});
    mockSend = clientInstance.send;

    // Create service instance
    service = new MinIOService({
      endpoint: 'http://localhost:9000',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('storeRawHtml', () => {
    it('should store raw HTML successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const sourceId = 'test-source-123';
      const html = '<html><body>Test content</body></html>';

      const key = await service.storeRawHtml(sourceId, html);

      expect(key).toMatch(/^crawl\/test-source-123\/.*\.html$/);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid sourceId', async () => {
      await expect(service.storeRawHtml('', '<html></html>')).rejects.toThrow(
        'sourceId must be a non-empty string'
      );
    });

    it('should throw error for invalid html', async () => {
      await expect(service.storeRawHtml('test-id', '')).rejects.toThrow(
        'html must be a non-empty string'
      );
    });

    it('should retry on failure', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({});

      const key = await service.storeRawHtml('test-id', '<html></html>');

      expect(key).toBeDefined();
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('storeCleanMarkdown', () => {
    it('should store clean markdown successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const sourceId = 'test-source-456';
      const markdown = '# Test Document\n\nThis is test content.';

      const key = await service.storeCleanMarkdown(sourceId, markdown);

      expect(key).toMatch(/^crawl\/test-source-456\/.*\.md$/);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid sourceId', async () => {
      await expect(service.storeCleanMarkdown('', '# Test')).rejects.toThrow(
        'sourceId must be a non-empty string'
      );
    });

    it('should throw error for invalid markdown', async () => {
      await expect(service.storeCleanMarkdown('test-id', '')).rejects.toThrow(
        'markdown must be a non-empty string'
      );
    });
  });

  describe('storeSummary', () => {
    it('should store summary successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const docId = 'doc-123';
      const summary = {
        title: 'Test Document',
        summary: 'This is a test summary',
        entities: ['Entity1', 'Entity2'],
        relations: [{ src: 'Entity1', rel: 'relates_to', dst: 'Entity2' }],
      };

      const key = await service.storeSummary(docId, summary);

      expect(key).toBe('summary/doc-123.json');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid docId', async () => {
      await expect(service.storeSummary('', {})).rejects.toThrow(
        'docId must be a non-empty string'
      );
    });

    it('should throw error for invalid summary', async () => {
      await expect(service.storeSummary('doc-123', {} as any)).rejects.toThrow(
        'summary must be a non-empty object'
      );
    });
  });

  describe('storeChunks', () => {
    it('should store chunks successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const docId = 'doc-456';
      const chunks = [
        { text: 'Chunk 1 content', metadata: { index: 0 } },
        { text: 'Chunk 2 content', metadata: { index: 1 } },
      ];

      const key = await service.storeChunks(docId, chunks);

      expect(key).toBe('chunks/doc-456.jsonl');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid docId', async () => {
      await expect(service.storeChunks('', [{ text: 'test', metadata: {} }])).rejects.toThrow(
        'docId must be a non-empty string'
      );
    });

    it('should throw error for empty chunks array', async () => {
      await expect(service.storeChunks('doc-123', [])).rejects.toThrow(
        'Chunks must be a non-empty array'
      );
    });

    it('should throw error for non-array chunks', async () => {
      await expect(service.storeChunks('doc-123', 'not-an-array' as any)).rejects.toThrow(
        'Chunks must be a non-empty array'
      );
    });
  });

  describe('getObject', () => {
    it('should retrieve object successfully', async () => {
      const mockContent = 'Test content';
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToString: async () => mockContent,
        },
      });

      const content = await service.getObject('ace-web-raw', 'test-key');

      expect(content).toBe(mockContent);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid bucket', async () => {
      await expect(service.getObject('', 'test-key')).rejects.toThrow(
        'bucket must be a non-empty string'
      );
    });

    it('should throw error for invalid key', async () => {
      await expect(service.getObject('ace-web-raw', '')).rejects.toThrow(
        'key must be a non-empty string'
      );
    });

    it('should throw error for empty response body', async () => {
      mockSend.mockResolvedValueOnce({
        Body: null,
      });

      await expect(service.getObject('ace-web-raw', 'test-key')).rejects.toThrow(
        'Empty response body'
      );
    });
  });

  describe('objectExists', () => {
    it('should return true if object exists', async () => {
      mockSend.mockResolvedValueOnce({});

      const exists = await service.objectExists('ace-web-raw', 'test-key');

      expect(exists).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return false if object does not exist', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as any).name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const exists = await service.objectExists('ace-web-raw', 'test-key');

      expect(exists).toBe(false);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return false for 404 status code', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as any).$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValueOnce(notFoundError);

      const exists = await service.objectExists('ace-web-raw', 'test-key');

      expect(exists).toBe(false);
    });

    it('should throw error for other errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.objectExists('ace-web-raw', 'test-key')).rejects.toThrow(
        'Failed to check object existence'
      );
    });
  });

  describe('deleteObject', () => {
    it('should delete object successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.deleteObject('ace-web-raw', 'test-key');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid bucket', async () => {
      await expect(service.deleteObject('', 'test-key')).rejects.toThrow(
        'bucket must be a non-empty string'
      );
    });

    it('should throw error for invalid key', async () => {
      await expect(service.deleteObject('ace-web-raw', '')).rejects.toThrow(
        'key must be a non-empty string'
      );
    });
  });

  describe('storeSearchResults', () => {
    it('should store search results successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const queryHash = 'abc123';
      const results = {
        query: 'test query',
        urls: ['https://example.com/1', 'https://example.com/2'],
      };

      const key = await service.storeSearchResults(queryHash, results);

      expect(key).toMatch(/^search\/abc123\/.*\.json$/);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('storeErrorLog', () => {
    it('should store error log successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const sourceId = 'source-123';
      const errorType = 'crawl_error';
      const errorData = {
        error: 'Connection timeout',
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
      };

      const key = await service.storeErrorLog(sourceId, errorType, errorData);

      expect(key).toMatch(/^crawl_error\/\d{4}-\d{2}-\d{2}\/source-123-.*\.json$/);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBuckets', () => {
    it('should return bucket names', () => {
      const buckets = service.getBuckets();

      expect(buckets).toEqual({
        raw: 'ace-web-raw',
        derived: 'ace-web-derived',
        logs: 'ace-eval-logs',
      });
    });
  });

  describe('retry logic', () => {
    it('should retry up to 3 times on failure', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));

      await expect(service.storeRawHtml('test-id', '<html></html>')).rejects.toThrow();

      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('should succeed on second attempt', async () => {
      mockSend.mockRejectedValueOnce(new Error('Error 1')).mockResolvedValueOnce({});

      const key = await service.storeRawHtml('test-id', '<html></html>');

      expect(key).toBeDefined();
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
