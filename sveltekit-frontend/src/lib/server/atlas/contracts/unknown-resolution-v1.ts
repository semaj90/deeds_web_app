import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { candidateOrdinalMapChecksum, compareUtf8 } from '../features/canonical-candidate-v1.js';
import { UNKNOWN_RESOLUTION_NAMESPACE_V1 } from '../identity/atlas-uuid-namespaces-v1.js';

/**
 * UnknownResolutionV1 — a shared LOGICAL contract for typed missing-evidence requirements. It is deliberately not a
 * table: each subject kind keeps its semantically correct storage owner (PACKET_IDENTITY stays in unknown_packets /
 * unknown_resolution_ledger; FEATURE_EVIDENCE_GAP is a checksummed artifact until durable claiming/leases/retries are
 * demonstrably needed). It never carries a value: null is not zero, and a guessed value is not evidence.
 */
export const UNKNOWN_RESOLUTION_SCHEMA_V1 = 'atlas.unknown-resolution.v1' as const;
export const UNKNOWN_RESOLUTION_SET_SCHEMA_V1 = 'atlas.unknown-resolution-set.v1' as const;

export const UNKNOWN_SUBJECT_KINDS_V1 = [
  'PACKET_IDENTITY', 'FEATURE_EVIDENCE_GAP', 'PINNED_DOC_GAP', 'OPENWIKI_CLAIM_STALE', 'ONTOLOGY_RESOLUTION_GAP', 'HUMAN_REVIEW_REQUIRED',
] as const;
export const UNKNOWN_STATUSES_V1 = ['OPEN', 'RESOLVING', 'RESOLVED', 'BLOCKED', 'SUPERSEDED'] as const;
export const UNKNOWN_RESOLVER_KINDS_V1 = [
  'SOURCE_LINEAGE_REPAIR', 'SUMMARY_GENERATION', 'PINNED_DOC_CRAWL', 'OPENWIKI_REFRESH', 'ONTOLOGY_RESOLUTION', 'PACKET_PROMOTION_PIPELINE', 'HUMAN_LABEL', 'UNASSIGNED',
] as const;

/** Closed reason vocabulary: routing keys off this enum, never off free-form strings. */
export const UNKNOWN_REASON_CODES_V1 = [
  'NO_PROVEN_CHUNK_LINEAGE', 'CHUNK_WITHOUT_QUALIFIED_SUMMARY', 'PACKET_IDENTITY_UNRESOLVED', 'PINNED_DOCUMENTATION_MISSING',
  'OPENWIKI_CLAIM_STALE', 'ONTOLOGY_RESOLUTION_UNAVAILABLE', 'HUMAN_JUDGMENT_REQUIRED',
] as const;
export type UnknownReasonCodeV1 = (typeof UNKNOWN_REASON_CODES_V1)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const unknownResolutionV1Schema = z.object({
  schema: z.literal(UNKNOWN_RESOLUTION_SCHEMA_V1),
  /** Deterministic UUIDv5 of the natural key. An idempotent-upsert surrogate — never identity. */
  unknownId: z.string().regex(UUID_RE),
  subjectKind: z.enum(UNKNOWN_SUBJECT_KINDS_V1),
  subjectId: z.string().min(1),
  snapshotRevision: z.string().min(1).nullable(),
  unknownKind: z.string().min(1),
  featureName: z.string().min(1).nullable(),
  reasonCode: z.enum(UNKNOWN_REASON_CODES_V1),
  requiredEvidenceKind: z.string().min(1),
  resolverKind: z.enum(UNKNOWN_RESOLVER_KINDS_V1),
  status: z.enum(UNKNOWN_STATUSES_V1),
  evidenceRefs: z.array(z.string().min(1)),
  resolutionRevision: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((u, ctx) => {
  if (u.subjectKind !== 'PACKET_IDENTITY' && u.snapshotRevision === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['snapshotRevision'], message: 'SNAPSHOT_REVISION_REQUIRED_FOR_NON_PACKET_IDENTITY' });
  }
  if (u.subjectKind === 'FEATURE_EVIDENCE_GAP' && u.featureName === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureName'], message: 'FEATURE_NAME_REQUIRED_FOR_FEATURE_EVIDENCE_GAP' });
  }
  if (u.status === 'RESOLVED' && u.resolutionRevision === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionRevision'], message: 'RESOLUTION_REVISION_REQUIRED_WHEN_RESOLVED' });
  }
});
export type UnknownResolutionV1 = z.infer<typeof unknownResolutionV1Schema>;

