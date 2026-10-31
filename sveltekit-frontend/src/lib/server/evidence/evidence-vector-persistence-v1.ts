import { sql, type SQL } from 'drizzle-orm';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  assertEvidenceEmbeddingAdmitted,
  EVIDENCE_EMBEDDING_TYPE,
  evidenceQdrantPointId,
  EVIDENCE_SEMANTIC_DIMENSION,
  EVIDENCE_SOURCE_FIELD,
  type EvidenceEmbeddingProvenance,
} from './evidence-embedding-contract.js';

export interface EvidenceVectorExecuteV1 {
  execute(query: SQL): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface EvidenceVectorDatabaseV1 extends EvidenceVectorExecuteV1 {
  transaction<T>(operation: (transaction: EvidenceVectorExecuteV1) => Promise<T>): Promise<T>;
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

export const EVIDENCE_VECTOR_PROJECTION_LANE_V1 = 'evidence_semantic_768';
export const EVIDENCE_VECTOR_PROJECTION_CONTRACT_V1 = 'evidence-qdrant-projection-v1';

function readFloat4Array(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const body = value.slice(1, -1);
    return body.length === 0 ? [] : body.split(',').map(Number);
  }
  throw new Error('EVIDENCE_VECTOR_READBACK_INVALID_FLOAT4_ARRAY');
}

export async function persistEvidenceVectorForProjectionV1(
  database: EvidenceVectorDatabaseV1,
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

  return database.transaction(async (transaction) => {
    await transaction.execute(sql`
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

    const result = await transaction.execute(sql`
    SELECT
      id::text AS evidence_vector_id,
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

    const qdrantPointId = await evidenceQdrantPointId({
    evidenceId: input.evidenceId,
    sourceRevision: input.sourceRevision,
    chunkIndex: input.chunkIndex,
    modelArtifactSha256: input.provenance.modelArtifactSha256,
    });
    await transaction.execute(sql`
    INSERT INTO evidence_vector_projection_outbox (
      evidence_vector_id, qdrant_point_id, projection_lane, projection_contract_revision,
      source_revision, chunk_index, output_sha256, model_artifact_sha256,
      input_recipe_revision, input_sha256
    )
    SELECT id, ${qdrantPointId}::uuid, ${EVIDENCE_VECTOR_PROJECTION_LANE_V1},
      ${EVIDENCE_VECTOR_PROJECTION_CONTRACT_V1}, source_revision, chunk_index,
      ${expectedOutputChecksum}, ${input.provenance.modelArtifactSha256},
      ${input.provenance.inputRecipeRevision}, ${input.provenance.inputSha256}
    FROM evidence_vectors
    WHERE id = ${row.evidence_vector_id}::uuid
      AND evidence_id = ${input.evidenceId}
      AND source_revision = ${input.sourceRevision}
      AND chunk_index = ${input.chunkIndex}
      AND metadata->>'embedding_output_sha256' = ${expectedOutputChecksum}
    ON CONFLICT (evidence_vector_id, projection_lane, projection_contract_revision) DO NOTHING
    `);

    const outboxReadback = await transaction.execute(sql`
    SELECT qdrant_point_id::text AS qdrant_point_id, source_revision, chunk_index,
      output_sha256, model_artifact_sha256, input_recipe_revision, input_sha256
    FROM evidence_vector_projection_outbox
    WHERE evidence_vector_id = ${row.evidence_vector_id}::uuid
      AND projection_lane = ${EVIDENCE_VECTOR_PROJECTION_LANE_V1}
      AND projection_contract_revision = ${EVIDENCE_VECTOR_PROJECTION_CONTRACT_V1}
    LIMIT 2
    `);
    if (outboxReadback.rows.length !== 1) {
      throw new Error(`EVIDENCE_VECTOR_OUTBOX_READBACK_NOT_UNIQUE:${outboxReadback.rows.length}`);
    }
    const outboxRow = outboxReadback.rows[0];
    if (
    outboxRow.qdrant_point_id !== qdrantPointId
    || outboxRow.source_revision !== input.sourceRevision
    || Number(outboxRow.chunk_index) !== input.chunkIndex
    || outboxRow.output_sha256 !== expectedOutputChecksum
    || outboxRow.model_artifact_sha256 !== input.provenance.modelArtifactSha256
    || outboxRow.input_recipe_revision !== input.provenance.inputRecipeRevision
    || outboxRow.input_sha256 !== input.provenance.inputSha256
    ) {
      throw new Error('EVIDENCE_VECTOR_OUTBOX_READBACK_IDENTITY_MISMATCH');
    }
    return Array.from(persistedVector);
  });
}
