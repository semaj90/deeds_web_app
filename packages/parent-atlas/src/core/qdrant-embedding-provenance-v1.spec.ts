import { describe, expect, it } from 'vitest';

import {
  buildEmbeddingProvenanceCohortV1,
  classifyEmbeddingProvenanceCohortV1,
  verifyEmbeddingProvenanceCohortV1,
  type EmbeddingProvenanceCohortInputV1,
} from './qdrant-embedding-provenance-v1.js';

function baseInput(
  overrides: Partial<EmbeddingProvenanceCohortInputV1> = {},
): EmbeddingProvenanceCohortInputV1 {
  return {
    collection: 'codebase_chunks_768_v2',
    vector_name: 'content',
    point_id_generation: 'UUID',
    writer_generation: 'v2_uuid_clean',
    writer_revision: 'sha256:writer',
    projection_revision: 'v2_uuid_clean',
    representation_id: 'semantic_768',
    representation_revision: 'semantic-768-doc-v1',
    point_count: 100,
    sample_count: 10,
    model_id: 'google/embeddinggemma-300m',
    model_artifact_digest: 'sha256:model',
    embedding_runtime: 'llama-server',
    embedding_runtime_revision: 'rev-1',
    prompt_mode: 'retrieval_document',
    prompt_revision: 'prompt-v1',
    normalization: 'L2',
    normalization_revision: 'l2-v1',
    exact_packet_links: 10,
    unresolved_links: 0,
    evidence_level: 'PACKET_LINKED',
    mixed_fields: [],
    ...overrides,
  };
}

describe('Qdrant embedding provenance cohort v1', () => {
  it('does not treat collection shape as model provenance', () => {
    const input = baseInput({
      writer_revision: null,
      representation_id: null,
      representation_revision: null,
      model_id: null,
      model_artifact_digest: null,
      embedding_runtime: null,
      embedding_runtime_revision: null,
      prompt_mode: null,
      prompt_revision: null,
      normalization: null,
      normalization_revision: null,
      exact_packet_links: 0,
      unresolved_links: 10,
      evidence_level: 'COLLECTION_ONLY',
    });

    expect(classifyEmbeddingProvenanceCohortV1(input)).toBe('UNPROVEN');
  });

  it('marks incomplete historical payload provenance as partial', () => {
    const input = baseInput({
      writer_revision: null,
      model_artifact_digest: null,
      prompt_mode: null,
      prompt_revision: null,
      evidence_level: 'PAYLOAD_OBSERVED',
      exact_packet_links: 0,
      unresolved_links: 10,
    });

    expect(classifyEmbeddingProvenanceCohortV1(input)).toBe('PARTIAL');
  });

  it('keeps mixed writer or prompt history distinct from partial evidence', () => {
    const input = baseInput({
      mixed_fields: ['prompt_mode', 'writer_revision'],
    });

    expect(classifyEmbeddingProvenanceCohortV1(input)).toBe('MIXED_HISTORY');
  });

  it('requires numerical corroboration before full PROVEN', () => {
    expect(classifyEmbeddingProvenanceCohortV1(baseInput())).toBe(
      'PROVEN_FOR_GENERATION',
    );
    expect(
      classifyEmbeddingProvenanceCohortV1(
        baseInput({ evidence_level: 'NUMERICALLY_CORROBORATED' }),
      ),
    ).toBe('PROVEN');
  });

  it('builds a deterministic checksum and detects tampering', () => {
    const cohort = buildEmbeddingProvenanceCohortV1(baseInput());
    const replay = buildEmbeddingProvenanceCohortV1(baseInput());

    expect(cohort.checksum).toBe(replay.checksum);
    expect(cohort.canonical_authority).toBe(false);
    expect(verifyEmbeddingProvenanceCohortV1(cohort)).toBe(true);
    expect(
      verifyEmbeddingProvenanceCohortV1({
        ...cohort,
        prompt_mode: 'code_retrieval_query',
      }),
    ).toBe(false);
  });
});
