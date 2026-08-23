import { z } from 'zod';

export const CENTROID_CACHE_ENVELOPE_SCHEMA = 'atlas.centroid-cache-envelope.v1' as const;
export const CENTROID_CACHE_REPRESENTATION = 'semantic_768' as const;
export const CENTROID_CACHE_DIMENSION = 768 as const;
export const CENTROID_CACHE_SOURCE_COLLECTION = 'codebase_chunks_768' as const;

const FiniteVectorSchema = z
  .array(z.number().finite())
  .length(CENTROID_CACHE_DIMENSION);

export const CentroidCacheEnvelopeV1Schema = z
  .object({
    schema: z.literal(CENTROID_CACHE_ENVELOPE_SCHEMA),
    clusterId: z.number().int().nonnegative(),
    vector: FiniteVectorSchema,
    dimension: z.literal(CENTROID_CACHE_DIMENSION),
    representationId: z.literal(CENTROID_CACHE_REPRESENTATION),
    sourceCollection: z.literal(CENTROID_CACHE_SOURCE_COLLECTION),
    representationRevision: z.string().min(1).nullable(),
    producerRevision: z.string().min(1).nullable(),
    topoClass: z.string().min(1).nullable(),
    topoByte: z.number().int().nonnegative().nullable(),
    lineageQualified: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasRepresentationRevision = value.representationRevision !== null;
    const hasProducerRevision = value.producerRevision !== null;
    if (value.lineageQualified !== (hasRepresentationRevision && hasProducerRevision)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CENTROID_LINEAGE_QUALIFICATION_MISMATCH',
      });
    }
  });

export type CentroidCacheEnvelopeV1 = z.infer<typeof CentroidCacheEnvelopeV1Schema>;

export type LegacyCentroidObject = {
  vector?: unknown;
  topoClass?: unknown;
  topoByte?: unknown;
};

export function buildCentroidCacheEnvelopeV1(input: {
  clusterId: number;
  vector: readonly number[] | Float32Array;
  representationRevision?: string | null;
  producerRevision?: string | null;
  topoClass?: string | null;
  topoByte?: number | null;
}): CentroidCacheEnvelopeV1 {
  const representationRevision = input.representationRevision?.trim() || null;
  const producerRevision = input.producerRevision?.trim() || null;
  const lineageQualified = representationRevision !== null && producerRevision !== null;

  return CentroidCacheEnvelopeV1Schema.parse({
    schema: CENTROID_CACHE_ENVELOPE_SCHEMA,
    clusterId: input.clusterId,
    vector: Array.from(input.vector),
    dimension: CENTROID_CACHE_DIMENSION,
    representationId: CENTROID_CACHE_REPRESENTATION,
    sourceCollection: CENTROID_CACHE_SOURCE_COLLECTION,
    representationRevision,
    producerRevision,
    topoClass: input.topoClass?.trim() || null,
    topoByte: input.topoByte ?? null,
    lineageQualified,
  });
}

/**
 * Normalize all historically observed Valkey centroid payloads.
 *
 * Accepted legacy shapes:
 *   number[]
 *   { vector, topoClass?, topoByte? }
 *
 * Legacy payloads intentionally remain lineageQualified=false. We never invent
 * representation or producer revisions during read-through.
 */
export function normalizeCentroidCachePayloadV1(
  clusterId: number,
  payload: unknown,
): CentroidCacheEnvelopeV1 {
  const parsedEnvelope = CentroidCacheEnvelopeV1Schema.safeParse(payload);
  if (parsedEnvelope.success) {
    if (parsedEnvelope.data.clusterId !== clusterId) {
      throw new Error(`CENTROID_CLUSTER_ID_MISMATCH:${clusterId}:${parsedEnvelope.data.clusterId}`);
    }
    return parsedEnvelope.data;
  }

  if (Array.isArray(payload)) {
    return buildCentroidCacheEnvelopeV1({
      clusterId,
      vector: FiniteVectorSchema.parse(payload),
    });
  }

  if (payload && typeof payload === 'object') {
    const legacy = payload as LegacyCentroidObject;
    const vector = FiniteVectorSchema.parse(legacy.vector);
    const topoClass = typeof legacy.topoClass === 'string' && legacy.topoClass.trim()
      ? legacy.topoClass.trim()
      : null;
    const topoByte = Number.isInteger(legacy.topoByte) && Number(legacy.topoByte) >= 0
      ? Number(legacy.topoByte)
      : null;

    return buildCentroidCacheEnvelopeV1({
      clusterId,
      vector,
      topoClass,
      topoByte,
    });
  }

  throw new Error('CENTROID_CACHE_PAYLOAD_UNSUPPORTED');
}

export function serializeCentroidCacheEnvelopeV1(envelope: CentroidCacheEnvelopeV1): string {
  return JSON.stringify(CentroidCacheEnvelopeV1Schema.parse(envelope));
}

export function centroidCacheMetadataV1(envelope: CentroidCacheEnvelopeV1) {
  return {
    schema: envelope.schema,
    dimension: envelope.dimension,
    representationId: envelope.representationId,
    sourceCollection: envelope.sourceCollection,
    representationRevision: envelope.representationRevision,
    producerRevision: envelope.producerRevision,
    lineageQualified: envelope.lineageQualified,
  } as const;
}
