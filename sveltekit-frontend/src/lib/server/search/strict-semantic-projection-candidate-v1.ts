import { z } from 'zod';

export const STRICT_SEMANTIC_PROJECTION_CANDIDATE_V1 =
  'atlas.strict-semantic-projection-candidate.v1' as const;

const uuid = z.string().uuid();

export const strictSemanticProjectionCandidateV1Schema = z.object({
  schema: z.literal(STRICT_SEMANTIC_PROJECTION_CANDIDATE_V1),
  physicalPointId: z.string().min(1),
  postgresId: uuid.nullable(),
  chunkId: z.string().min(1).nullable(),
  sourceRef: z.string().min(1).nullable(),
  contentHash: z.string().min(1).nullable(),
  score: z.number().finite(),
  representationName: z.string().min(1).nullable(),
  representationRevision: z.string().min(1).nullable(),
  projectionRevision: z.string().min(1).nullable(),
  modelRevision: z.string().min(1).nullable(),
  modelRevisionState: z.string().min(1).nullable(),
  identityMissing: z.boolean(),
}).strict();

export type StrictSemanticProjectionCandidateV1 = z.infer<
  typeof strictSemanticProjectionCandidateV1Schema
>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nonEmpty(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Strict projection mapping for revision-qualified ACE admission.
 *
 * This deliberately does not trust payload workspace/source revisions as
 * authority. They are projection metadata only. Canonical workspace/source
 * lineage is joined from PostgreSQL by hydrateRevisionQualifiedCandidatesV1().
 */
export function mapStrictSemanticProjectionCandidateV1(point: {
  id: string | number;
  score?: number | null;
  payload?: Record<string, unknown> | null;
}): StrictSemanticProjectionCandidateV1 {
  const payload = point.payload ?? {};
  const postgresIdRaw = nonEmpty(payload.postgres_id);
  const postgresId = postgresIdRaw && UUID_RE.test(postgresIdRaw) ? postgresIdRaw : null;

  return strictSemanticProjectionCandidateV1Schema.parse({
    schema: STRICT_SEMANTIC_PROJECTION_CANDIDATE_V1,
    physicalPointId: String(point.id),
    postgresId,
    chunkId: nonEmpty(payload.chunk_id),
    sourceRef: nonEmpty(payload.source_ref),
    contentHash: nonEmpty(payload.content_hash),
    score: Number(point.score ?? 0),
    representationName: nonEmpty(payload.representation_name ?? payload.representation_id),
    representationRevision: nonEmpty(payload.representation_revision),
    projectionRevision: nonEmpty(payload.projection_revision),
    modelRevision: nonEmpty(payload.model_revision ?? payload.embedding_model),
    modelRevisionState: nonEmpty(payload.model_revision_state),
    identityMissing: postgresId === null,
  });
}
