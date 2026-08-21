import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const GraphifyStructuralPersistenceColumnV1Schema = z.object({
  name: z.string().min(1),
  dataType: z.string().min(1),
  nullable: z.boolean(),
}).strict();

export const GraphifyStructuralPersistenceObservationV1Schema = z.object({
  schema: z.literal('atlas.graphify-structural-persistence-observation.v1'),
  tableExists: z.boolean(),
  columns: z.array(GraphifyStructuralPersistenceColumnV1Schema),
  sourceRevisionIndexPresent: z.boolean(),
  structuralRowCount: z.number().int().nonnegative(),
  suspiciousPseudoRevisionCount: z.number().int().nonnegative(),
  sampleEvidenceId: z.string().min(1).nullable(),
  repositoryReadbackStatus: z.enum(['NOT_ATTEMPTED', 'PROVEN', 'FAILED']),
  repositoryReadbackChecksum: sha256Schema.nullable(),
  revisionOwnerProven: z.boolean(),
  canonicalWriteAttempted: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type GraphifyStructuralPersistenceObservationV1 = z.infer<typeof GraphifyStructuralPersistenceObservationV1Schema>;

export const GraphifyStructuralPersistenceProofV1Schema = z.object({
  schema: z.literal('atlas.graphify-structural-persistence-proof.v1'),
  status: z.enum([
    'PERSISTENCE_OWNER_NOT_READY',
    'PERSISTENCE_OWNER_IDENTIFIED_NO_STRUCTURAL_ROWS_REVISION_BLOCKED',
    'PERSISTENCE_OWNER_IDENTIFIED_READBACK_PROVEN_REVISION_BLOCKED',
    'PERSISTENCE_OWNER_IDENTIFIED_READBACK_FAILED',
    'PERSISTENCE_OWNER_IDENTIFIED_PSEUDOREVISION_DETECTED',
    'CANONICAL_PERSISTENCE_READY',
  ]),
  persistenceOwner: z.literal('PARENT_ATLAS_ATLAS_EVIDENCE_LEDGER'),
  canonicalTable: z.literal('atlas_evidence'),
  tableExists: z.boolean(),
  requiredColumnsPresent: z.boolean(),
  sourceRevisionNotNull: z.boolean(),
  sourceRevisionIndexPresent: z.boolean(),
  repositoryReadbackExistingRowProven: z.boolean(),
  suspiciousPseudoRevisionCount: z.number().int().nonnegative(),
  revisionOwnerProven: z.boolean(),
  canonicalWriteAttempted: z.literal(false),
  canonicalPersistenceAuthorized: z.boolean(),
  blockers: z.array(z.string().min(1)),
  observation: GraphifyStructuralPersistenceObservationV1Schema,
  outputChecksum: sha256Schema,
}).strict();
export type GraphifyStructuralPersistenceProofV1 = z.infer<typeof GraphifyStructuralPersistenceProofV1Schema>;

const REQUIRED_COLUMNS = [
  'evidence_id',
  'evidence_kind',
  'source_ref',
  'source_revision',
  'evidence_revision',
  'producer_revision',
  'payload',
] as const;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function classifyGraphifyStructuralPersistenceProofV1(
  raw: GraphifyStructuralPersistenceObservationV1,
): GraphifyStructuralPersistenceProofV1 {
  const observation = GraphifyStructuralPersistenceObservationV1Schema.parse(raw);
  const columns = new Map(observation.columns.map((column) => [column.name, column]));
  const requiredColumnsPresent = REQUIRED_COLUMNS.every((name) => columns.has(name));
  const sourceRevisionNotNull = columns.get('source_revision')?.nullable === false;
  const repositoryReadbackExistingRowProven =
    observation.repositoryReadbackStatus === 'PROVEN'
    && observation.repositoryReadbackChecksum !== null;

  const blockers: string[] = [];
  if (!observation.tableExists) blockers.push('ATLAS_EVIDENCE_TABLE_MISSING');
  if (!requiredColumnsPresent) blockers.push('ATLAS_EVIDENCE_REQUIRED_COLUMNS_MISSING');
  if (!sourceRevisionNotNull) blockers.push('ATLAS_EVIDENCE_SOURCE_REVISION_NOT_NOT_NULL');
  if (!observation.sourceRevisionIndexPresent) blockers.push('ATLAS_EVIDENCE_SOURCE_REVISION_INDEX_MISSING');
  if (observation.suspiciousPseudoRevisionCount > 0) blockers.push('PSEUDOREVISION_ROWS_DETECTED');
  if (observation.repositoryReadbackStatus === 'FAILED') blockers.push('EXISTING_ROW_READBACK_FAILED');
  if (!observation.revisionOwnerProven) blockers.push('SOURCE_REVISION_OWNER_NOT_PROVEN');

  const storageReady =
    observation.tableExists
    && requiredColumnsPresent
    && sourceRevisionNotNull
    && observation.sourceRevisionIndexPresent;

  const canonicalPersistenceAuthorized =
    storageReady
    && observation.suspiciousPseudoRevisionCount === 0
    && observation.revisionOwnerProven;

  let status: GraphifyStructuralPersistenceProofV1['status'];
  if (!storageReady) {
    status = 'PERSISTENCE_OWNER_NOT_READY';
  } else if (observation.suspiciousPseudoRevisionCount > 0) {
    status = 'PERSISTENCE_OWNER_IDENTIFIED_PSEUDOREVISION_DETECTED';
  } else if (observation.repositoryReadbackStatus === 'FAILED') {
    status = 'PERSISTENCE_OWNER_IDENTIFIED_READBACK_FAILED';
  } else if (canonicalPersistenceAuthorized) {
    status = 'CANONICAL_PERSISTENCE_READY';
  } else if (repositoryReadbackExistingRowProven) {
    status = 'PERSISTENCE_OWNER_IDENTIFIED_READBACK_PROVEN_REVISION_BLOCKED';
  } else {
    status = 'PERSISTENCE_OWNER_IDENTIFIED_NO_STRUCTURAL_ROWS_REVISION_BLOCKED';
  }

  const payload = {
    schema: 'atlas.graphify-structural-persistence-proof.v1' as const,
    status,
    persistenceOwner: 'PARENT_ATLAS_ATLAS_EVIDENCE_LEDGER' as const,
    canonicalTable: 'atlas_evidence' as const,
    tableExists: observation.tableExists,
    requiredColumnsPresent,
    sourceRevisionNotNull,
    sourceRevisionIndexPresent: observation.sourceRevisionIndexPresent,
    repositoryReadbackExistingRowProven,
    suspiciousPseudoRevisionCount: observation.suspiciousPseudoRevisionCount,
    revisionOwnerProven: observation.revisionOwnerProven,
    canonicalWriteAttempted: false as const,
    canonicalPersistenceAuthorized,
    blockers,
    observation,
  };

  return GraphifyStructuralPersistenceProofV1Schema.parse({
    ...payload,
    outputChecksum: checksum(payload),
  });
}
