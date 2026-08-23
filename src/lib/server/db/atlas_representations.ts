import { Pool } from 'pg';
import { z } from 'zod';

import {
  CANONICAL_EMBEDDING_COLLECTION,
  CANONICAL_EMBEDDING_DIMENSIONS,
  CANONICAL_EMBEDDING_NORMALIZATION,
  CANONICAL_EMBEDDING_REDUCTION,
  CANONICAL_EMBEDDING_REPRESENTATION_ID,
  CANONICAL_EMBEDDING_VECTOR_NAME,
  CanonicalContractError,
} from './canonical-768-contract';

const RawRepresentationRowSchema = z.object({
  representation_id: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  model_revision: z.string().min(1).optional(),
  tokenizer_revision: z.string().min(1).optional().nullable(),
  source_dimensions: z.number().int().positive().optional(),
  native_dimensions: z.number().int().positive().optional(),
  output_dimensions: z.number().int().positive().optional(),
  reduction: z.string().min(1).optional().nullable(),
  dimension_method: z.string().min(1).optional().nullable(),
  normalization: z.string().min(1).optional(),
  vector_name: z.string().min(1).optional(),
  physical_collection: z.string().min(1).optional(),
  collection_name: z.string().min(1).optional(),
  lifecycle_status: z.string().min(1).optional(),
  verification_status: z.string().min(1).optional(),
  projection_hash: z.string().min(1).optional().nullable(),
});

export interface RepresentationContract {
  representationId: typeof CANONICAL_EMBEDDING_REPRESENTATION_ID;
  modelId: string;
  modelRevision: string;
  tokenizerRevision: string | null;
  sourceDimensions: typeof CANONICAL_EMBEDDING_DIMENSIONS;
  outputDimensions: typeof CANONICAL_EMBEDDING_DIMENSIONS;
  reduction: typeof CANONICAL_EMBEDDING_REDUCTION;
  normalization: typeof CANONICAL_EMBEDDING_NORMALIZATION;
  vectorName: typeof CANONICAL_EMBEDDING_VECTOR_NAME;
  physicalCollection: typeof CANONICAL_EMBEDDING_COLLECTION;
  lifecycleStatus: 'ACTIVE';
  verificationStatus: 'PRODUCTION_VERIFIED';
  projectionHash: string;
  dimensionMethod: string;
}

