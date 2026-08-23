import { describe, expect, it } from 'vitest';
import {
  CanonicalSemantic768SourceRefV1Schema,
  assertCanonicalSemantic768SourceRefV1,
} from './canonical-semantic-768-source-ref-v1.js';

const valid = {
  packet_key: 'packet:src/lib/server/db/client.ts:1',
  source_ref: 'src/lib/server/db/client.ts',
  postgres_id: 'chunk-1',
  qdrant_collection: 'codebase_chunks_768_v2',
  representation_id: 'semantic_768',
  embedding_dimension: 768,
  qdrant_vector_dim: 768,
  embedding_model: 'EmbeddingGemma-native',
  embedding_native_dimension: 768,
  embedding_lane: 'dense_768',
  embedding_role: 'canonical_native_semantic',
  embedding_status: 'ACTIVE',
  projection_method: 'none',
  normalization: 'L2',
  ontology_version: 'okf:v1',
  ontology_revision: 'taxonomy:v1',
  domain_class: 'code',
  concepts: ['postgresql', 'drizzle'],
};

describe('canonical semantic_768 source-ref boundary', () => {
  it('accepts Postgres-owned source identity with active EmbeddingGemma 768 metadata', () => {
    expect(CanonicalSemantic768SourceRefV1Schema.parse(valid)).toEqual(valid);
    expect(() => assertCanonicalSemantic768SourceRefV1(valid)).not.toThrow();
  });

  it('rejects derived dimensions and representation substitutions', () => {
    expect(() => CanonicalSemantic768SourceRefV1Schema.parse({ ...valid, embedding_dimension: 512 })).toThrow();
    expect(() => CanonicalSemantic768SourceRefV1Schema.parse({ ...valid, representation_id: 'semantic_512' })).toThrow();
    expect(() => CanonicalSemantic768SourceRefV1Schema.parse({ ...valid, qdrant_collection: 'codebase_chunks_768' })).toThrow();
  });

  it('rejects missing source provenance or taxonomy metadata', () => {
    expect(() => CanonicalSemantic768SourceRefV1Schema.parse({ ...valid, source_ref: '' })).toThrow();
    expect(() => CanonicalSemantic768SourceRefV1Schema.parse({ ...valid, domain_class: '' })).toThrow();
    expect(() => CanonicalSemantic768SourceRefV1Schema.parse({ ...valid, concepts: undefined })).toThrow();
  });
});
