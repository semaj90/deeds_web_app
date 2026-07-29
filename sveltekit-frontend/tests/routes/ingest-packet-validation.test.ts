// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '../../src/routes/api/ingest/+server';

describe('POST /api/ingest — Packet Validation', () => {
  let mockRequest: any;
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      locals: {
        user: {
          id: 'test-user-123'
        }
      }
    };
  });

  it('should return 401 when not authenticated', async () => {
    mockRequest = {
      headers: new Map([['content-type', 'application/json']]),
      json: vi.fn(async () => ({}))
    };
    mockContext.locals = {};

    const response = await POST({
      request: mockRequest,
      locals: mockContext.locals
    } as any);

    expect(response.status).toBe(401);
  });

  it('should accept valid IngestPacket and return 201', async () => {
    const validPacket = {
      packetKey: '550e8400-e29b-41d4-a716-446655440000',
      sourceRef: 'src/lib/server/auth.ts',
      documentId: '550e8400-e29b-41d4-a716-446655440001',
      documentVersion: 'abc123def456',
      contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chunk: {
        chunkId: '550e8400-e29b-41d4-a716-446655440002',
        ordinal: 0,
        text: 'Sample chunk text',
        tokenCount: 10,
        startOffset: 0,
        endOffset: 16,
        structuralPath: ['section', 'paragraph'],
        contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      classification: {
        domainClass: 'legal',
        confidence: 0.85,
        classifierVersion: 'xgboost-v2-20260720'
      },
      embeddingContract: {
        modelId: 'embeddinggemma',
        modelRevision: '20260720',
        nativeDimensions: 768,
        storedDimensions: 768,
        normalized: true,
        pooling: 'mean',
        projectionVersion: null,
        contractVersion: '1.0'
      }
    };

    mockRequest = {
      headers: new Map([['content-type', 'application/json']]),
      json: vi.fn(async () => validPacket)
    };

    const response = await POST({
      request: mockRequest,
      locals: mockContext.locals
    } as any);

    const body = JSON.parse(await response.text());
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.packet_key).toBe(validPacket.packetKey);
  });

  it.skip('should reject packet with invalid embedding contract', async () => {
    const invalidPacket = {
      packetKey: '550e8400-e29b-41d4-a716-446655440000',
      sourceRef: 'src/lib/server/auth.ts',
      documentId: '550e8400-e29b-41d4-a716-446655440001',
      documentVersion: 'abc123def456',
      contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chunk: {
        chunkId: '550e8400-e29b-41d4-a716-446655440002',
        ordinal: 0,
        text: 'Sample chunk text',
        tokenCount: 10,
        startOffset: 0,
        endOffset: 16,
        contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      classification: {
        domainClass: 'legal',
        confidence: 0.85,
        classifierVersion: 'xgboost-v2-20260720'
      },
      embeddingContract: {
        modelId: 'embeddinggemma',
        modelRevision: '20260720',
        nativeDimensions: 0, // Invalid: must be positive
        storedDimensions: 768,
        normalized: true,
        pooling: 'mean',
        projectionVersion: null,
        contractVersion: '1.0'
      }
    };

    mockRequest = {
      headers: new Map([['content-type', 'application/json']]),
      json: vi.fn(async () => invalidPacket)
    };

    const response = await POST({
      request: mockRequest,
      locals: mockContext.locals
    } as any);

    expect(response.status).toBe(400);
    const body = JSON.parse(await response.text());
    expect(body.error).toMatch(/invalid|validation|contract/i);
  });

  it.skip('should reject packet with invalid chunk identity', async () => {
    const invalidPacket = {
      packetKey: '550e8400-e29b-41d4-a716-446655440000',
      sourceRef: 'src/lib/server/auth.ts',
      documentId: '550e8400-e29b-41d4-a716-446655440001',
      documentVersion: 'abc123def456',
      contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chunk: {
        chunkId: 'not-a-uuid', // Invalid: must be UUID
        ordinal: 0,
        text: 'Sample chunk text',
        tokenCount: 10,
        startOffset: 0,
        endOffset: 16,
        contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      classification: {
        domainClass: 'legal',
        confidence: 0.85,
        classifierVersion: 'xgboost-v2-20260720'
      },
      embeddingContract: {
        modelId: 'embeddinggemma',
        modelRevision: '20260720',
        nativeDimensions: 768,
        storedDimensions: 768,
        normalized: true,
        pooling: 'mean',
        projectionVersion: null,
        contractVersion: '1.0'
      }
    };

    mockRequest = {
      headers: new Map([['content-type', 'application/json']]),
      json: vi.fn(async () => invalidPacket)
    };

    const response = await POST({
      request: mockRequest,
      locals: mockContext.locals
    } as any);

    expect(response.status).toBe(400);
  });

  it('should fallback to generic schema for URL/path ingestion', async () => {
    const genericRequest = {
      url: 'https://example.com/document.pdf',
      path: 'some/file/path'
    };

    mockRequest = {
      headers: new Map([['content-type', 'application/json']]),
      json: vi.fn(async () => genericRequest)
    };

    const response = await POST({
      request: mockRequest,
      locals: mockContext.locals
    } as any);

    expect(response.status).toBe(200);
    const body = JSON.parse(await response.text());
    expect(body.success).toBe(true);
  });
});
