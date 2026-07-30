import { Pool } from 'pg';
import { z } from 'zod';

import {
  CANONICAL_EMBEDDING_COLLECTION,
  CANONICAL_EMBEDDING_DIMENSIONS,
  CANONICAL_EMBEDDING_NORMALIZATION,
  CANONICAL_EMBEDDING_REPRESENTATION_ID,
  CANONICAL_EMBEDDING_VECTOR_NAME,
  CanonicalContractError,
} from './canonical-768-contract';

const RawQdrantMappingSchema = z.object({
  collection_name: z.string().min(1).optional(),
  vector_name: z.string().min(1).optional(),
  representation_id: z.string().min(1).optional(),
  output_dimensions: z.number().int().positive().optional(),
  source_dimensions: z.number().int().positive().optional(),
  normalization: z.string().min(1).optional(),
  lifecycle_status: z.string().min(1).optional(),
  verification_status: z.string().min(1).optional(),
  projection_hash: z.string().min(1).optional().nullable(),
});

export interface AtlasQdrantCollectionMapping {
  collection_name: typeof CANONICAL_EMBEDDING_COLLECTION;
  vector_name: typeof CANONICAL_EMBEDDING_VECTOR_NAME;
  representation_id: typeof CANONICAL_EMBEDDING_REPRESENTATION_ID;
  output_dimensions: typeof CANONICAL_EMBEDDING_DIMENSIONS;
  normalization: typeof CANONICAL_EMBEDDING_NORMALIZATION;
  lifecycle_status: 'ACTIVE';
  verification_status: 'PRODUCTION_VERIFIED';
  projection_hash: string;
}

export interface QdrantVectorTarget {
  vectorName: typeof CANONICAL_EMBEDDING_VECTOR_NAME;
  representationId: typeof CANONICAL_EMBEDDING_REPRESENTATION_ID;
  expectedDimension: typeof CANONICAL_EMBEDDING_DIMENSIONS;
  collectionName: typeof CANONICAL_EMBEDDING_COLLECTION;
  normalization: typeof CANONICAL_EMBEDDING_NORMALIZATION;
  mapping: AtlasQdrantCollectionMapping;
}

export function normalizeQdrantMappingRow(row: unknown): AtlasQdrantCollectionMapping {
  const parsed = RawQdrantMappingSchema.parse(row);
  const collectionName = parsed.collection_name ?? '';
  const vectorName = parsed.vector_name ?? '';
  const representationId = parsed.representation_id ?? '';
  const outputDimensions = parsed.output_dimensions ?? parsed.source_dimensions;
  const normalization = (parsed.normalization ?? '').toLowerCase();
  const lifecycleStatus = parsed.lifecycle_status ?? '';
  const verificationStatus = parsed.verification_status ?? '';
  const projectionHash = parsed.projection_hash ?? '';

  if (!collectionName || !vectorName || !representationId) {
    throw new CanonicalContractError('collection_mapping_missing', 'Qdrant mapping row is missing required identifier fields.');
  }

  if (representationId !== CANONICAL_EMBEDDING_REPRESENTATION_ID) {
    throw new CanonicalContractError('runtime_owner_unproven', `Unexpected representation_id '${representationId}'.`);
  }

  if (vectorName !== CANONICAL_EMBEDDING_VECTOR_NAME || collectionName !== CANONICAL_EMBEDDING_COLLECTION) {
    throw new CanonicalContractError(
      'collection_mapping_missing',
      `Expected '${CANONICAL_EMBEDDING_COLLECTION}.${CANONICAL_EMBEDDING_VECTOR_NAME}', received '${collectionName}.${vectorName}'.`
    );
  }

  if (outputDimensions === 384) {
    throw new CanonicalContractError('dimension_384_detected', '384-dimensional Qdrant mappings are rejected for code indexing.');
  }

  if (outputDimensions !== CANONICAL_EMBEDDING_DIMENSIONS) {
    throw new CanonicalContractError('dimension_not_768', `Expected 768 dimensions, received ${outputDimensions ?? 'missing'}.`);
  }

  if (normalization !== CANONICAL_EMBEDDING_NORMALIZATION) {
    throw new CanonicalContractError(
      'runtime_owner_unproven',
      `Expected normalization '${CANONICAL_EMBEDDING_NORMALIZATION}', received '${normalization || 'missing'}'.`
    );
  }

  if (lifecycleStatus !== 'ACTIVE' || verificationStatus !== 'PRODUCTION_VERIFIED') {
    throw new CanonicalContractError(
      'runtime_owner_unproven',
      `Mapping is not active and production verified (${lifecycleStatus || 'missing'} / ${verificationStatus || 'missing'}).`
    );
  }

  if (!projectionHash) {
    throw new CanonicalContractError('projection_hash_missing', 'Qdrant mapping row is missing projection_hash.');
  }

  return {
    collection_name: CANONICAL_EMBEDDING_COLLECTION,
    vector_name: CANONICAL_EMBEDDING_VECTOR_NAME,
    representation_id: CANONICAL_EMBEDDING_REPRESENTATION_ID,
    output_dimensions: CANONICAL_EMBEDDING_DIMENSIONS,
    normalization: CANONICAL_EMBEDDING_NORMALIZATION,
    lifecycle_status: 'ACTIVE',
    verification_status: 'PRODUCTION_VERIFIED',
    projection_hash: projectionHash,
  };
}

export async function resolveQdrantVectorTarget(
  pool: Pool,
  requiredVectorName: string = CANONICAL_EMBEDDING_VECTOR_NAME,
  requiredRepresentationId: string = CANONICAL_EMBEDDING_REPRESENTATION_ID
): Promise<QdrantVectorTarget> {
  if (requiredVectorName !== CANONICAL_EMBEDDING_VECTOR_NAME || requiredRepresentationId !== CANONICAL_EMBEDDING_REPRESENTATION_ID) {
    throw new CanonicalContractError('collection_mapping_missing', 'Only the canonical dense_768 / embeddinggemma_768_native_v1 mapping is accepted.');
  }

  const result = await pool.query(
    'SELECT * FROM atlas_qdrant_collection_mappings WHERE vector_name = $1 AND representation_id = $2 LIMIT 2',
    [requiredVectorName, requiredRepresentationId]
  );

  if (result.rows.length !== 1) {
    throw new CanonicalContractError(
      'collection_mapping_missing',
      `Expected exactly one Qdrant mapping row for '${requiredVectorName}'/'${requiredRepresentationId}', found ${result.rows.length}.`
    );
  }

  const mapping = normalizeQdrantMappingRow(result.rows[0]);

  return {
    vectorName: mapping.vector_name,
    representationId: mapping.representation_id,
    expectedDimension: mapping.output_dimensions,
    collectionName: mapping.collection_name,
    normalization: mapping.normalization,
    mapping,
  };
}
