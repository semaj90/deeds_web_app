import { createHash } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import { deriveUUID } from '$lib/utils/uuid.js';

export const EVIDENCE_MULTIMODAL_EMBEDDING_TYPE_V1 = 'evidence_multimodal_semantic_768' as const;
export const EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1 = 'evidence_multimodal_semantic_768' as const;
export const EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1 = 'evidence-multimodal-qdrant-projection-v1' as const;

export type EvidenceMultimodalModalityV1 = 'image' | 'video_frame' | 'audio_segment' | 'video_window' | 'document_chunk';

export interface EvidenceMultimodalVectorInputV1 {
  evidenceId: string;
  caseId: string;
  sourceRevision: string;
  analysisRevision: string;
  modality: EvidenceMultimodalModalityV1;
  sourceLocator: Record<string, unknown>;
  embedding: number[];
  model: string;
  modelArtifactSha256: string;
  preprocessingRevision: string;
  inputSha256: string;
  outputSha256: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceMultimodalExecuteV1 {
  execute(query: SQL): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface EvidenceMultimodalDatabaseV1 extends EvidenceMultimodalExecuteV1 {
  transaction<T>(operation: (transaction: EvidenceMultimodalExecuteV1) => Promise<T>): Promise<T>;
}

const SHA256_REF = /^sha256:[0-9a-f]{64}$/;
const MODALITIES = new Set<EvidenceMultimodalModalityV1>(['image', 'video_frame', 'audio_segment', 'video_window', 'document_chunk']);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('EVIDENCE_MULTIMODAL_LOCATOR_NONFINITE_NUMBER');
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('EVIDENCE_MULTIMODAL_LOCATOR_UNSERIALIZABLE');
  return serialized;
}

function validateInput(input: EvidenceMultimodalVectorInputV1): Float32Array {
  if (!input.evidenceId || !input.caseId) throw new Error('EVIDENCE_MULTIMODAL_IDENTITY_REQUIRED');
  if (!SHA256_REF.test(input.sourceRevision)) throw new Error('EVIDENCE_MULTIMODAL_SOURCE_REVISION_INVALID');
  if (!input.analysisRevision.trim()) throw new Error('EVIDENCE_MULTIMODAL_ANALYSIS_REVISION_REQUIRED');
  if (!MODALITIES.has(input.modality)) throw new Error('EVIDENCE_MULTIMODAL_MODALITY_INVALID');
  if (!input.sourceLocator || Array.isArray(input.sourceLocator) || typeof input.sourceLocator !== 'object') {
    throw new Error('EVIDENCE_MULTIMODAL_SOURCE_LOCATOR_INVALID');
  }
  if (!input.model.trim() || !input.preprocessingRevision.trim()) throw new Error('EVIDENCE_MULTIMODAL_MODEL_PROVENANCE_REQUIRED');
  if (!SHA256_REF.test(input.modelArtifactSha256) || !SHA256_REF.test(input.inputSha256) || !SHA256_REF.test(input.outputSha256)) {
    throw new Error('EVIDENCE_MULTIMODAL_CHECKSUM_INVALID');
  }
  return validateSemantic768OutputV1(input.embedding);
}

function readFloat4Array(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const body = value.slice(1, -1);
    return body.length === 0 ? [] : body.split(',').map(Number);
  }
  throw new Error('EVIDENCE_MULTIMODAL_READBACK_INVALID_FLOAT4_ARRAY');
}