/** Reason -> resolver routing (design table for the later durable-workflow step; data only, no execution). */
export const UNKNOWN_REASON_RESOLVER_TABLE_V1: Readonly<Record<UnknownReasonCodeV1, { resolverKind: (typeof UNKNOWN_RESOLVER_KINDS_V1)[number]; requiredEvidenceKind: string }>> = {
  NO_PROVEN_CHUNK_LINEAGE: { resolverKind: 'SOURCE_LINEAGE_REPAIR', requiredEvidenceKind: 'PROVEN_PACKET_CHUNK_LINEAGE' },
  CHUNK_WITHOUT_QUALIFIED_SUMMARY: { resolverKind: 'SUMMARY_GENERATION', requiredEvidenceKind: 'QUALIFIED_CHUNK_SUMMARY' },
  PACKET_IDENTITY_UNRESOLVED: { resolverKind: 'PACKET_PROMOTION_PIPELINE', requiredEvidenceKind: 'PACKET_IDENTITY_PROOF' },
  PINNED_DOCUMENTATION_MISSING: { resolverKind: 'PINNED_DOC_CRAWL', requiredEvidenceKind: 'PINNED_SOURCE_DOCUMENT' },
  OPENWIKI_CLAIM_STALE: { resolverKind: 'OPENWIKI_REFRESH', requiredEvidenceKind: 'VERIFIED_GROUNDED_CLAIM' },
  ONTOLOGY_RESOLUTION_UNAVAILABLE: { resolverKind: 'ONTOLOGY_RESOLUTION', requiredEvidenceKind: 'RESOLVED_ONTOLOGY_CONCEPT' },
  HUMAN_JUDGMENT_REQUIRED: { resolverKind: 'HUMAN_LABEL', requiredEvidenceKind: 'HUMAN_REVIEW_DECISION' },
};

/**
 * unknownId = UUIDv5(UNKNOWN_RESOLUTION_NAMESPACE_V1, natural key joined by NUL). The namespace is frozen in
 * identity/atlas-uuid-namespaces-v1.ts (derived from ATLAS_ROOT_NAMESPACE_V1) and the standard `uuid` package computes the id,
 * matching packet-key-v2 and packet-write-transaction-v1. A surrogate for idempotent upsert — never identity.
 */
export { UNKNOWN_RESOLUTION_NAMESPACE_V1 };

export function unknownIdFromNaturalKeyV1(parts: readonly string[]): string {
  return uuidv5(parts.join('\u0000'), UNKNOWN_RESOLUTION_NAMESPACE_V1);
}

