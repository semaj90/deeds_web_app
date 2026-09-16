import { z } from 'zod';

const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const GraphifyHeadExecutionCandidateV1Schema = z
  .object({
    executionId: z.string().uuid(),
    workspaceId: z.string().min(1),
    workspaceHeadRevision: checksum.nullable(),
    sourceMembershipChecksum: checksum,
    sourceContentChecksum: checksum,
    graphRevision: z.string().min(1).nullable(),
    packetRevision: z.string().min(1).nullable(),
    terminal: z.literal(true),
    producerRevision: z.string().min(1),
  })
  .strict();
export type GraphifyHeadExecutionCandidateV1 = z.infer<typeof GraphifyHeadExecutionCandidateV1Schema>;

export const GraphifyHeadOwnerStatusV1Schema = z.enum([
  'HEAD_SCOPE_UNRESOLVED',
  'HEAD_OWNER_AMBIGUOUS',
  'EVIDENCE_OWNER_AVAILABLE_MUTATION_AUTHORITY_UNCHANGED',
]);
export type GraphifyHeadOwnerStatusV1 = z.infer<typeof GraphifyHeadOwnerStatusV1Schema>;

export const GraphifyHeadOwnerResolutionV1Schema = z
  .object({
    schema: z.literal('atlas.graphify-head-owner-resolution.v1'),
    workspaceId: z.string().min(1),
    workspaceHeadRevision: checksum.nullable(),
    status: GraphifyHeadOwnerStatusV1Schema,
    candidateExecutionIds: z.array(z.string().uuid()),
    evidenceEquivalent: z.boolean(),
    readOnlyExecutionId: z.string().uuid().nullable(),
    mutationAuthorityExecutionId: z.string().uuid().nullable(),
    distinctEvidenceSignatures: z.number().int().nonnegative(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();
export type GraphifyHeadOwnerResolutionV1 = z.infer<typeof GraphifyHeadOwnerResolutionV1Schema>;

function signature(candidate: GraphifyHeadExecutionCandidateV1): string {
  return [candidate.sourceMembershipChecksum, candidate.sourceContentChecksum, candidate.graphRevision ?? 'NULL', candidate.packetRevision ?? 'NULL', candidate.producerRevision].join('|');
}

export function resolveGraphifyHeadOwnerV1(
  candidates: readonly GraphifyHeadExecutionCandidateV1[],
): GraphifyHeadOwnerResolutionV1 {
  if (candidates.length === 0) throw new Error('GRAPHIFY_HEAD_OWNER_CANDIDATE_REQUIRED');
  const parsed = candidates.map((candidate) => GraphifyHeadExecutionCandidateV1Schema.parse(candidate));
  const workspaceId = parsed[0].workspaceId;
  if (parsed.some((candidate) => candidate.workspaceId !== workspaceId)) throw new Error('GRAPHIFY_HEAD_OWNER_WORKSPACE_MISMATCH');
  const headRevisions = new Set(parsed.map((candidate) => candidate.workspaceHeadRevision));
  const headRevision = parsed[0].workspaceHeadRevision;
  const signatures = new Set(parsed.map(signature));
  const candidateExecutionIds = parsed.map((candidate) => candidate.executionId).sort();
  const equivalent = signatures.size === 1;
  const headResolved = headRevision !== null && headRevisions.size === 1;
  const status: GraphifyHeadOwnerStatusV1 = !headResolved
    ? 'HEAD_SCOPE_UNRESOLVED'
    : equivalent
      ? 'EVIDENCE_OWNER_AVAILABLE_MUTATION_AUTHORITY_UNCHANGED'
      : 'HEAD_OWNER_AMBIGUOUS';
  return GraphifyHeadOwnerResolutionV1Schema.parse({
    schema: 'atlas.graphify-head-owner-resolution.v1',
    workspaceId,
    workspaceHeadRevision: headResolved ? headRevision : null,
    status,
    candidateExecutionIds,
    evidenceEquivalent: equivalent,
    readOnlyExecutionId: headResolved && equivalent ? candidateExecutionIds[0] : null,
    mutationAuthorityExecutionId: null,
    distinctEvidenceSignatures: signatures.size,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
