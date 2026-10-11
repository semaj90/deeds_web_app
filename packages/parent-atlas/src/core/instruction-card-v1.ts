import { z } from 'zod';

/**
 * EXEC-CARD-02: immutable planning descriptor, never executable authority.
 *
 * The kernel DAG execution binding owns validated arguments and operator
 * identity. The algorithm execution manifest owns backend/device provenance.
 * This descriptor may point at those owners, but does not replace either.
 */
const ref = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const instructionCardV1Schema = z.object({
  schema: z.literal('atlas.instruction-card.v1'),
  cardId: ref,
  cardRevision: ref,
  requestId: ref,
  workflowId: ref,
  dagNodeId: ref,
  actionId: ref,
  kernelBindingRef: ref,
  kernelBindingChecksum: digest,
  algorithmManifestRef: ref,
  sourceSnapshotRevision: ref,
  workspaceRevision: ref,
  representationRevision: ref,
  graphSnapshotRevision: ref.nullable(),
  contextManifestChecksum: digest.nullable(),
  expectedInputChecksum: digest,
  expectedOutputSchemaId: ref,
  dependencyCardIds: z.array(ref).default([]),
  requiredEvidenceRefs: z.array(ref).min(1),
  routingHint: z.enum(['cpu', 'gpu', 'tool']).nullable(),
  admission: z.literal('NOT_PERFORMED'),
  executable: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.dependencyCardIds.includes(value.cardId)) {
    ctx.addIssue({ code: 'custom', path: ['dependencyCardIds'], message: 'SELF_DEPENDENCY' });
  }
  if (new Set(value.dependencyCardIds).size !== value.dependencyCardIds.length) {
    ctx.addIssue({ code: 'custom', path: ['dependencyCardIds'], message: 'DUPLICATE_DEPENDENCY' });
  }
  if (new Set(value.requiredEvidenceRefs).size !== value.requiredEvidenceRefs.length) {
    ctx.addIssue({ code: 'custom', path: ['requiredEvidenceRefs'], message: 'DUPLICATE_EVIDENCE_REF' });
  }
});

export type InstructionCardV1 = z.infer<typeof instructionCardV1Schema>;

/** Explicit parsing gate; never turns the card into a runnable command. */
export function parseInstructionCardV1(value: unknown): InstructionCardV1 {
  return instructionCardV1Schema.parse(value);
}
