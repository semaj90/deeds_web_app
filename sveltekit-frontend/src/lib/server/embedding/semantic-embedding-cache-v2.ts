import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db/client';
import {
  hashSemanticEmbeddingCacheKeyV2,
  serializeSemanticEmbeddingCacheKeyV2,
  type SemanticEmbeddingCacheKeyV2,
} from './semantic-embedding-cache-key-v2.js';
import { SEMANTIC_DIMENSION } from './embedding-contract-768.js';

export const SEMANTIC_EMBEDDING_CACHE_V2_DIMENSIONS = SEMANTIC_DIMENSION;

export function validateSemanticEmbeddingCacheVector(vector: readonly number[]): number[] {
  if (vector.length !== SEMANTIC_EMBEDDING_CACHE_V2_DIMENSIONS) {
    throw new Error(`CACHE_V2_INVALID_DIMENSIONS:${vector.length}`);
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error('CACHE_V2_NON_FINITE_VECTOR');
  }
  return Array.from(vector);
}

function vectorLiteral(vector: readonly number[]): string {
  return `[${validateSemanticEmbeddingCacheVector(vector).join(',')}]`;
}

export async function getSemanticEmbeddingCacheV2(key: SemanticEmbeddingCacheKeyV2): Promise<number[] | null> {
  const cacheKey = hashSemanticEmbeddingCacheKeyV2(key);
  const result = await db.execute<{ embedding: string }>(sql`
    SELECT embedding::text AS embedding
    FROM semantic_embedding_cache_v2
    WHERE cache_key = ${cacheKey}
      AND representation_id = ${key.representationId}
      AND representation_revision = ${key.representationRevision}
      AND model_artifact_revision = ${key.modelArtifactRevision}
      AND tokenizer_revision = ${key.tokenizerRevision}
      AND input_policy_revision = ${key.inputPolicyRevision}
      AND normalized_input_checksum = ${key.normalizedInputChecksum}
    LIMIT 1
  `);
  const encoded = result.rows[0]?.embedding;
  if (!encoded) return null;
  return validateSemanticEmbeddingCacheVector(JSON.parse(encoded) as number[]);
}

export async function putSemanticEmbeddingCacheV2(key: SemanticEmbeddingCacheKeyV2, vector: readonly number[]): Promise<void> {
  const cacheKey = hashSemanticEmbeddingCacheKeyV2(key);
  const literal = vectorLiteral(vector);
  await db.execute(sql`
    INSERT INTO semantic_embedding_cache_v2 (
      cache_key, representation_id, representation_revision,
      model_artifact_revision, tokenizer_revision, input_policy_revision,
      normalized_input_checksum, embedding
    ) VALUES (
      ${cacheKey}, ${key.representationId}, ${key.representationRevision},
      ${key.modelArtifactRevision}, ${key.tokenizerRevision}, ${key.inputPolicyRevision},
      ${key.normalizedInputChecksum}, ${literal}::halfvec
    )
    ON CONFLICT (cache_key) DO UPDATE SET
      embedding = EXCLUDED.embedding,
      last_used_at = now()
  `);
}

export function semanticEmbeddingCacheKeyPayload(key: SemanticEmbeddingCacheKeyV2): string {
  return serializeSemanticEmbeddingCacheKeyV2(key);
}
