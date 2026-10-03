import { describe, expect, it } from 'vitest';
import {
  buildSemanticRepresentationV2,
  isSemanticRepresentationV2,
  SemanticRepresentationV2Schema,
} from './semantic-representation-v2.js';

const BASE = {
  chunkIndexId: '11111111-1111-4111-8111-111111111111',
  sourceRef: 'src/lib/server/db/client.ts',
};

describe('semantic representation V2 storage owner', () => {
  it('binds the current semantic_768 representation to the instructed PostgreSQL column', () => {
    const value = buildSemanticRepresentationV2(BASE);
    expect(value.storage).toEqual({
      table: 'codebase_chunk_index',
      column: 'content_embedding_768',
      storageType: 'vector(768)',
    });
    expect(value.representationId).toBe('semantic_768');
  });

  it('does not promote a physically present vector without row-level provenance', () => {
    const value = buildSemanticRepresentationV2(BASE);
    expect(value.lineageStatus).toBe('CANONICAL_CHUNK_UNPROVEN');
    expect(value.canonicalAuthority).toBe(false);
  });

  it('rejects the historical V1 storage coordinate in a V2 receipt', () => {
    const value = buildSemanticRepresentationV2(BASE);
    const result = SemanticRepresentationV2Schema.safeParse({
      ...value,
      storage: {
        table: 'codebase_chunk_index',
        column: 'content_embedding',
        storageType: 'halfvec(768)',
      },
    });
    expect(result.success).toBe(false);
  });

  it('requires exact provenance for canonicalAuthority=true', () => {
    expect(() => buildSemanticRepresentationV2({ ...BASE, canonicalAuthority: true })).toThrow();
  });

  it('accepts an explicitly qualified V2 binding without mutating V1 receipt semantics', () => {
    const value = buildSemanticRepresentationV2({
      ...BASE,
      canonicalChunkId: 'chunk:abc',
      packetKey: 'packet:abc',
      sourceRevision: 'sha256:' + 'a'.repeat(64),
      workspaceRevision: 'sha256:' + 'b'.repeat(64),
      representationRevision: 'sha256:' + 'c'.repeat(64),
      modelRevision: 'sha256:' + 'd'.repeat(64),
      tokenizerRevision: 'sha256:' + 'e'.repeat(64),
      inputDigest: {
        algorithm: 'sha256' as const,
        value: 'f'.repeat(64),
        producerRevision: 'semantic-input-compiler-v1',
      },
      vectorChecksum: '1'.repeat(64),
    });
    expect(value.lineageStatus).toBe('REVISION_QUALIFIED');
    expect(value.canonicalAuthority).toBe(true);
    expect(isSemanticRepresentationV2(value)).toBe(true);
  });
});