export const unknownResolutionSetV1Schema = z.object({
  schema: z.literal(UNKNOWN_RESOLUTION_SET_SCHEMA_V1),
  subjectKind: z.enum(UNKNOWN_SUBJECT_KINDS_V1),
  snapshotRevision: z.string().min(1).nullable(),
  ordinalMapChecksum: z.string().min(1).nullable(),
  /** Checksum of the sealed artifact that binds candidates to the coordinate system (e.g. candidate multiplicity). */
  coordinateArtifactChecksum: z.string().min(1).nullable(),
  rowCount: z.number().int().nonnegative(),
  rows: z.array(unknownResolutionV1Schema),
  inputChecksums: z.record(z.string().min(1), z.string().min(1)),
  producerRevision: z.string().min(1),
  setChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((s, ctx) => {
  // A feature gap is only meaningful relative to one candidate coordinate system: all three coordinates or none is invalid.
  if (s.subjectKind === 'FEATURE_EVIDENCE_GAP') {
    for (const k of ['snapshotRevision', 'ordinalMapChecksum', 'coordinateArtifactChecksum'] as const) {
      if (s[k] === null) ctx.addIssue({ code: 'custom', path: [k], message: `${k.toUpperCase()}_REQUIRED_FOR_FEATURE_EVIDENCE_GAP_SET` });
    }
  }
});
export type UnknownResolutionSetV1 = z.infer<typeof unknownResolutionSetV1Schema>;

const sortRows = (rows: readonly UnknownResolutionV1[]) => [...rows].sort((a, b) => compareUtf8(a.unknownId, b.unknownId));
const setBody = (s: Omit<UnknownResolutionSetV1, 'setChecksum'>) => s;

export function buildUnknownResolutionSetV1(input: {
  subjectKind: UnknownResolutionV1['subjectKind'];
  snapshotRevision: string | null;
  ordinalMapChecksum: string | null;
  coordinateArtifactChecksum: string | null;
  rows: readonly UnknownResolutionV1[];
  inputChecksums: Record<string, string>;
  producerRevision: string;
}): UnknownResolutionSetV1 {
  const rows = sortRows(input.rows.map((r) => unknownResolutionV1Schema.parse(r)));
  const ids = new Set(rows.map((r) => r.unknownId));
  if (ids.size !== rows.length) throw new Error('UNKNOWN_SET_DUPLICATE_UNKNOWN_ID');
  for (const r of rows) {
    if (r.subjectKind !== input.subjectKind) throw new Error(`UNKNOWN_SET_MIXED_SUBJECT_KIND:${r.subjectKind}`);
    if (r.snapshotRevision !== input.snapshotRevision) throw new Error('UNKNOWN_SET_MIXED_SNAPSHOT_REVISION');
  }
  const body = setBody({
    schema: UNKNOWN_RESOLUTION_SET_SCHEMA_V1, subjectKind: input.subjectKind, snapshotRevision: input.snapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum, coordinateArtifactChecksum: input.coordinateArtifactChecksum, rowCount: rows.length, rows, inputChecksums: input.inputChecksums,
    producerRevision: input.producerRevision, writesPerformed: false, canonicalAuthority: false,
  } as Omit<UnknownResolutionSetV1, 'setChecksum'>);
  return unknownResolutionSetV1Schema.parse({ ...body, setChecksum: candidateOrdinalMapChecksum(body) });
}

/** Rejects tampering (any row/field/count/coordinate change) and ordering that is not canonical. */
export function verifyUnknownResolutionSetV1(set: UnknownResolutionSetV1): void {
  const parsed = unknownResolutionSetV1Schema.parse(set);
  if (parsed.rowCount !== parsed.rows.length) throw new Error('UNKNOWN_SET_ROW_COUNT_MISMATCH');
  if (JSON.stringify(sortRows(parsed.rows)) !== JSON.stringify(parsed.rows)) throw new Error('UNKNOWN_SET_ROW_ORDER_INVALID');
  if (new Set(parsed.rows.map((r) => r.unknownId)).size !== parsed.rows.length) throw new Error('UNKNOWN_SET_DUPLICATE_UNKNOWN_ID');
  for (const r of parsed.rows) {
    if (r.subjectKind !== parsed.subjectKind) throw new Error(`UNKNOWN_SET_MIXED_SUBJECT_KIND:${r.subjectKind}`);
    if (r.snapshotRevision !== parsed.snapshotRevision) throw new Error('UNKNOWN_SET_MIXED_SNAPSHOT_REVISION');
  }
  const { setChecksum, ...body } = parsed;
  if (candidateOrdinalMapChecksum(body) !== setChecksum) throw new Error('UNKNOWN_SET_CHECKSUM_MISMATCH');
}

/** Minimal structural view of an unknown_packets row (raw snake_case). Kept structural so this module never imports the DB layer. */
export interface UnknownPacketRowLikeV1 {
  unknown_id: string;
  workspace_id: string;
  potential_source_ref: string;
  potential_packet_key?: string | null;
  status: string;
}

const PACKET_STATUS_MAP: Readonly<Record<string, UnknownResolutionV1['status']>> = {
  OBSERVATION: 'OPEN', CANDIDATE: 'RESOLVING', VALIDATED: 'RESOLVING', PROMOTED: 'RESOLVED', REJECTED: 'SUPERSEDED',
};

/** ADAPTER-01: existing unknown_packets lifecycle -> UnknownResolutionV1 (PACKET_IDENTITY). Pure and read-only. */
export function mapUnknownPacketRowToUnknownResolutionV1(row: UnknownPacketRowLikeV1, resolutionRevision: string | null = null): UnknownResolutionV1 {
  const status = PACKET_STATUS_MAP[row.status];
  if (!status) throw new Error(`UNKNOWN_PACKET_STATUS_UNMAPPED:${row.status}`);
  const route = UNKNOWN_REASON_RESOLVER_TABLE_V1.PACKET_IDENTITY_UNRESOLVED;
  return unknownResolutionV1Schema.parse({
    schema: UNKNOWN_RESOLUTION_SCHEMA_V1,
    unknownId: unknownIdFromNaturalKeyV1(['PACKET_IDENTITY', row.workspace_id, row.potential_source_ref]),
    subjectKind: 'PACKET_IDENTITY', subjectId: row.potential_packet_key ?? row.potential_source_ref, snapshotRevision: null,
    unknownKind: 'UNPROMOTED_PACKET_IDENTITY', featureName: null, reasonCode: 'PACKET_IDENTITY_UNRESOLVED',
    requiredEvidenceKind: route.requiredEvidenceKind, resolverKind: route.resolverKind, status,
    evidenceRefs: [`unknown_packets:${row.unknown_id}`], resolutionRevision: status === 'RESOLVED' ? (resolutionRevision ?? `unknown_packets:${row.unknown_id}:PROMOTED`) : resolutionRevision,
    canonicalAuthority: false,
  });
}

/**
 * JSON Schema projection of the strict row contract for Zod <-> Pydantic parity. NOTE: cross-field rules (superRefine) are
 * not representable in JSON Schema; the parity gate covers them with shared fixtures whose verdicts are recorded from Zod.
 */
export function unknownResolutionV1JsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(unknownResolutionV1Schema) as Record<string, unknown>;
}
