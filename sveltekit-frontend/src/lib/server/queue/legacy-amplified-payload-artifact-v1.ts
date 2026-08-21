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

const legacyDocumentEmbedPayloadSchema = z.object({
  documentId: z.string().min(1),
  text: z.string().min(1),
  collection: z.string().min(1).default('legal_documents'),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const legacyVectorIndexPayloadSchema = z.object({
  documentId: z.string().min(1),
  embedding: z.array(z.number().finite()).min(1),
  collection: z.string().min(1).default('legal_documents'),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type LegacyDocumentEmbedArtifactPayloadV1 = z.infer<typeof legacyDocumentEmbedPayloadSchema>;

export const legacyDocumentEmbedArtifactMessageSchema = z.object({
  schema: z.literal('atlas.legacy-document-embed-ref.v1'),
  artifact: artifactAddressSchema,
});

export type LegacyDocumentEmbedArtifactMessageV1 = z.infer<typeof legacyDocumentEmbedArtifactMessageSchema>;

export const legacyVectorIndexArtifactMessageSchema = z.object({
  schema: z.literal('atlas.legacy-vector-index-ref.v1'),
  artifact: artifactAddressSchema,
});

export type LegacyVectorIndexArtifactMessageV1 = z.infer<typeof legacyVectorIndexArtifactMessageSchema>;

export async function materializeLegacyDocumentEmbedArtifact(opts: {
  documentId: string;
  text: string;
  collection?: string;
  metadata?: Record<string, unknown>;
  producerRevision?: string;
}): Promise<ArtifactAddressV1> {
  const payload = legacyDocumentEmbedPayloadSchema.parse({
    documentId: opts.documentId,
    text: opts.text,
    collection: opts.collection ?? 'legal_documents',
    metadata: opts.metadata ?? {},
  });

  return materializePostgresJsonArtifact({
    schemaId: LEGACY_DOCUMENT_EMBED_ARTIFACT_SCHEMA,
    payload,
    revisions: {
      transport: 'artifact-ref-v1',
      producer: opts.producerRevision ?? 'legacy-document-embed-producer-v1',
    },
  });
}

export async function readLegacyDocumentEmbedArtifact(address: ArtifactAddressV1): Promise<LegacyDocumentEmbedArtifactPayloadV1> {
  if (address.schemaId !== LEGACY_DOCUMENT_EMBED_ARTIFACT_SCHEMA) {
    throw new Error(`Unexpected document embed artifact schema: ${address.schemaId}`);
  }
  return legacyDocumentEmbedPayloadSchema.parse(
    await readPostgresJsonArtifact<LegacyDocumentEmbedArtifactPayloadV1>(address),
  );
}

export async function toLegacyDocumentEmbedArtifactMessage(opts: {
  documentId: string;
  text: string;
  collection?: string;
  metadata?: Record<string, unknown>;
  producerRevision?: string;
}): Promise<LegacyDocumentEmbedArtifactMessageV1> {
  const artifact = await materializeLegacyDocumentEmbedArtifact(opts);
  return legacyDocumentEmbedArtifactMessageSchema.parse({ schema: 'atlas.legacy-document-embed-ref.v1', artifact });
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
  return legacyVectorIndexArtifactMessageSchema.parse({ schema: 'atlas.legacy-vector-index-ref.v1', artifact });
}

export async function hydrateLegacyDocumentEmbedMessage(raw: unknown): Promise<LegacyDocumentEmbedArtifactPayloadV1> {
  const ref = legacyDocumentEmbedArtifactMessageSchema.safeParse(raw);
  if (ref.success) return readLegacyDocumentEmbedArtifact(ref.data.artifact);
  return legacyDocumentEmbedPayloadSchema.parse(raw);
}

export async function hydrateLegacyVectorIndexMessage(raw: unknown): Promise<LegacyVectorArtifactPayloadV1> {
  const ref = legacyVectorIndexArtifactMessageSchema.safeParse(raw);
  if (ref.success) return readLegacyVectorArtifact(ref.data.artifact);
  return legacyVectorIndexPayloadSchema.parse(raw) satisfies LegacyVectorArtifactPayloadV1;
}
