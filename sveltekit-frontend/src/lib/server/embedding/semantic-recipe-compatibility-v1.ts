import { z } from 'zod';

export const SemanticEmbeddingRecipeV1Schema = z.object({
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  modelArtifactRevision: z.string().min(1),
  tokenizerRevision: z.string().min(1),
  inputPolicyRevision: z.string().min(1),
  promptRevision: z.string().min(1),
  mode: z.enum(['retrieval_query', 'retrieval_document']),
  dimension: z.literal(768),
  metric: z.literal('COSINE'),
  normalization: z.literal('L2'),
  inputChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type SemanticEmbeddingRecipeV1 = z.infer<typeof SemanticEmbeddingRecipeV1Schema>;

export function assertSemanticRecipeCompatibilityV1(input: {
  query: SemanticEmbeddingRecipeV1;
  document: SemanticEmbeddingRecipeV1;
}): void {
  const query = SemanticEmbeddingRecipeV1Schema.parse(input.query);
  const document = SemanticEmbeddingRecipeV1Schema.parse(input.document);
  if (query.mode !== 'retrieval_query') throw new Error('SEMANTIC_QUERY_RECIPE_MODE_INVALID');
  if (document.mode !== 'retrieval_document') throw new Error('SEMANTIC_DOCUMENT_RECIPE_MODE_INVALID');
  for (const field of [
    'representationRevision',
    'modelArtifactRevision',
    'tokenizerRevision',
    'inputPolicyRevision',
    'promptRevision',
    'dimension',
    'metric',
    'normalization',
  ] as const) {
    if (query[field] !== document[field]) {
      throw new Error(`SEMANTIC_QUERY_DOCUMENT_RECIPE_MISMATCH:${field}`);
    }
  }
}
