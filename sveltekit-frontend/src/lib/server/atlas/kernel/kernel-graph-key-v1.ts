import { z } from 'zod';
import { workspaceSourceRefV1Schema } from '../identity/workspace-source-binding-v1.js';

const revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const graphRevision = z.string().min(1);
const sourceRef = workspaceSourceRefV1Schema.refine(
  (value) => !value.includes('\\') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value),
  { message: 'canonicalSourceRef must be a repository-relative POSIX path' },
);

const projectionKind = z.enum(['FILE', 'SYMBOL', 'PACKET', 'INCIDENCE']);

const keyFields = {
  canonicalSourceRef: sourceRef,
  packetKey: z.string().min(1).optional(),
  symbolVersionId: z.string().min(1).optional(),
  canonicalAuthority: z.literal(false),
} as const;

function addProjectionIdentityIssue(
  value: { projectionKind: z.infer<typeof projectionKind>; packetKey?: string; symbolVersionId?: string },
  ctx: z.RefinementCtx,
) {
  if (value.projectionKind === 'SYMBOL' && !value.symbolVersionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['symbolVersionId'], message: 'SYMBOL lookup requires a resolved symbolVersionId' });
  }
  if ((value.projectionKind === 'PACKET' || value.projectionKind === 'INCIDENCE') && !value.packetKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['packetKey'], message: `${value.projectionKind} lookup requires an existing packetKey` });
  }
}

export const KernelGraphLookupKeyV1Schema = z.object({
  schema: z.literal('atlas.kernel-graph-key.v1'),
  qualification: z.literal('LOOKUP'),
  projectionKind,
  workspaceRevisionKey: revision.optional(),
  sourceRevision: revision.optional(),
  graphRevision: graphRevision.optional(),
  ...keyFields,
}).strict().superRefine(addProjectionIdentityIssue);

export const KernelGraphEvidenceKeyV1Schema = z.object({
  schema: z.literal('atlas.kernel-graph-key.v1'),
  qualification: z.literal('EVIDENCE'),
  projectionKind,
  workspaceRevisionKey: revision,
  sourceRevision: revision,
  graphRevision,
  ...keyFields,
}).strict().superRefine(addProjectionIdentityIssue);

export const KernelGraphKeyV1Schema = z.discriminatedUnion('qualification', [
  KernelGraphLookupKeyV1Schema,
  KernelGraphEvidenceKeyV1Schema,
]);

export type KernelGraphLookupKeyV1 = z.infer<typeof KernelGraphLookupKeyV1Schema>;
export type KernelGraphEvidenceKeyV1 = z.infer<typeof KernelGraphEvidenceKeyV1Schema>;
export type KernelGraphKeyV1 = z.infer<typeof KernelGraphKeyV1Schema>;

export function buildKernelGraphLookupKeyV1(
  input: Omit<KernelGraphLookupKeyV1, 'schema' | 'qualification' | 'canonicalAuthority'>,
): KernelGraphLookupKeyV1 {
  return KernelGraphLookupKeyV1Schema.parse({
    ...input,
    schema: 'atlas.kernel-graph-key.v1',
    qualification: 'LOOKUP',
    canonicalAuthority: false,
  });
}

export function buildKernelGraphEvidenceKeyV1(
  input: Omit<KernelGraphEvidenceKeyV1, 'schema' | 'qualification' | 'canonicalAuthority'>,
): KernelGraphEvidenceKeyV1 {
  return KernelGraphEvidenceKeyV1Schema.parse({
    ...input,
    schema: 'atlas.kernel-graph-key.v1',
    qualification: 'EVIDENCE',
    canonicalAuthority: false,
  });
}
