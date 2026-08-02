/**
 * Packet ingestion schema validation smoke test
 * Closes PACKET_VALIDATION lane → RUNTIME_SMOKE_PROVEN
 */

import { describe, it, expect } from 'vitest';
import { ChunkIdentitySchema, EmbeddingContractSchema, CANONICAL_EMBEDDING_CONTRACTS } from './ingest-packet-schema';

describe('Ingestion Packet Schema Validation', () => {
  describe('ChunkIdentitySchema', () => {
    it('should accept valid chunk identity', () => {
      const validChunk = {
        chunkId: '550e8400-e29b-41d4-a716-446655440000',
        ordinal: 0,
        text: 'Sample chunk text',
        tokenCount: 10,
        startOffset: 0,
        endOffset: 16,
        structuralPath: ['section', 'paragraph'],
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      };
      const result = ChunkIdentitySchema.safeParse(validChunk);
      expect(result.success).toBe(true);
    });

    it('should reject chunk with invalid UUID', () => {
      const invalidChunk = {
        chunkId: 'not-a-uuid',
        ordinal: 0,
        text: 'Sample chunk text',
        tokenCount: 10,
        startOffset: 0,
        endOffset: 16,
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      };
      const result = ChunkIdentitySchema.safeParse(invalidChunk);
      expect(result.success).toBe(false);
    });

    it('should reject chunk with empty text', () => {
      const invalidChunk = {
        chunkId: '550e8400-e29b-41d4-a716-446655440000',
        ordinal: 0,
        text: '',
        tokenCount: 0,
        startOffset: 0,
        endOffset: 0,
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      };
      const result = ChunkIdentitySchema.safeParse(invalidChunk);
      expect(result.success).toBe(false);
    });

    it('should reject chunk with invalid SHA-256 hash', () => {
      const invalidChunk = {
        chunkId: '550e8400-e29b-41d4-a716-446655440000',
        ordinal: 0,
        text: 'Sample chunk text',
        tokenCount: 10,
        startOffset: 0,
        endOffset: 16,
        contentHash: 'invalid-hash',
      };
      const result = ChunkIdentitySchema.safeParse(invalidChunk);
      expect(result.success).toBe(false);
    });
  });

  describe('EmbeddingContractSchema', () => {
    it('should accept valid embedding contract', () => {
      const validContract = {
        modelId: 'embeddinggemma',
        modelRevision: '20260720',
        nativeDimensions: 768,
        storedDimensions: 768,
        normalized: true,
        pooling: 'mean',
        projectionVersion: null,
        contractVersion: '1.0',
      };
      const result = EmbeddingContractSchema.safeParse(validContract);
      expect(result.success).toBe(true);
    });

    it('should reject embedding contract with missing modelId', () => {
      const invalidContract = {
        modelRevision: '20260720',
        nativeDimensions: 768,
        storedDimensions: 768,
        normalized: true,
        pooling: 'mean',
      };
      const result = EmbeddingContractSchema.safeParse(invalidContract);
      expect(result.success).toBe(false);
    });

    it('should reject embedding contract with zero dimensions', () => {
      const invalidContract = {
        modelId: 'embeddinggemma',
        modelRevision: '20260720',
        nativeDimensions: 0,
        storedDimensions: 768,
        normalized: true,
        pooling: 'mean',
      };
      const result = EmbeddingContractSchema.safeParse(invalidContract);
      expect(result.success).toBe(false);
    });
  });

  describe('Canonical Embedding Contracts', () => {
    it('should have NATIVE_768 contract configured', () => {
      const contract = CANONICAL_EMBEDDING_CONTRACTS.NATIVE_768;
      expect(contract).toBeDefined();
      expect(contract.storedDimensions).toBe(768);
      expect(contract.nativeDimensions).toBe(768);
      expect(contract.projectionVersion).toBeNull();
    });

    it('should have LATENT_64 contract configured', () => {
      const contract = CANONICAL_EMBEDDING_CONTRACTS.LATENT_64;
      expect(contract).toBeDefined();
      expect(contract.storedDimensions).toBe(64);
      expect(contract.nativeDimensions).toBe(64);
      expect(contract.projectionVersion).toBe('ae-v1');
    });

    it('should validate NATIVE_768 contract structure', () => {
      const contract = CANONICAL_EMBEDDING_CONTRACTS.NATIVE_768;
      const result = EmbeddingContractSchema.safeParse(contract);
      expect(result.success).toBe(true);
    });

    it('should validate LATENT_64 contract structure', () => {
      const contract = CANONICAL_EMBEDDING_CONTRACTS.LATENT_64;
      const result = EmbeddingContractSchema.safeParse(contract);
      expect(result.success).toBe(true);
    });
  });
});
