import { sql, type SQL } from 'drizzle-orm';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  assertEvidenceEmbeddingAdmitted,
  EVIDENCE_EMBEDDING_TYPE,
  EVIDENCE_SEMANTIC_DIMENSION,
  EVIDENCE_SOURCE_FIELD,
  type EvidenceEmbeddingProvenance,
} from './evidence-embedding-contract.js';

export interface EvidenceVectorExecuteV1 {
  execute(query: SQL): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface PersistEvidenceVectorInputV1 {
  evidenceId: string;
  sourceRevision: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  model: string;
  outputChecksum: string;
  provenance: EvidenceEmbeddingProvenance;
  metadata: Record<string, unknown>;
}

function readFloat4Array(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const body = value.slice(1, -1);
    return body.length === 0 ? [] : body.split(',').map(Number);
  }
  throw new Error('EVIDENCE_VECTOR_READBACK_INVALID_FLOAT4_ARRAY');
}

export async function persistEvidenceVectorForProjectionV1(
  database: EvidenceVectorExecuteV1,
  input: PersistEvidenceVectorInputV1,
): Promise<number[]> {
  const admitted = assertEvidenceEmbeddingAdmitted({
    evidenceId: input.evidenceId,
    sourceRevision: input.sourceRevision,
    chunkIndex: input.chunkIndex,
    content: input.content,
    vector: input.embedding,
    provenance: input.provenance,
  });
  const producerVector = validateSemantic768OutputV1(input.embedding);
  const expectedOutputChecksum = digestSemantic768OutputV1(producerVector);
  if (input.outputChecksum !== expectedOutputChecksum) {
    throw new Error('EVIDENCE_VECTOR_PRODUCER_CHECKSUM_MISMATCH');
  }
  const metadata = { ...input.metadata, embedding_output_sha256: expectedOutputChecksum };
  const vectorLiteral = `[${Array.from(producerVector).join(',')}]`;

  await database.execute(sql`
    INSERT INTO evidence_vectors (
      evidence_id, chunk_index, content, embedding, analysis_type, metadata, model,
      source_revision, embedding_type, source_field
    )
    VALUES (
      ${input.evidenceId}, ${input.chunkIndex}, ${input.content}, ${vectorLiteral}::vector,
      'upload-embedding', ${JSON.stringify(metadata)}::jsonb, ${input.model},
      ${input.sourceRevision}, ${admitted.embeddingType}, ${admitted.sourceField}
    )
    ON CONFLICT (evidence_id, source_revision, chunk_index)
      WHERE source_revision IS NOT NULL AND chunk_index IS NOT NULL
    DO UPDATE SET
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      analysis_type = EXCLUDED.analysis_type,
      metadata = EXCLUDED.metadata,
      model = EXCLUDED.model
    WHERE evidence_vectors.metadata->'embedding_provenance'->>'modelArtifactSha256'
            = EXCLUDED.metadata->'embedding_provenance'->>'modelArtifactSha256'
      AND evidence_vectors.metadata->>'embedding_output_sha256'
            = EXCLUDED.metadata->>'embedding_output_sha256'
  `);

  const result = await database.execute(sql`
    SELECT
      vector_dims(embedding) AS dimension,
      vector_to_float4(embedding, ${EVIDENCE_SEMANTIC_DIMENSION}, false) AS embedding_float4,
      content,
      model,
      source_revision,
      embedding_type,
      source_field,
      metadata->>'embedding_output_sha256' AS output_checksum,
      metadata->'embedding_provenance'->>'modelArtifactSha256' AS model_artifact_sha256,
      metadata->'embedding_provenance'->>'inputSha256' AS input_sha256
    FROM evidence_vectors
    WHERE evidence_id = ${input.evidenceId}
      AND source_revision = ${input.sourceRevision}
      AND chunk_index = ${input.chunkIndex}
      AND content = ${input.content}
      AND model = ${input.model}
      AND embedding_type = ${EVIDENCE_EMBEDDING_TYPE}
      AND source_field = ${EVIDENCE_SOURCE_FIELD}
      AND metadata->>'embedding_output_sha256' = ${expectedOutputChecksum}
      AND metadata->'embedding_provenance'->>'modelArtifactSha256' = ${input.provenance.modelArtifactSha256}
      AND metadata->'embedding_provenance'->>'inputSha256' = ${input.provenance.inputSha256}
    LIMIT 2
  `);

  if (result.rows.length !== 1) {
    throw new Error(`EVIDENCE_VECTOR_COMMITTED_READBACK_NOT_UNIQUE:${result.rows.length}`);
  }
  const row = result.rows[0];
  if (
    Number(row.dimension) !== EVIDENCE_SEMANTIC_DIMENSION
    || row.content !== input.content
    || row.model !== input.model
    || row.source_revision !== input.sourceRevision
    || row.embedding_type !== EVIDENCE_EMBEDDING_TYPE
    || row.source_field !== EVIDENCE_SOURCE_FIELD
    || row.output_checksum !== expectedOutputChecksum
    || row.model_artifact_sha256 !== input.provenance.modelArtifactSha256
    || row.input_sha256 !== input.provenance.inputSha256
  ) {
    throw new Error('EVIDENCE_VECTOR_COMMITTED_READBACK_IDENTITY_MISMATCH');
  }

  const persistedVector = validateSemantic768OutputV1(readFloat4Array(row.embedding_float4));
  if (digestSemantic768OutputV1(persistedVector) !== expectedOutputChecksum) {
    throw new Error('EVIDENCE_VECTOR_COMMITTED_READBACK_CHECKSUM_MISMATCH');
  }
  return Array.from(persistedVector);
}
