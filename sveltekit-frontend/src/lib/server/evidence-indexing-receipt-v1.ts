export type EvidenceIndexingReceiptInputV1 = {
  totalChunks: number;
  embeddedCount: number;
  pgVectorStored: number;
  pgVectorFailures: number;
  qdrantPointCount: number;
  qdrantStatus: 'indexed' | 'failed' | 'skipped';
};

export function validateEvidenceEmbeddingV1(embedding: readonly number[]): 'valid' | 'wrong_dimension' | 'non_finite' {
  if (embedding.length !== 768) return 'wrong_dimension';
  if (!embedding.every(Number.isFinite)) return 'non_finite';
  return 'valid';
}

export function canProjectEvidenceEmbeddingToQdrantV1(
  embedding: readonly number[],
  postgresStored: boolean
): boolean {
  return postgresStored && validateEvidenceEmbeddingV1(embedding) === 'valid';
}

export function buildEvidenceIndexingReceiptV1(input: EvidenceIndexingReceiptInputV1): {
  hasWarnings: boolean;
  message: string;
} {
  const hasWarnings =
    input.embeddedCount < input.totalChunks ||
    input.pgVectorFailures > 0 ||
    input.qdrantStatus === 'failed';
  const qdrantResult =
    input.qdrantStatus === 'indexed'
      ? `${input.qdrantPointCount} point(s) indexed`
      : input.qdrantStatus === 'failed'
        ? `${input.qdrantPointCount} point(s) failed`
        : 'not attempted';

  return {
    hasWarnings,
    message: `${hasWarnings ? 'Complete with indexing warnings' : 'Complete'}: ${input.embeddedCount}/${input.totalChunks} chunk(s) embedded; PostgreSQL ${input.pgVectorStored} stored, ${input.pgVectorFailures} failed; Qdrant ${qdrantResult}`,
  };
}
