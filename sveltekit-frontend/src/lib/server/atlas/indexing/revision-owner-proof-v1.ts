import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const RevisionAuthorityRoleV1Schema = z.enum([
  'ORIGIN_CANDIDATE',
  'PASS_THROUGH_SINK',
  'DEFAULTED_SINK',
  'UNPOPULATED_SINK',
  'PROJECTION',
  'NOT_PRESENT',
]);

export const RevisionSurfaceObservationV1Schema = z.object({
  surfaceId: z.string().min(1),
  table: z.string().min(1).nullable(),
  column: z.string().min(1).nullable(),
  role: RevisionAuthorityRoleV1Schema,
  exists: z.boolean(),
  totalRows: z.number().int().nonnegative().nullable(),
  populatedRows: z.number().int().nonnegative().nullable(),
  meaningfulRows: z.number().int().nonnegative().nullable(),
  meaningfulCoveragePct: z.number().finite().min(0).max(100).nullable(),
  writerPath: z.string().min(1).nullable(),
  writerPresent: z.boolean(),
  writerCreatesRevision: z.boolean(),
  writerPassesRevisionThrough: z.boolean(),
  writerEvidence: z.array(z.string().min(1)),
  notes: z.array(z.string()),
}).strict();
export type RevisionSurfaceObservationV1 = z.infer<typeof RevisionSurfaceObservationV1Schema>;

export const RevisionOwnerProofV1Schema = z.object({
  schema: z.literal('atlas.revision-owner-proof.v1'),
  status: z.enum([
    'REVISION_OWNER_NOT_PROVEN',
    'WORKSPACE_REVISION_OWNER_PROVEN_SOURCE_REVISION_NOT_PROVEN',
    'SOURCE_REVISION_OWNER_PROVEN_WORKSPACE_REVISION_NOT_PROVEN',
    'REVISION_OWNER_PROVEN',
  ]),
  workspaceRevisionOwner: z.string().min(1).nullable(),
  sourceRevisionOwner: z.string().min(1).nullable(),
  workspaceRevisionProven: z.boolean(),
  sourceRevisionProven: z.boolean(),
  observations: z.array(RevisionSurfaceObservationV1Schema).min(1),
  disallowedInferences: z.array(z.string().min(1)).min(1),
  blockers: z.array(z.string().min(1)),
  readOnly: z.literal(true),
  canonicalWriteAttempted: z.literal(false),
  producerRevision: z.string().min(1),
  outputChecksum: sha256Schema,
}).strict();
export type RevisionOwnerProofV1 = z.infer<typeof RevisionOwnerProofV1Schema>;

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

function isProvenOrigin(observation: RevisionSurfaceObservationV1): boolean {
  return observation.role === 'ORIGIN_CANDIDATE'
    && observation.exists
    && observation.writerPresent
    && observation.writerCreatesRevision
    && (observation.meaningfulRows ?? 0) > 0
    && (observation.meaningfulCoveragePct ?? 0) > 0;
}

export function classifyRevisionOwnerProofV1(input: {
  observations: RevisionSurfaceObservationV1[];
  producerRevision: string;
}): RevisionOwnerProofV1 {
  const observations = input.observations.map((item) => RevisionSurfaceObservationV1Schema.parse(item));

  const workspaceCandidates = observations.filter((item) => item.surfaceId.startsWith('workspace:'));
  const sourceCandidates = observations.filter((item) => item.surfaceId.startsWith('source:'));

  const workspaceOrigin = workspaceCandidates.find(isProvenOrigin) ?? null;
  const sourceOrigin = sourceCandidates.find(isProvenOrigin) ?? null;
  const workspaceRevisionProven = workspaceOrigin !== null;
  const sourceRevisionProven = sourceOrigin !== null;

  let status: RevisionOwnerProofV1['status'] = 'REVISION_OWNER_NOT_PROVEN';
  if (workspaceRevisionProven && sourceRevisionProven) status = 'REVISION_OWNER_PROVEN';
  else if (workspaceRevisionProven) status = 'WORKSPACE_REVISION_OWNER_PROVEN_SOURCE_REVISION_NOT_PROVEN';
  else if (sourceRevisionProven) status = 'SOURCE_REVISION_OWNER_PROVEN_WORKSPACE_REVISION_NOT_PROVEN';

  const blockers: string[] = [];
  if (!workspaceRevisionProven) blockers.push('WORKSPACE_REVISION_ORIGIN_NOT_PROVEN');
  if (!sourceRevisionProven) blockers.push('SOURCE_REVISION_ORIGIN_NOT_PROVEN');

  const payload = {
    schema: 'atlas.revision-owner-proof.v1' as const,
    status,
    workspaceRevisionOwner: workspaceOrigin?.surfaceId ?? null,
    sourceRevisionOwner: sourceOrigin?.surfaceId ?? null,
    workspaceRevisionProven,
    sourceRevisionProven,
    observations,
    disallowedInferences: [
      'A NOT NULL revision column is not revision authority.',
      'A default value such as workspace_revision=0 is not revision authority.',
      'A content digest is a content/version anchor, not canonical source_revision unless an accepted owner contract explicitly defines it so.',
      'A projection payload that carries a revision is not the origin owner of that revision.',
      'A pass-through writer such as atlas_symbol_versions cannot prove the revision it was handed.',
    ],
    blockers,
    readOnly: true as const,
    canonicalWriteAttempted: false as const,
    producerRevision: input.producerRevision,
  };

  return RevisionOwnerProofV1Schema.parse({
    ...payload,
    outputChecksum: checksum(payload),
  });
}
