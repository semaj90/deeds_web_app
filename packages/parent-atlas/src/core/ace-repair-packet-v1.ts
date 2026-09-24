import { z } from 'zod';

const sha256RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/, 'expected a qualified sha256 revision');
const referenceListSchema = z.array(z.string().trim().min(1)).max(4096);

/** Descriptor-only repair context. It carries references, never source bodies or model state. */
export const aceRepairPacketV1Schema = z.object({
  schema: z.literal('atlas.ace-repair-packet.v1'),
  requestId: z.string().trim().min(1),
  candidateSnapshotRevision: sha256RevisionSchema,
  ordinalMapChecksum: sha256RevisionSchema,
  selectedCandidateOrdinals: z.array(z.number().int().nonnegative()).max(100_000),
  packetRefs: referenceListSchema,
  sourceRefs: referenceListSchema,
  sourceRevisions: z.array(sha256RevisionSchema).max(4096),
  evidenceRefs: referenceListSchema,
  diagnosticRef: z.string().trim().min(1),
  structuralEvidenceRefs: referenceListSchema,
  documentationRuleRefs: referenceListSchema,
  graphEvidenceRefs: referenceListSchema,
  representationRefs: referenceListSchema,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((packet, ctx) => {
  if (new Set(packet.selectedCandidateOrdinals).size !== packet.selectedCandidateOrdinals.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedCandidateOrdinals'], message: 'candidate ordinals must be unique' });
  }
  if (packet.sourceRefs.length !== packet.sourceRevisions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRevisions'], message: 'each sourceRef must have a corresponding sourceRevision' });
  }
});

export type AceRepairPacketV1 = z.infer<typeof aceRepairPacketV1Schema>;

export function parseAceRepairPacketV1(input: unknown): AceRepairPacketV1 {
  return aceRepairPacketV1Schema.parse(input);
}