export function normalizeRepresentationRow(row: unknown): RepresentationContract {
  const parsed = RawRepresentationRowSchema.parse(row);
  const representationId = parsed.representation_id ?? '';
  const modelId = parsed.model_id ?? '';
  const modelRevision = parsed.model_revision ?? '';
  const sourceDimensions = parsed.source_dimensions ?? parsed.native_dimensions;
  const outputDimensions = parsed.output_dimensions;
  const reduction = (parsed.reduction ?? parsed.dimension_method ?? '').toLowerCase();
  const normalization = (parsed.normalization ?? '').toLowerCase();
  const vectorName = parsed.vector_name ?? '';
  const physicalCollection = parsed.physical_collection ?? parsed.collection_name ?? '';
  const lifecycleStatus = parsed.lifecycle_status ?? '';
  const verificationStatus = parsed.verification_status ?? '';
  const projectionHash = parsed.projection_hash ?? '';

  if (!representationId) {
    throw new CanonicalContractError('runtime_owner_unproven', 'Representation row is missing representation_id.');
  }

  if (representationId !== CANONICAL_EMBEDDING_REPRESENTATION_ID) {
    throw new CanonicalContractError('runtime_owner_unproven', `Unexpected representation_id '${representationId}'.`);
  }

  if (!modelId || !modelRevision) {
    throw new CanonicalContractError('runtime_owner_unproven', 'Representation row is missing model identity fields.');
  }

  if (sourceDimensions === 384 || outputDimensions === 384) {
    throw new CanonicalContractError('dimension_384_detected', '384-dimensional representation rows are rejected for code indexing.');
  }

  if (sourceDimensions !== CANONICAL_EMBEDDING_DIMENSIONS || outputDimensions !== CANONICAL_EMBEDDING_DIMENSIONS) {
    throw new CanonicalContractError(
      'dimension_not_768',
      `Expected 768 dimensions, received source=${sourceDimensions ?? 'missing'} output=${outputDimensions ?? 'missing'}.`
    );
  }

  if (reduction !== CANONICAL_EMBEDDING_REDUCTION) {
    throw new CanonicalContractError('runtime_owner_unproven', `Expected reduction '${CANONICAL_EMBEDDING_REDUCTION}', received '${reduction || 'missing'}'.`);
  }

  if (normalization !== CANONICAL_EMBEDDING_NORMALIZATION) {
    throw new CanonicalContractError('runtime_owner_unproven', `Expected normalization '${CANONICAL_EMBEDDING_NORMALIZATION}', received '${normalization || 'missing'}'.`);
  }

  if (vectorName !== CANONICAL_EMBEDDING_VECTOR_NAME) {
    throw new CanonicalContractError('collection_mapping_missing', `Expected vector_name '${CANONICAL_EMBEDDING_VECTOR_NAME}', received '${vectorName || 'missing'}'.`);
  }

  if (physicalCollection !== CANONICAL_EMBEDDING_COLLECTION) {
    throw new CanonicalContractError('collection_mapping_missing', `Expected physical collection '${CANONICAL_EMBEDDING_COLLECTION}', received '${physicalCollection || 'missing'}'.`);
  }

  if (lifecycleStatus !== 'ACTIVE' || verificationStatus !== 'PRODUCTION_VERIFIED') {
    throw new CanonicalContractError(
      'runtime_owner_unproven',
      `Representation is not active and production verified (${lifecycleStatus || 'missing'} / ${verificationStatus || 'missing'}).`
    );
  }

  if (!projectionHash) {
    throw new CanonicalContractError('projection_hash_missing', 'Representation row is missing projection_hash.');
  }

  return {
    representationId: CANONICAL_EMBEDDING_REPRESENTATION_ID,
    modelId,
    modelRevision,
    tokenizerRevision: parsed.tokenizer_revision ?? null,
    sourceDimensions: CANONICAL_EMBEDDING_DIMENSIONS,
    outputDimensions: CANONICAL_EMBEDDING_DIMENSIONS,
    reduction: CANONICAL_EMBEDDING_REDUCTION,
    normalization: CANONICAL_EMBEDDING_NORMALIZATION,
    vectorName: CANONICAL_EMBEDDING_VECTOR_NAME,
    physicalCollection: CANONICAL_EMBEDDING_COLLECTION,
    lifecycleStatus: 'ACTIVE',
    verificationStatus: 'PRODUCTION_VERIFIED',
    projectionHash,
    dimensionMethod: parsed.dimension_method ?? parsed.reduction ?? 'native',
  };
}

export async function loadRepresentationContract(
  pool: Pool,
  representationId: string = CANONICAL_EMBEDDING_REPRESENTATION_ID
): Promise<RepresentationContract> {
  if (representationId !== CANONICAL_EMBEDDING_REPRESENTATION_ID) {
    throw new CanonicalContractError(
      'runtime_owner_unproven',
      `Only '${CANONICAL_EMBEDDING_REPRESENTATION_ID}' is accepted by the native 768 contract loader.`
    );
  }

  const result = await pool.query('SELECT * FROM atlas_representations WHERE representation_id = $1 LIMIT 2', [representationId]);

  if (result.rows.length !== 1) {
    throw new CanonicalContractError(
      'runtime_owner_unproven',
      `Expected exactly one active representation row for '${representationId}', found ${result.rows.length}.`
    );
  }

  return normalizeRepresentationRow(result.rows[0]);
}
