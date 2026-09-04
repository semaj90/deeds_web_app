import { describe, expect, it } from 'vitest';
import {
  buildSemanticRepresentationV1,
  deriveSemanticLineageStatusV1,
  SemanticRepresentationV1Schema,
} from './semantic-representation-v1.js';

const BASE = {
  chunkIndexId: '11111111-1111-4111-8111-111111111111',
  sourceRef: 'src/lib/server/db/client.ts',
};

describe('SEM768-REPRESENTATION-CONTRACT-01', () => {
  it('defaults to CANONICAL_CHUNK_UNPROVEN and canonicalAuthority=false when nothing else is proven', () => {
    const rep = buildSemanticRepresentationV1(BASE);
    expect(rep.lineageStatus).toBe('CANONICAL_CHUNK_UNPROVEN');
    expect(rep.canonicalAuthority).toBe(false);
    expect(rep.storage).toEqual({
      table: 'codebase_chunk_index',
      column: 'content_embedding',
      storageType: 'halfvec(768)',
    });
  });

  it('classifies PACKET_BINDING_UNPROVEN once canonicalChunkId is present but packetKey is not', () => {
    const status = deriveSemanticLineageStatusV1({ ...BASE, canonicalChunkId: 'chunk:abc' });
    expect(status).toBe('PACKET_BINDING_UNPROVEN');
  });

  it('classifies SOURCE_REVISION_UNPROVEN once identity+packet are proven but revisions are not', () => {
    const status = deriveSemanticLineageStatusV1({
      ...BASE,
      canonicalChunkId: 'chunk:abc',
      packetKey: 'packet:abc',
    });
    expect(status).toBe('SOURCE_REVISION_UNPROVEN');
  });

  it('only reaches REVISION_QUALIFIED when every provenance field is present', () => {
    const full = {
      ...BASE,
      canonicalChunkId: 'chunk:abc',
      packetKey: 'packet:abc',
      sourceRevision: 'git:deadbeef',
      workspaceRevision: 'ws:1',
      representationRevision: 'rev:1',
      modelRevision: 'model:1',
      tokenizerRevision: 'tok:1',
      inputDigest: { algorithm: 'sha256_16' as const, value: 'a'.repeat(16), producerRevision: 'eg-task-prefix-v1' },
      vectorChecksum: 'b'.repeat(64),
    };
    expect(deriveSemanticLineageStatusV1(full)).toBe('REVISION_QUALIFIED');
    const rep = buildSemanticRepresentationV1(full);
    expect(rep.lineageStatus).toBe('REVISION_QUALIFIED');
    expect(rep.canonicalAuthority).toBe(true);
  });

  it('inputDigest algorithm="unqualified" never reaches REVISION_QUALIFIED, even with every other field present', () => {
    const almostFull = {
      ...BASE,
      canonicalChunkId: 'chunk:abc',
      packetKey: 'packet:abc',
      sourceRevision: 'git:deadbeef',
      workspaceRevision: 'ws:1',
      representationRevision: 'rev:1',
      modelRevision: 'model:1',
      tokenizerRevision: 'tok:1',
      inputDigest: { algorithm: 'unqualified' as const, value: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', producerRevision: 'unknown-legacy' },
      vectorChecksum: 'b'.repeat(64),
    };
    expect(deriveSemanticLineageStatusV1(almostFull)).toBe('SOURCE_REVISION_UNPROVEN');
    const rep = buildSemanticRepresentationV1(almostFull);
    expect(rep.canonicalAuthority).toBe(false);
  });

  it('schema rejects a hand-assembled canonicalAuthority=true claim with missing provenance (superRefine)', () => {
    const result = SemanticRepresentationV1Schema.safeParse({
      schema: 'atlas.semantic-representation.v1',
      chunkIndexId: BASE.chunkIndexId,
      sourceRef: BASE.sourceRef,
      representationId: 'semantic_768',
      modelId: 'embeddinggemma',
      dimensions: 768,
      normalized: true,
      storage: { table: 'codebase_chunk_index', column: 'content_embedding', storageType: 'halfvec(768)' },
      lineageStatus: 'REVISION_QUALIFIED',
      canonicalAuthority: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects inventing canonicalChunkId from chunkIndexId (distinct fields, not interchangeable)', () => {
    const rep = buildSemanticRepresentationV1(BASE);
    expect(rep.canonicalChunkId).toBeUndefined();
    expect(rep.chunkIndexId).toBe(BASE.chunkIndexId);
  });
});
