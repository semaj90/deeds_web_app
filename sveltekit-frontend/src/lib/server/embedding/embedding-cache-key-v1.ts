import { createHash } from 'node:crypto';

export function buildEmbeddingCacheTextHashV1(text: string, model: string): string {
  const normalizedModel = model.trim();
  if (!normalizedModel) throw new Error('EMBEDDING_CACHE_MODEL_REQUIRED');
  return createHash('sha256')
    .update(normalizedModel, 'utf8')
    .update('\0', 'utf8')
    .update(text, 'utf8')
    .digest('hex');
}
