import { z } from 'zod';
import { canonicalHashJSON } from './canonical-hashing.js';
import { DomainFeaturePacketSchema } from './domain-feature-packet.js';

const GroundedLabelEvidenceV1Schema = z.object({
  label: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

const LanguageLabelEvidenceV1Schema = z.object({
  label: z.string().min(1),
  labelNamespace: z.string().min(1),
  sourceOwner: z.string().min(1),
  sourceRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

const FeaturePacketV1UnsignedSchema = z.object({
  schema: z.literal('atlas.feature-packet.v1'),
  packetKey: z.string().min(8),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  topicEvidence: z.array(GroundedLabelEvidenceV1Schema),
  domainEvidence: z.array(GroundedLabelEvidenceV1Schema),
  languageEvidence: z.array(LanguageLabelEvidenceV1Schema),
  featurePacket: DomainFeaturePacketSchema,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  promotionAuthorized: z.literal(false),
}).strict();

export const FeaturePacketV1Schema = FeaturePacketV1UnsignedSchema.extend({
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict().superRefine((packet, context) => {
  if (packet.featurePacket.packetKey !== packet.packetKey) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['featurePacket', 'packetKey'], message: 'nested packetKey must equal envelope packetKey' });
  }
  if (packet.featurePacket.featureSchemaVersion !== packet.featureRevision) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['featurePacket', 'featureSchemaVersion'], message: 'nested featureSchemaVersion must equal envelope featureRevision' });
  }
  const { checksum, ...unsigned } = packet;
  if (`sha256:${canonicalHashJSON(unsigned)}` !== checksum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['checksum'], message: 'FeaturePacketV1 checksum mismatch' });
  }
});
export type FeaturePacketV1 = z.infer<typeof FeaturePacketV1Schema>;

function normalizeGroundedEvidence<T extends { label: string; evidenceRefs: string[] }>(items: T[]): T[] {
  return items.map((item) => ({
    ...item,
    evidenceRefs: [...new Set(item.evidenceRefs)].sort(),
  })).sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
}

/**
 * Wraps the existing domain-feature payload in a revision-qualified,
 * evidence-grounded envelope. packetKey is supplied by its existing owner;
 * this builder never creates or promotes identity.
 */
export function buildFeaturePacketV1(input: Omit<FeaturePacketV1, 'checksum'>): FeaturePacketV1 {
  const normalized = {
    ...input,
    topicEvidence: normalizeGroundedEvidence(input.topicEvidence),
    domainEvidence: normalizeGroundedEvidence(input.domainEvidence),
    languageEvidence: normalizeGroundedEvidence(input.languageEvidence),
  };
  const unsigned = FeaturePacketV1UnsignedSchema.parse(normalized);
  return FeaturePacketV1Schema.parse({ ...unsigned, checksum: `sha256:${canonicalHashJSON(unsigned)}` });
}
