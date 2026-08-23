export const CENTROID_CACHE_SCHEMA_V1 = 'atlas.centroid-cache-envelope.v1' as const;
export const CENTROID_CACHE_DIMENSION_V1 = 768 as const;
export const CENTROID_CACHE_REPRESENTATION_ID_V1 = 'semantic_768' as const;
export const CENTROID_CACHE_SOURCE_COLLECTION_V1 = 'codebase_chunks_768' as const;

export interface CentroidCacheEnvelopeV1 {
  schema: typeof CENTROID_CACHE_SCHEMA_V1;
  clusterId: number;
  vector: number[];
  dimension: typeof CENTROID_CACHE_DIMENSION_V1;
  representationId: typeof CENTROID_CACHE_REPRESENTATION_ID_V1;
  sourceCollection: typeof CENTROID_CACHE_SOURCE_COLLECTION_V1;
  representationRevision: string | null;
  producerRevision: string | null;
  topoClass: string | null;
  topoByte: number | null;
  lineageQualified: boolean;
}

export interface SerializeCentroidCacheInputV1 {
  clusterId: number;
  vector: ArrayLike<number>;
  representationRevision?: string | null;
  producerRevision?: string | null;
  topoClass?: string | null;
  topoByte?: number | null;
}

type LegacyCentroidObject = {
  vector?: unknown;
  topoClass?: unknown;
  topoByte?: unknown;
  clusterId?: unknown;
  representationRevision?: unknown;
  producerRevision?: unknown;
};

function asFiniteVector(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== CENTROID_CACHE_DIMENSION_V1) {
    throw new Error(`CENTROID_CACHE_VECTOR_DIMENSION_MISMATCH:${Array.isArray(value) ? value.length : 'non-array'}`);
  }
  const vector = value.map(Number);
  if (vector.some((item) => !Number.isFinite(item))) {
    throw new Error('CENTROID_CACHE_VECTOR_NON_FINITE');
  }
  return vector;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function serializeCentroidCacheEnvelopeV1(
  input: SerializeCentroidCacheInputV1,
): CentroidCacheEnvelopeV1 {
  if (!Number.isInteger(input.clusterId) || input.clusterId < 0) {
    throw new Error('CENTROID_CACHE_CLUSTER_ID_INVALID');
  }

  const vector = asFiniteVector(Array.from(input.vector));
  const representationRevision = optionalString(input.representationRevision);
  const producerRevision = optionalString(input.producerRevision);

  return {
    schema: CENTROID_CACHE_SCHEMA_V1,
    clusterId: input.clusterId,
    vector,
    dimension: CENTROID_CACHE_DIMENSION_V1,
    representationId: CENTROID_CACHE_REPRESENTATION_ID_V1,
    sourceCollection: CENTROID_CACHE_SOURCE_COLLECTION_V1,
    representationRevision,
    producerRevision,
    topoClass: optionalString(input.topoClass),
    topoByte: optionalNumber(input.topoByte),
    lineageQualified: representationRevision !== null && producerRevision !== null,
  };
}

/**
 * Read-through compatibility boundary for the historical Valkey shapes:
 *   number[768]
 *   { vector:number[768], topoClass?, topoByte? }
 * and the new versioned envelope. Legacy records stay readable but never gain
 * fabricated revisions or lineage qualification.
 */
export function normalizeCentroidCacheRecordV1(
  clusterIdFromKey: number,
  value: unknown,
): CentroidCacheEnvelopeV1 {
  if (!Number.isInteger(clusterIdFromKey) || clusterIdFromKey < 0) {
    throw new Error('CENTROID_CACHE_CLUSTER_ID_INVALID');
  }

  if (Array.isArray(value)) {
    return serializeCentroidCacheEnvelopeV1({
      clusterId: clusterIdFromKey,
      vector: asFiniteVector(value),
    });
  }

  if (!value || typeof value !== 'object') {
    throw new Error('CENTROID_CACHE_RECORD_INVALID');
  }

  const record = value as LegacyCentroidObject & Partial<CentroidCacheEnvelopeV1>;
  if (record.clusterId !== undefined && record.clusterId !== clusterIdFromKey) {
    throw new Error('CENTROID_CACHE_CLUSTER_ID_MISMATCH');
  }

  const vector = asFiniteVector(record.vector);
  const representationRevision = optionalString(record.representationRevision);
  const producerRevision = optionalString(record.producerRevision);

  if (record.schema === CENTROID_CACHE_SCHEMA_V1) {
    if (record.dimension !== CENTROID_CACHE_DIMENSION_V1) {
      throw new Error('CENTROID_CACHE_ENVELOPE_DIMENSION_INVALID');
    }
    if (record.representationId !== CENTROID_CACHE_REPRESENTATION_ID_V1) {
      throw new Error('CENTROID_CACHE_REPRESENTATION_ID_INVALID');
    }
    if (record.sourceCollection !== CENTROID_CACHE_SOURCE_COLLECTION_V1) {
      throw new Error('CENTROID_CACHE_SOURCE_COLLECTION_INVALID');
    }
  }

  return {
    schema: CENTROID_CACHE_SCHEMA_V1,
    clusterId: clusterIdFromKey,
    vector,
    dimension: CENTROID_CACHE_DIMENSION_V1,
    representationId: CENTROID_CACHE_REPRESENTATION_ID_V1,
    sourceCollection: CENTROID_CACHE_SOURCE_COLLECTION_V1,
    representationRevision,
    producerRevision,
    topoClass: optionalString(record.topoClass),
    topoByte: optionalNumber(record.topoByte),
    lineageQualified: representationRevision !== null && producerRevision !== null,
  };
}
