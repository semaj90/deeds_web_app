import { z } from 'zod';

import {
  artifactAddressSchema,
  type ArtifactAddressV1,
} from './artifact-work-item-v1.js';
import {
  materializeLegacyVectorArtifact,
  materializePostgresJsonArtifact,
  readLegacyVectorArtifact,
  readPostgresJsonArtifact,
  type LegacyVectorArtifactPayloadV1,
} from './postgres-json-artifact-v1.js';

export const LEGACY_DOCUMENT_EMBED_ARTIFACT_SCHEMA = 'atlas.legacy-document-embed-input.v1' as const;
export const LEGACY_VECTOR_INDEX_ARTIFACT_SCHEMA = 'atlas.legacy-vector-index-input.v1' as const;

export type LegacyDocumentEmbedArtifactPayloadV1 = {
  documentId: string;
  text: string;
  collection: string;
  metadata: Record<string, unknown>;
};

export const legacyDocumentEmbedArtifactMessageSchema = z.object({
  schema: z.literal('atlas.legacy-document-embed-ref.v1'),
  artifact: artifactAddressSchema,
});

export type LegacyDocumentEmbedArtifactMessageV1 = z.infer<
  typeof legacyDocumentEmbedArtifactMessageSchema
>;

export const legacyVectorIndexArtifactMessageSchema = z.object({
  schema: z.literal('atlas.legacy-vector-index-ref.v1'),
  artifact: artifactAddressSchema,
});

export type LegacyVectorIndexArtifactMessageV1 = z.infer<
  typeof legacyVectorIndexArtifactMessageSchema
>;

export async function materializeLegacyDocumentEmbedArtifact(opts: {
  documentId: string;
  text: string;
  collection?: string;
  metadata?: Record<string, unknown>;
  producerRevision?: string;
}): Promise<ArtifactAddressV1> {
  if (!opts.documentId.trim()) throw new Error('Document artifact requires documentId');
  if (!opts.text.length) throw new Error('Document artifact requires non-empty text');

  return materializePostgresJsonArtifact({
    schemaId: LEGACY_DOCUMENT_EMBED_ARTIFACT_SCHEMA,
    payload: {
      documentId: opts.documentId,
      text: opts.text,
      collection: opts.collection ?? 'legal_documents',
      metadata: opts.metadata ?? {},
    } satisfies LegacyDocumentEmbedArtifactPayloadV1,
    revisions: {
      transport: 'artifact-ref-v1',
      producer: opts.producerRevision ?? 'legacy-document-embed-producer-v1',
    },
  });
}

export async function readLegacyDocumentEmbedArtifact(
  address: ArtifactAddressV1,
): Promise<LegacyDocumentEmbedArtifactPayloadV1> {
  if (address.schemaId !== LEGACY_DOCUMENT_EMBED_ARTIFACT_SCHEMA) {
    throw new Error(`Unexpected document embed artifact schema: ${address.schemaId}`);
  }
  const payload = await readPostgresJsonArtifact<LegacyDocumentEmbedArtifactPayloadV1>(address);
  if (!payload.documentId?.trim() || typeof payload.text !== 'string' || !payload.text.length) {
    throw new Error(`Document embed artifact is invalid: ${address.artifactId}`);
  }
  return payload;
}

export async function toLegacyDocumentEmbedArtifactMessage(opts: {
  documentId: string;
  text: string;
  collection?: string;
  metadata?: Record<string, unknown>;
  producerRevision?: string;
}): Promise<LegacyDocumentEmbedArtifactMessageV1> {
  const artifact = await materializeLegacyDocumentEmbedArtifact(opts);
  return legacyDocumentEmbedArtifactMessageSchema.parse({
    schema: 'atlas.legacy-document-embed-ref.v1',
    artifact,
  });
}

export async function toLegacyVectorIndexArtifactMessage(opts: {
  documentId: string;
  embedding: number[];
  collection?: string;
  metadata?: Record<string, unknown>;
  producerRevision?: string;
}): Promise<LegacyVectorIndexArtifactMessageV1> {
  const artifact = await materializeLegacyVectorArtifact({
    documentId: opts.documentId,
    embedding: opts.embedding,
    collection: opts.collection ?? 'legal_documents',
    metadata: opts.metadata,
    producerRevision: opts.producerRevision,
  });
  return legacyVectorIndexArtifactMessageSchema.parse({
    schema: 'atlas.legacy-vector-index-ref.v1',
    artifact,
  });
}

export async function hydrateLegacyDocumentEmbedMessage(
  raw: LegacyDocumentEmbedArtifactMessageV1 | LegacyDocumentEmbedArtifactPayloadV1,
): Promise<LegacyDocumentEmbedArtifactPayloadV1> {
  if ('schema' in raw && raw.schema === 'atlas.legacy-document-embed-ref.v1') {
    const parsed = legacyDocumentEmbedArtifactMessageSchema.parse(raw);
    return readLegacyDocumentEmbedArtifact(parsed.artifact);
  }
  return raw;
}

export async function hydrateLegacyVectorIndexMessage(
  raw: LegacyVectorIndexArtifactMessageV1 | LegacyVectorArtifactPayloadV1,
): Promise<LegacyVectorArtifactPayloadV1> {
  if ('schema' in raw && raw.schema === 'atlas.legacy-vector-index-ref.v1') {
    const parsed = legacyVectorIndexArtifactMessageSchema.parse(raw);
    return readLegacyVectorArtifact(parsed.artifact);
  }
  return raw;
}
