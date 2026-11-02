export function requireDocumentEmbeddingV1(value: unknown): number[] {
  if (!Array.isArray(value)
    || value.length !== 768
    || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    || !value.some((entry) => entry !== 0)) {
    throw new Error('DOCUMENT_EMBEDDING_INVALID: expected 768 finite non-zero values');
  }

  return value;
}
