import { z } from 'zod';
import {
  SemanticRepresentationCoreV1Schema,
  deriveSemanticLineageStatusV1,
  type SemanticRepresentationInputV1,
  type SemanticLineageStatusV1,
} from './semantic-representation-v1.js';

/** Current physical storage contract, separate from historical V1 receipts. */
export const SEMANTIC_REPRESENTATION_SCHEMA_V2 = 'atlas.semantic-representation.v2' as const;

const optionalNonEmpty = z.string().min(1).optional();

export const SemanticRepresentationV2Schema = SemanticRepresentationCoreV1Schema
  .extend({
    schema: z.literal(SEMANTIC_REPRESENTATION_SCHEMA_V2),
    storage: z.object({
      table: z.literal('codebase_chunk_index'),
      column: z.literal('content_embedding_768'),
      storageType: z.literal('vector(768)'),
    }).strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fullyProven = !!value.canonicalChunkId
      && !!value.sourceRevision
      && !!value.workspaceRevision
      && !!value.representationRevision
      && !!value.modelRevision
      && !!value.tokenizerRevision
      && !!value.inputDigest
      && !!value.vectorChecksum;
    const inputDigestProven = !!value.inputDigest && value.inputDigest.algorithm !== 'unqualified';

    if (value.canonicalAuthority && (!fullyProven || !inputDigestProven)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['canonicalAuthority'],
        message: 'canonicalAuthority=true requires complete source, representation, model, tokenizer, input, and vector provenance.',
      });
    }
    if (value.canonicalAuthority && value.lineageStatus !== 'REVISION_QUALIFIED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineageStatus'],
        message: 'canonicalAuthority=true requires lineageStatus="REVISION_QUALIFIED".',
      });
    }
    if (!fullyProven && value.lineageStatus === 'REVISION_QUALIFIED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineageStatus'],
        message: 'lineageStatus="REVISION_QUALIFIED" requires every provenance field to be present.',
      });
    }
  });

export type SemanticRepresentationV2 = z.infer<typeof SemanticRepresentationV2Schema>;

export type SemanticRepresentationInputV2 = Omit<
  SemanticRepresentationInputV1,
  'lineageStatus' | 'canonicalAuthority'
> & {
  lineageStatus?: SemanticLineageStatusV1;
  canonicalAuthority?: boolean;
};

/**
 * Builds a V2 physical-storage binding. Physical ownership alone never
 * qualifies provenance; absent proof fields remain explicitly noncanonical.
 */
export function buildSemanticRepresentationV2(
  input: SemanticRepresentationInputV2,
): SemanticRepresentationV2 {
  const lineageStatus = input.lineageStatus ?? deriveSemanticLineageStatusV1(input);
  const canonicalAuthority = input.canonicalAuthority ?? lineageStatus === 'REVISION_QUALIFIED';

  return SemanticRepresentationV2Schema.parse({
    schema: SEMANTIC_REPRESENTATION_SCHEMA_V2,
    chunkIndexId: input.chunkIndexId,
    canonicalChunkId: input.canonicalChunkId,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    representationId: 'semantic_768',
    representationRevision: input.representationRevision,
    modelId: 'embeddinggemma',
    modelRevision: input.modelRevision,
    tokenizerRevision: input.tokenizerRevision,
    dimensions: 768,
    normalized: true,
    inputDigest: input.inputDigest,
    vectorChecksum: input.vectorChecksum,
    storage: {
      table: 'codebase_chunk_index',
      column: 'content_embedding_768',
      storageType: 'vector(768)',
    },
    lineageStatus,
    canonicalAuthority,
  });
}

/** The physical column is canonical storage; individual rows may remain unqualified. */
export function semanticRepresentationV2StorageIdentity(): {
  table: 'codebase_chunk_index';
  column: 'content_embedding_768';
  storageType: 'vector(768)';
} {
  return {
    table: 'codebase_chunk_index',
    column: 'content_embedding_768',
    storageType: 'vector(768)',
  };
}

/** Read-only check for legacy V1 payloads; no automatic conversion is performed. */
export function isSemanticRepresentationV2(value: unknown): value is SemanticRepresentationV2 {
  return SemanticRepresentationV2Schema.safeParse(value).success;
}
