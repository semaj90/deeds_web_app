import { z } from 'zod';

export const OAK_SEMANTIC_QDRANT_STRICT_V1 = 'sveltekit-frontend/src/lib/server/search/qdrant-search.ts#searchQdrantCodeStrictV1' as const;

export const oakSemanticQdrantInputV1Schema = z.object({
  embedding: z.array(z.number().finite()).length(768),
  limit: z.number().int().min(1).max(100).default(10),
  collection: z.literal('codebase_chunks_768_v2').default('codebase_chunks_768_v2'),
  topoClass: z.string().min(1).optional(),
}).strict();

export type OakSemanticQdrantInputV1 = z.infer<typeof oakSemanticQdrantInputV1Schema>;

export const oakSemanticQdrantReceiptV1Schema = z.object({
  schema: z.literal('atlas.oak-semantic-qdrant-receipt.v1'),
  implementationRef: z.literal(OAK_SEMANTIC_QDRANT_STRICT_V1),
  executor: z.literal('qdrant'),
  representation: z.literal('semantic_768'),
  collection: z.literal('codebase_chunks_768_v2'),
  vectorName: z.literal('content'),
  candidateCount: z.number().int().nonnegative(),
  projectionIds: z.array(z.string().min(1)),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();

export type OakSemanticQdrantReceiptV1 = z.infer<typeof oakSemanticQdrantReceiptV1Schema>;
