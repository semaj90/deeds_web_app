import { createHash } from 'node:crypto';

export const EMBEDDING_PROVENANCE_STATUS_VALUES = [
  'PROVEN',
  'PROVEN_FOR_GENERATION',
  'MIXED_HISTORY',
  'PARTIAL',
  'UNPROVEN',
] as const;

export type EmbeddingProvenanceStatusV1 =
  (typeof EMBEDDING_PROVENANCE_STATUS_VALUES)[number];

export const EMBEDDING_PROVENANCE_EVIDENCE_LEVEL_VALUES = [
  'COLLECTION_ONLY',
  'WRITER_ONLY',
  'PAYLOAD_OBSERVED',
  'PACKET_LINKED',
  'NUMERICALLY_CORROBORATED',
] as const;

export type EmbeddingProvenanceEvidenceLevelV1 =
  (typeof EMBEDDING_PROVENANCE_EVIDENCE_LEVEL_VALUES)[number];

export interface EmbeddingProvenanceCohortInputV1 {
  collection: string;
  vector_name: string;
  point_id_generation: string;
  writer_generation: string;
  writer_revision: string | null;
  projection_revision: string | null;
  representation_id: string | null;
  representation_revision: string | number | null;
  point_count: number;
  sample_count: number;
  model_id: string | null;
  model_artifact_digest: string | null;
  embedding_runtime: string | null;
  embedding_runtime_revision: string | null;
  prompt_mode: string | null;
  prompt_revision: string | null;
  normalization: string | null;
  normalization_revision: string | null;
  exact_packet_links: number;
  unresolved_links: number;
  evidence_level: EmbeddingProvenanceEvidenceLevelV1;
  mixed_fields?: readonly string[];
}

export interface EmbeddingProvenanceCohortV1
  extends EmbeddingProvenanceCohortInputV1 {
  schema_id: 'atlas.embedding.provenance.cohort.v1';
  status: EmbeddingProvenanceStatusV1;
  canonical_authority: false;
  checksum: string;
}

const EVIDENCE_RANK: Record<EmbeddingProvenanceEvidenceLevelV1, number> = {
  COLLECTION_ONLY: 0,
  WRITER_ONLY: 1,
  PAYLOAD_OBSERVED: 2,
  PACKET_LINKED: 3,
  NUMERICALLY_CORROBORATED: 4,
};

function nonEmpty(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function checksumEmbeddingProvenanceCohortV1(
  value: Omit<EmbeddingProvenanceCohortV1, 'checksum'>,
): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

export function classifyEmbeddingProvenanceCohortV1(
  input: EmbeddingProvenanceCohortInputV1,
): EmbeddingProvenanceStatusV1 {
  const mixedFields = input.mixed_fields ?? [];
  if (mixedFields.length > 0) return 'MIXED_HISTORY';

  const generationIdentityComplete =
    nonEmpty(input.writer_generation) &&
    nonEmpty(input.writer_revision) &&
    nonEmpty(input.representation_id) &&
    input.representation_revision !== null &&
    input.representation_revision !== '' &&
    nonEmpty(input.model_id) &&
    nonEmpty(input.model_artifact_digest) &&
    nonEmpty(input.embedding_runtime) &&
    nonEmpty(input.embedding_runtime_revision) &&
    nonEmpty(input.prompt_mode) &&
    nonEmpty(input.prompt_revision) &&
    nonEmpty(input.normalization) &&
    nonEmpty(input.normalization_revision);

  const everyObservedPointLinked =
    input.sample_count > 0 &&
    input.exact_packet_links === input.sample_count &&
    input.unresolved_links === 0;

  if (
    generationIdentityComplete &&
    everyObservedPointLinked &&
    input.evidence_level === 'NUMERICALLY_CORROBORATED'
  ) {
    return 'PROVEN';
  }

  if (
    generationIdentityComplete &&
    everyObservedPointLinked &&
    EVIDENCE_RANK[input.evidence_level] >= EVIDENCE_RANK.PACKET_LINKED
  ) {
    return 'PROVEN_FOR_GENERATION';
  }

  const hasMeaningfulProvenance =
    EVIDENCE_RANK[input.evidence_level] >= EVIDENCE_RANK.WRITER_ONLY ||
    nonEmpty(input.model_id) ||
    nonEmpty(input.writer_revision) ||
    nonEmpty(input.representation_id) ||
    nonEmpty(input.prompt_mode) ||
    nonEmpty(input.normalization);

  return hasMeaningfulProvenance ? 'PARTIAL' : 'UNPROVEN';
}

export function buildEmbeddingProvenanceCohortV1(
  input: EmbeddingProvenanceCohortInputV1,
): EmbeddingProvenanceCohortV1 {
  if (!nonEmpty(input.collection)) throw new Error('collection is required');
  if (!nonEmpty(input.vector_name)) throw new Error('vector_name is required');
  if (!nonEmpty(input.point_id_generation)) {
    throw new Error('point_id_generation is required');
  }
  if (!nonEmpty(input.writer_generation)) {
    throw new Error('writer_generation is required');
  }

  requireNonNegativeInteger('point_count', input.point_count);
  requireNonNegativeInteger('sample_count', input.sample_count);
  requireNonNegativeInteger('exact_packet_links', input.exact_packet_links);
  requireNonNegativeInteger('unresolved_links', input.unresolved_links);

  if (input.sample_count > input.point_count && input.point_count !== 0) {
    throw new Error('sample_count cannot exceed point_count');
  }
  if (input.exact_packet_links + input.unresolved_links > input.sample_count) {
    throw new Error('link counts cannot exceed sample_count');
  }

  const withoutChecksum: Omit<EmbeddingProvenanceCohortV1, 'checksum'> = {
    schema_id: 'atlas.embedding.provenance.cohort.v1',
    ...input,
    mixed_fields: [...(input.mixed_fields ?? [])].sort(),
    status: classifyEmbeddingProvenanceCohortV1(input),
    canonical_authority: false,
  };

  return {
    ...withoutChecksum,
    checksum: checksumEmbeddingProvenanceCohortV1(withoutChecksum),
  };
}

export function verifyEmbeddingProvenanceCohortV1(
  cohort: EmbeddingProvenanceCohortV1,
): boolean {
  const { checksum, ...withoutChecksum } = cohort;
  return checksum === checksumEmbeddingProvenanceCohortV1(withoutChecksum);
}
