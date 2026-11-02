export function requireNonEmptyEmbeddingTextV1(text, label = 'embedding input') {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error(`EMPTY_EMBEDDING_INPUT:${label}`);
  }
  return text;
}

export function requireNonEmptyEmbeddingBatchV1(texts, label = 'embedding inputs') {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error(`EMPTY_EMBEDDING_BATCH:${label}`);
  }
  return texts.map((text, index) => requireNonEmptyEmbeddingTextV1(text, `${label}[${index}]`));
}

export function isNonRetryableEmbeddingInputErrorV1(error) {
  return error instanceof Error && error.message.startsWith('EMPTY_EMBEDDING_INPUT:');
}

export function isValidEmbeddingVectorV1(vector, dimensions = 768) {
  return Array.isArray(vector)
    && vector.length === dimensions
    && vector.every((value) => Number.isFinite(value));
}
