import { describe, expect, it } from 'vitest';

import {
  assertSemanticRecipeCompatibilityV1,
  SemanticEmbeddingRecipeV1Schema,
  type SemanticEmbeddingRecipeV1,
} from './semantic-recipe-compatibility-v1.js';

const sharedRecipe = {
  representationId: 'semantic_768',
  representationRevision: 'semantic-768:r1',
  modelArtifactRevision: 'embeddinggemma-300m:sha256-abc',
  tokenizerRevision: 'embeddinggemma-tokenizer:r1',
  inputPolicyRevision: 'embedding-policy:r1',
  promptRevision: 'embeddinggemma.task-prompts.google-v1',
  dimension: 768,
  metric: 'COSINE',
  normalization: 'L2',
  inputChecksum: 'a'.repeat(64),
} as const;

const queryRecipe: SemanticEmbeddingRecipeV1 = {
  ...sharedRecipe,
  mode: 'retrieval_query',
};

const documentRecipe: SemanticEmbeddingRecipeV1 = {
  ...sharedRecipe,
  mode: 'retrieval_document',
  inputChecksum: 'b'.repeat(64),
};

describe('semantic embedding recipe compatibility V1', () => {
  it('admits query and document recipes only when representation policy matches', () => {
    expect(() => assertSemanticRecipeCompatibilityV1({ query: queryRecipe, document: documentRecipe })).not.toThrow();
  });

  it('rejects a 384-dimensional vector as incompatible with semantic_768', () => {
    expect(() => SemanticEmbeddingRecipeV1Schema.parse({ ...queryRecipe, dimension: 384 })).toThrow();
  });

  it('rejects mismatched model, tokenizer, policy, prompt, or representation revisions', () => {
    const fields = [
      'representationRevision',
      'modelArtifactRevision',
      'tokenizerRevision',
      'inputPolicyRevision',
      'promptRevision',
    ] as const;

    for (const field of fields) {
      const document = { ...documentRecipe, [field]: `${documentRecipe[field]}:different` } as SemanticEmbeddingRecipeV1;
      expect(() => assertSemanticRecipeCompatibilityV1({ query: queryRecipe, document })).toThrow(
        `SEMANTIC_QUERY_DOCUMENT_RECIPE_MISMATCH:${field}`,
      );
    }
  });

  it('requires the query and document roles to be explicit', () => {
    expect(() => assertSemanticRecipeCompatibilityV1({
      query: { ...queryRecipe, mode: 'retrieval_document' },
      document: documentRecipe,
    })).toThrow('SEMANTIC_QUERY_RECIPE_MODE_INVALID');

    expect(() => assertSemanticRecipeCompatibilityV1({
      query: queryRecipe,
      document: { ...documentRecipe, mode: 'retrieval_query' },
    })).toThrow('SEMANTIC_DOCUMENT_RECIPE_MODE_INVALID');
  });
});