/** Persist canonical PostgreSQL vector + downstream projection intent atomically. This function never calls Qdrant. */
export async function persistEvidenceMultimodalVectorV1(
  database: EvidenceMultimodalDatabaseV1,
  input: EvidenceMultimodalVectorInputV1,
): Promise<{ id: string; qdrantPointId: string; outputSha256: string; sourceLocatorSha256: string }> {
  const vector = validateInput(input);
  const outputSha256 = digestSemantic768OutputV1(vector);
  if (input.outputSha256 !== outputSha256) throw new Error('EVIDENCE_MULTIMODAL_OUTPUT_CHECKSUM_MISMATCH');
  const locatorJson = stableJson(input.sourceLocator);
  const sourceLocatorSha256 = createHash('sha256').update(locatorJson, 'utf8').digest('hex');
  const vectorLiteral = `[${Array.from(vector).join(',')}]`;
  const qdrantPointId = await deriveUUID('atlas.evidence-multimodal-vector.qdrant-point.v1', {
    evidenceId: input.evidenceId,
    sourceRevision: input.sourceRevision,
    analysisRevision: input.analysisRevision,
    modality: input.modality,
    sourceLocatorSha256,
    modelArtifactSha256: input.modelArtifactSha256,
    preprocessingRevision: input.preprocessingRevision,
  });

  return database.transaction(async (transaction) => {
    const source = await transaction.execute(sql`
      SELECT id::text AS evidence_id, case_id::text AS case_id, hash, deleted_at
      FROM evidence
      WHERE id = ${input.evidenceId}::uuid
      FOR UPDATE
    `);
    if (source.rows.length !== 1) throw new Error('EVIDENCE_MULTIMODAL_SOURCE_NOT_FOUND');
    const sourceRow = source.rows[0];
    const storedHash = String(sourceRow.hash ?? '').replace(/^sha256:/, '').toLowerCase();
    if (
      sourceRow.case_id !== input.caseId
      || sourceRow.deleted_at != null
      || storedHash !== input.sourceRevision.slice('sha256:'.length)
    ) throw new Error('EVIDENCE_MULTIMODAL_SOURCE_REVISION_OR_CASE_MISMATCH');

    await transaction.execute(sql`
      INSERT INTO evidence_multimodal_vectors (
        evidence_id, source_revision, analysis_revision, modality, source_locator,
        source_locator_sha256, embedding, embedding_type, model, model_artifact_sha256,
        preprocessing_revision, input_sha256, output_sha256, metadata
      ) VALUES (
        ${input.evidenceId}::uuid, ${input.sourceRevision}, ${input.analysisRevision}, ${input.modality},
        ${locatorJson}::jsonb, ${sourceLocatorSha256}, ${`[${Array.from(vector).join(',')}]`}::vector,
        ${EVIDENCE_MULTIMODAL_EMBEDDING_TYPE_V1}, ${input.model}, ${input.modelArtifactSha256},
        ${input.preprocessingRevision}, ${input.inputSha256}, ${outputSha256}, ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
      ON CONFLICT (
        evidence_id, source_revision, analysis_revision, modality, source_locator_sha256,
        model_artifact_sha256, preprocessing_revision
      ) DO UPDATE SET updated_at = clock_timestamp()
      WHERE evidence_multimodal_vectors.output_sha256 = EXCLUDED.output_sha256
        AND evidence_multimodal_vectors.input_sha256 = EXCLUDED.input_sha256
        AND evidence_multimodal_vectors.model = EXCLUDED.model
    `);

    const readback = await transaction.execute(sql`
      SELECT evidence_multimodal_vectors.id::text AS id,
        evidence_multimodal_vectors.evidence_id::text AS evidence_id, evidence.case_id::text AS case_id,
        source_revision, analysis_revision, modality, source_locator_sha256,
        vector_dims(evidence_multimodal_vectors.embedding) AS dimension,
        vector_to_float4(evidence_multimodal_vectors.embedding, 768, false) AS embedding_float4,
        model, model_artifact_sha256, preprocessing_revision, input_sha256, output_sha256
      FROM evidence_multimodal_vectors
      JOIN evidence ON evidence.id = evidence_multimodal_vectors.evidence_id
      WHERE evidence_multimodal_vectors.evidence_id = ${input.evidenceId}::uuid
        AND evidence_multimodal_vectors.source_revision = ${input.sourceRevision}
        AND evidence_multimodal_vectors.analysis_revision = ${input.analysisRevision}
        AND evidence_multimodal_vectors.modality = ${input.modality}
        AND evidence_multimodal_vectors.source_locator_sha256 = ${sourceLocatorSha256}
        AND evidence_multimodal_vectors.model_artifact_sha256 = ${input.modelArtifactSha256}
        AND evidence_multimodal_vectors.preprocessing_revision = ${input.preprocessingRevision}
      LIMIT 2
    `);
    if (readback.rows.length !== 1) throw new Error(`EVIDENCE_MULTIMODAL_READBACK_NOT_UNIQUE:${readback.rows.length}`);
    const row = readback.rows[0];
    if (
      row.case_id !== input.caseId || row.source_revision !== input.sourceRevision
      || row.analysis_revision !== input.analysisRevision || row.modality !== input.modality
      || row.source_locator_sha256 !== sourceLocatorSha256 || Number(row.dimension) !== 768
      || row.model !== input.model || row.model_artifact_sha256 !== input.modelArtifactSha256
      || row.preprocessing_revision !== input.preprocessingRevision || row.input_sha256 !== input.inputSha256
      || row.output_sha256 !== outputSha256
    ) throw new Error('EVIDENCE_MULTIMODAL_READBACK_IDENTITY_MISMATCH');
    if (digestSemantic768OutputV1(validateSemantic768OutputV1(readFloat4Array(row.embedding_float4))) !== outputSha256) {
      throw new Error('EVIDENCE_MULTIMODAL_READBACK_CHECKSUM_MISMATCH');
    }

    await transaction.execute(sql`
      INSERT INTO evidence_multimodal_vector_projection_outbox (
        evidence_multimodal_vector_id, qdrant_point_id, projection_lane, projection_contract_revision,
        source_revision, analysis_revision, modality, source_locator_sha256, model_artifact_sha256,
        preprocessing_revision, input_sha256, output_sha256
      ) VALUES (
        ${row.id}::uuid, ${qdrantPointId}::uuid, ${EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1},
        ${EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1}, ${input.sourceRevision}, ${input.analysisRevision},
        ${input.modality}, ${sourceLocatorSha256}, ${input.modelArtifactSha256},
        ${input.preprocessingRevision}, ${input.inputSha256}, ${outputSha256}
      ) ON CONFLICT (evidence_multimodal_vector_id, projection_lane, projection_contract_revision) DO NOTHING
    `);
    const outbox = await transaction.execute(sql`
      SELECT qdrant_point_id::text AS qdrant_point_id, source_revision, analysis_revision, modality,
        source_locator_sha256, model_artifact_sha256, preprocessing_revision, input_sha256, output_sha256
      FROM evidence_multimodal_vector_projection_outbox
      WHERE evidence_multimodal_vector_id = ${row.id}::uuid
        AND projection_lane = ${EVIDENCE_MULTIMODAL_PROJECTION_LANE_V1}
        AND projection_contract_revision = ${EVIDENCE_MULTIMODAL_PROJECTION_CONTRACT_V1}
      LIMIT 2
    `);
    if (outbox.rows.length !== 1) throw new Error(`EVIDENCE_MULTIMODAL_OUTBOX_READBACK_NOT_UNIQUE:${outbox.rows.length}`);
    const ticket = outbox.rows[0];
    if (
      ticket.qdrant_point_id !== qdrantPointId || ticket.source_revision !== input.sourceRevision
      || ticket.analysis_revision !== input.analysisRevision || ticket.modality !== input.modality
      || ticket.source_locator_sha256 !== sourceLocatorSha256 || ticket.model_artifact_sha256 !== input.modelArtifactSha256
      || ticket.preprocessing_revision !== input.preprocessingRevision || ticket.input_sha256 !== input.inputSha256
      || ticket.output_sha256 !== outputSha256
    ) throw new Error('EVIDENCE_MULTIMODAL_OUTBOX_READBACK_IDENTITY_MISMATCH');

    return { id: String(row.id), qdrantPointId, outputSha256, sourceLocatorSha256 };
  });
}
