import { z } from 'zod';

const revision = z.string().min(1);

export const AgenticHyperEdgeMemberV1Schema = z.object({
  memberId: z.string().min(1),
  memberRole: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1).nullable(),
  resolutionState: z.enum(['RESOLVED', 'UNRESOLVED', 'AMBIGUOUS', 'UNAVAILABLE']),
  sourceRef: z.string().min(1).nullable(),
  sourceRevision: revision.nullable(),
  evidenceRefs: z.array(z.string().min(1)),
}).strict().superRefine((member, ctx) => {
  if (member.resolutionState === 'RESOLVED' && member.canonicalId === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonicalId'], message: 'RESOLVED_MEMBER_REQUIRES_CANONICAL_ID' });
  }
  if (member.resolutionState !== 'RESOLVED' && member.canonicalId !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonicalId'], message: 'UNRESOLVED_MEMBER_CANNOT_CLAIM_CANONICAL_ID' });
  }
});

export const AgenticHyperEdgeV1Schema = z.object({
  schema: z.literal('atlas.agentic-hyperedge.v1'),
  edgeId: z.string().min(1),
  actionId: z.string().min(1).nullable(),
  workspaceRevision: revision.nullable(),
  sourceRevision: revision.nullable(),
  members: z.array(AgenticHyperEdgeMemberV1Schema).min(1),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  producerRevision: revision,
}).strict();

export type AgenticHyperEdgeMemberV1 = z.infer<typeof AgenticHyperEdgeMemberV1Schema>;
export type AgenticHyperEdgeV1 = z.infer<typeof AgenticHyperEdgeV1Schema>;

export function buildAgenticHyperEdgeV1(input: Omit<AgenticHyperEdgeV1, 'schema' | 'canonicalAuthority' | 'writesPerformed'>): AgenticHyperEdgeV1 {
  return AgenticHyperEdgeV1Schema.parse({
    schema: 'atlas.agentic-hyperedge.v1',
    canonicalAuthority: false,
    writesPerformed: false,
    ...input,
  });
}
