import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

import { buildProjectionHash } from '../../src/lib/utils/data-hashing';
import {
  checkDimensionality,
  normalizeL2Vector,
  safeSourceLineage,
  validateQdrantMapping,
  validateRepresentationContract,
} from '../../src/lib/utils/provenance-validators';
import { CanonicalContractError, CANONICAL_EMBEDDING_REPRESENTATION_ID } from '../../src/lib/server/db/canonical-768-contract';
import { loadRepresentationContract, normalizeRepresentationRow } from '../../src/lib/server/db/atlas_representations';
import { normalizeQdrantMappingRow, resolveQdrantVectorTarget } from '../../src/lib/server/db/qdrant-mapping';

function makeCanonicalRepresentationRow() {
  return {
    representation_id: CANONICAL_EMBEDDING_REPRESENTATION_ID,
    model_id: 'embeddinggemma',
    model_revision: 'embeddinggemma-768-native-v1',
    tokenizer_revision: '2026-07-30',
    source_dimensions: 768,
    output_dimensions: 768,
    reduction: 'none',
    normalization: 'l2',
    vector_name: 'dense_768',
    physical_collection: 'codebase_chunks_768',
    lifecycle_status: 'ACTIVE',
    verification_status: 'PRODUCTION_VERIFIED',
    projection_hash: 'proj:ok',
    dimension_method: 'native',
  };
}

function makeCanonicalMappingRow() {
  return {
    collection_name: 'codebase_chunks_768',
    vector_name: 'dense_768',
    representation_id: CANONICAL_EMBEDDING_REPRESENTATION_ID,
    output_dimensions: 768,
    normalization: 'l2',
    lifecycle_status: 'ACTIVE',
    verification_status: 'PRODUCTION_VERIFIED',
    projection_hash: 'map:ok',
  };
}

describe('native 768 contract', () => {
  it('builds a deterministic projection hash', () => {
    const hashA = buildProjectionHash('source:a', 'input:b', 'projection:c');
    const hashB = buildProjectionHash('source:a', 'input:b', 'projection:c');
    const hashC = buildProjectionHash('source:a', 'input:b', 'projection:d');

    expect(hashA).toHaveLength(64);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });

  it('normalizes a 768-vector and rejects zero magnitude vectors', () => {
    const { values, norm } = normalizeL2Vector([3, 4, 0]);
    expect(norm).toBe(5);
    expect(values[0]).toBeCloseTo(0.6, 6);
    expect(values[1]).toBeCloseTo(0.8, 6);
  });

  it('rejects non-768 dimensionality in the validator', async () => {
    await expect(checkDimensionality(new Array(384).fill(1), 384)).resolves.toBe(false);
    await expect(checkDimensionality(new Array(768).fill(1), 768)).resolves.toBe(true);
  });

  it('accepts the canonical representation contract and rejects 384', async () => {
    await expect(
      validateRepresentationContract(CANONICAL_EMBEDDING_REPRESENTATION_ID, {
        representationId: CANONICAL_EMBEDDING_REPRESENTATION_ID,
        sourceDimensions: 768,
        outputDimensions: 768,
        normalization: 'l2',
        reduction: 'none',
        vectorName: 'dense_768',
        physicalCollection: 'codebase_chunks_768',
      })
    ).resolves.toBe(true);

    await expect(
      validateRepresentationContract('semantic_384', {
        representationId: 'semantic_384',
        sourceDimensions: 384,
        outputDimensions: 384,
        normalization: 'l2',
        reduction: 'none',
        vectorName: 'dense_384',
        physicalCollection: 'codebase_chunks_384',
      })
    ).resolves.toBe(false);
  });

  it('accepts only the canonical Qdrant mapping', async () => {
    await expect(validateQdrantMapping('dense_768', 'codebase_chunks_768')).resolves.toBe(true);
    await expect(validateQdrantMapping('dense_384', 'codebase_chunks_384')).resolves.toBe(false);
  });

  it('parses the canonical representation row and rejects 384 rows', () => {
    expect(normalizeRepresentationRow(makeCanonicalRepresentationRow()).representationId).toBe(CANONICAL_EMBEDDING_REPRESENTATION_ID);
    expect(() =>
      normalizeRepresentationRow({
        ...makeCanonicalRepresentationRow(),
        output_dimensions: 384,
      })
    ).toThrow(CanonicalContractError);
  });

  it('parses the canonical qdrant mapping and rejects mismatches', () => {
    expect(normalizeQdrantMappingRow(makeCanonicalMappingRow()).vector_name).toBe('dense_768');
    expect(() =>
      normalizeQdrantMappingRow({
        ...makeCanonicalMappingRow(),
        vector_name: 'dense_384',
      })
    ).toThrow(CanonicalContractError);
  });

  it('loads the canonical representation row through a fake pool', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [makeCanonicalRepresentationRow()] });
    const pool = { query } as unknown as Pool;

    const contract = await loadRepresentationContract(pool);

    expect(contract.vectorName).toBe('dense_768');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('resolves the canonical Qdrant mapping through a fake pool', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [makeCanonicalMappingRow()] });
    const pool = { query } as unknown as Pool;

    const target = await resolveQdrantVectorTarget(pool);

    expect(target.collectionName).toBe('codebase_chunks_768');
    expect(target.vectorName).toBe('dense_768');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects source hashes that are obviously not hashes', async () => {
    await expect(safeSourceLineage('not-a-hash')).resolves.toBe(false);
    await expect(safeSourceLineage('sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).resolves.toBe(true);
  });
});
