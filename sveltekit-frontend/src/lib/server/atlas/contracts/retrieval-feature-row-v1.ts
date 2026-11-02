import { z } from 'zod';

/** Query-time derived scores; never a replacement for FeatureMatrixRowV1 truth. */
export const RetrievalFeatureRowV1Schema = z.object({
  schema: z.literal('atlas.retrieval-feature-row.v1'),
  canonicalId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  denseSemanticScore: z.number().finite().nullable(),
  lexicalScore: z.number().finite().nullable(),
  astSameSymbol: z.number().finite().min(0).max(1),
  astSameFile: z.number().finite().min(0).max(1),
  graphDistance: z.number().finite().nonnegative().nullable(),
  graphAuthority: z.number().finite().nullable(),
  domainAffinity: z.number().finite().min(0).max(1),
  processAffinity: z.number().finite().min(0).max(1),
  executionSuccessPrior: z.number().finite().min(0).max(1).nullable(),
  fusedRank: z.number().int().positive().nullable(),
  rerankScore: z.number().finite().nullable(),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(128),
  producerRevision: z.string().min(1),
  canonicalWrites: z.literal(false),
}).strict();
export type RetrievalFeatureRowV1 = z.infer<typeof RetrievalFeatureRowV1Schema>;
