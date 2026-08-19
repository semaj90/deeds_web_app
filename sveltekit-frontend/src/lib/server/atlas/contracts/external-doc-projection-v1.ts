import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * ORF-3 contract. One programming-document evidence family; classifications,
 * clusters, vendors, and topics are payload fields rather than collections.
 *
 * This is a target contract only. Existing external_*_768 collections remain
 * legacy/read-only until ORF-3A migration parity is proven.
 */
export const EXTERNAL_PROGRAMMING_DOCS_TARGET_COLLECTION = 'external_programming_docs_hybrid_512_v1' as const;

export const ExternalDocProjectionV1Schema = z.object({
  schema: z.literal('atlas.external-doc-projection.v1'),
  chunkId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  documentChecksum: z.string().length(64),
  chunkChecksum: z.string().length(64),

  representationId: z.literal('semantic_512'),
  representationRevision: z.string().min(1),
  nativeModelDimension: z.literal(768),
  projectionMethod: z.literal('embeddinggemma-mrl-prefix-renorm'),

  domainClass: z.string().min(1),
  language: z.string().min(1),
  ontologyClasses: z.array(z.string().min(1)).max(64),
  astObservationKinds: z.array(z.string().min(1)).max(64),
  langextractClasses: z.array(z.string().min(1)).max(32),
  tags: z.array(z.string().regex(/^[^=]+=.+$/)).max(192),

  kmeansClusterId: z.number().int().nonnegative().nullable(),
  somCell: z.string().regex(/^\d{2,}:\d{2,}$/).nullable(),
  communityId: z.string().min(1).nullable(),
  pageRank: z.number().nonnegative().nullable(),
  personalizedPageRank: z.number().nonnegative().nullable(),

  producerRevision: z.string().min(1),
  sourceVersionReceiptId: z.string().min(1).nullable(),
  migrationReceiptId: z.string().min(1).nullable(),
  payloadDigest: z.string().length(64),
}).strict();

export type ExternalDocProjectionV1 = z.infer<typeof ExternalDocProjectionV1Schema>;

export const EXTERNAL_DOC_QDRANT_INDEX_FIELDS_V1 = Object.freeze({
  source_id: 'keyword',
  source_revision: 'keyword',
  domain_class: 'keyword',
  ontology_classes: 'keyword',
  language: 'keyword',
  kmeans_cluster_id: 'integer',
  som_cell: 'keyword',
  community_id: 'keyword',
  document_checksum: 'keyword',
  chunk_checksum: 'keyword',
  tags: 'keyword',
} as const);

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function flattenExternalDocTags(input: Record<string, string | number | boolean | null | undefined>): string[] {
  return Object.entries(input)
    .filter(([, value]) => value !== null && value !== undefined && String(value).length > 0)
    .map(([key, value]) => `${key.trim().toLowerCase()}=${String(value).trim().toLowerCase()}`)
    .sort((a, b) => a.localeCompare(b));
}

export type BuildExternalDocProjectionV1Input = Omit<
  z.input<typeof ExternalDocProjectionV1Schema>,
  'schema' | 'representationId' | 'nativeModelDimension' | 'projectionMethod' | 'payloadDigest'
>;

export function buildExternalDocProjectionV1(
  input: BuildExternalDocProjectionV1Input,
): ExternalDocProjectionV1 {
  const base = {
    schema: 'atlas.external-doc-projection.v1' as const,
    ...input,
    representationId: 'semantic_512' as const,
    nativeModelDimension: 768 as const,
    projectionMethod: 'embeddinggemma-mrl-prefix-renorm' as const,
    ontologyClasses: sortedUnique(input.ontologyClasses),
    astObservationKinds: sortedUnique(input.astObservationKinds),
    langextractClasses: sortedUnique(input.langextractClasses),
    tags: sortedUnique(input.tags),
  };
  const payloadDigest = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return ExternalDocProjectionV1Schema.parse({ ...base, payloadDigest });
}
