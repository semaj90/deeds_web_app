import { createHash } from 'node:crypto';

export const SEMANTIC_EMBEDDING_CACHE_KEY_SCHEMA = 'atlas.semantic-embedding-cache-key.v2' as const;

export interface SemanticEmbeddingCacheKeyV2 {
  schema: typeof SEMANTIC_EMBEDDING_CACHE_KEY_SCHEMA;
  representationId: 'semantic_768';
  representationRevision: string;
  modelArtifactRevision: string;
  tokenizerRevision: string;
  inputPolicyRevision: string;
  normalizedInputChecksum: string;
}

function required(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`CACHE_KEY_${name.toUpperCase()}_REQUIRED`);
  return value;
}

export function createSemanticEmbeddingCacheKeyV2(input: Omit<SemanticEmbeddingCacheKeyV2, 'schema'>): SemanticEmbeddingCacheKeyV2 {
  if (input.representationId !== 'semantic_768') throw new Error('CACHE_KEY_REPRESENTATION_MUST_BE_SEMANTIC_768');
  return {
    schema: SEMANTIC_EMBEDDING_CACHE_KEY_SCHEMA,
    representationId: input.representationId,
    representationRevision: required('representation_revision', input.representationRevision),
    modelArtifactRevision: required('model_artifact_revision', input.modelArtifactRevision),
    tokenizerRevision: required('tokenizer_revision', input.tokenizerRevision),
    inputPolicyRevision: required('input_policy_revision', input.inputPolicyRevision),
    normalizedInputChecksum: required('normalized_input_checksum', input.normalizedInputChecksum),
  };
}

export function serializeSemanticEmbeddingCacheKeyV2(key: SemanticEmbeddingCacheKeyV2): string {
  const value = createSemanticEmbeddingCacheKeyV2({ ...key });
  return JSON.stringify(value);
}

export function hashSemanticEmbeddingCacheKeyV2(key: SemanticEmbeddingCacheKeyV2): string {
  return `sha256:${createHash('sha256').update(serializeSemanticEmbeddingCacheKeyV2(key), 'utf8').digest('hex')}`;
}
