import { z } from 'zod';

import {
  artifactAddressSchema,
  type ArtifactAddressV1,
} from './artifact-work-item-v1.js';
import {
  materializeLegacyVectorArtifact,
  readLegacyVectorArtifact,
  type LegacyVectorArtifactPayloadV1,
} from './postgres-json-artifact-v1.js';

export const VECTOR_ARTIFACT_QUEUE_SCHEMA = 'atlas.vector-index-artifact-envelope.v1' as const;

export const legacyVectorIndexInputSchema = z.object({
  documentId: z.string().min(1),
  embedding: z.array(z.number().finite()).min(1),
  collection: z.string().min(1).default('legal_documents'),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type LegacyVectorIndexInputV1 = z.infer<typeof legacyVectorIndexInputSchema>;

export const vectorArtifactQueueEnvelopeSchema = z.object({
  schema: z.literal(VECTOR_ARTIFACT_QUEUE_SCHEMA),
  documentId: z.string().min(1),
  collection: z.string().min(1),
  artifactRef: artifactAddressSchema,
  producerRevision: z.string().min(1),
}).strict();

export type VectorArtifactQueueEnvelopeV1 = z.infer<typeof vectorArtifactQueueEnvelopeSchema>;

export type VectorArtifactMaterializer = (opts: {
  documentId: string;
  embedding: number[];
  collection: string;
  metadata?: Record<string, unknown>;
  producerRevision?: string;
}) => Promise<ArtifactAddressV1>;

export type VectorArtifactReader = (
  address: ArtifactAddressV1,
) => Promise<LegacyVectorArtifactPayloadV1>;

/**
 * Producer-side QUEUE-05 bridge.
 *
 * The large embedding is materialized once into the immutable artifact store;
 * the RabbitMQ/worker envelope contains only ArtifactAddressV1 plus small
 * identity metadata. The artifact remains the transport payload owner.
 */
export async function materializeVectorArtifactQueueEnvelope(
  inputRaw: LegacyVectorIndexInputV1,
  opts: {
    producerRevision: string;
    materialize?: VectorArtifactMaterializer;
  },
): Promise<VectorArtifactQueueEnvelopeV1> {
  const input = legacyVectorIndexInputSchema.parse(inputRaw);
  const materialize = opts.materialize ?? materializeLegacyVectorArtifact;
  const artifactRef = await materialize({
    documentId: input.documentId,
    embedding: input.embedding,
    collection: input.collection,
    metadata: input.metadata,
    producerRevision: opts.producerRevision,
  });

  return vectorArtifactQueueEnvelopeSchema.parse({
    schema: VECTOR_ARTIFACT_QUEUE_SCHEMA,
    documentId: input.documentId,
    collection: input.collection,
    artifactRef,
    producerRevision: opts.producerRevision,
  });
}

/**
 * Consumer-side QUEUE-05 bridge.
 *
 * Resolves and checksum-verifies the immutable artifact before the vector is
 * handed to the Qdrant mutation boundary. Envelope identity must agree with
 * the materialized payload; mismatches fail closed.
 */
export async function resolveVectorArtifactQueueEnvelope(
  envelopeRaw: VectorArtifactQueueEnvelopeV1,
  opts: { read?: VectorArtifactReader } = {},
): Promise<LegacyVectorArtifactPayloadV1> {
  const envelope = vectorArtifactQueueEnvelopeSchema.parse(envelopeRaw);
  const read = opts.read ?? readLegacyVectorArtifact;
  const payload = await read(envelope.artifactRef);

  if (payload.documentId !== envelope.documentId) {
    throw new Error(
      `Vector artifact document identity mismatch: envelope=${envelope.documentId} artifact=${payload.documentId}`,
    );
  }
  if (payload.collection !== envelope.collection) {
    throw new Error(
      `Vector artifact collection mismatch: envelope=${envelope.collection} artifact=${payload.collection}`,
    );
  }
  if (!payload.embedding.length || payload.embedding.some((value) => !Number.isFinite(value))) {
    throw new Error(`Vector artifact contains invalid embedding: ${envelope.artifactRef.artifactId}`);
  }

  return payload;
}

/** True only for a reference-only queue message; useful in proof/audit scripts. */
export function isReferenceOnlyVectorEnvelope(value: unknown): boolean {
  const parsed = vectorArtifactQueueEnvelopeSchema.safeParse(value);
  if (!parsed.success) return false;
  const serialized = JSON.stringify(parsed.data);
  return !serialized.includes('"embedding"') && !serialized.includes('"vector"');
}

export function vectorEnvelopeByteLength(value: VectorArtifactQueueEnvelopeV1): number {
  return Buffer.byteLength(JSON.stringify(vectorArtifactQueueEnvelopeSchema.parse(value)), 'utf8');
}
