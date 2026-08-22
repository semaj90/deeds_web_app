import { z } from 'zod';
import crypto from 'crypto';

export const EvidenceStateEnum = z.enum([
  'ACTIVE_VERIFIED',
  'ACTIVE_GATED',
  'SUPERSEDED',
  'ARCHIVED',
  'UNRESOLVED',
]);
export type EvidenceState = z.infer<typeof EvidenceStateEnum>;

export const SemanticPacketSchema = z.object({
  schemaId: z.literal('atlas:semantic:packet'),
  schemaVersion: z.literal('2.0.0'),
  packetKey: z.string().min(8),
  sourceRef: z.string().min(1),
  featureId: z.string().min(1),
  featureLabel: z.string().min(1),
  workspaceRevision: z.string().min(1),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  domainClass: z.string().nullable().optional(),
  predictedDomain: z.string().nullable().optional(),
  ontologyIds: z.array(z.string()).optional(),
  evidenceState: EvidenceStateEnum,
  semanticTags: z.array(z.string()).optional(),
  vectorVersions: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type SemanticPacket = z.infer<typeof SemanticPacketSchema>;

/**
 * Deterministic SHA256 hash of semantic packet (identity-only, excludes metadata).
 */
export function hashSemanticPacketIdentity(packet: SemanticPacket): string {
  const identity = {
    schemaId: packet.schemaId,
    schemaVersion: packet.schemaVersion,
    packetKey: packet.packetKey,
    sourceRef: packet.sourceRef,
    featureId: packet.featureId,
    featureLabel: packet.featureLabel,
    workspaceRevision: packet.workspaceRevision,
    contentSha256: packet.contentSha256,
    domainClass: packet.domainClass,
    evidenceState: packet.evidenceState,
  };

  const canonical = JSON.stringify(identity);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Validate and construct a semantic packet.
 */
export function createSemanticPacket(input: unknown): SemanticPacket {
  return SemanticPacketSchema.parse(input);
}

/**
 * Mutation gate: only authorized services may update domainClass.
 * This function enforces that domainClass changes are tracked.
 */
export function authorizedUpdateDomainClass(
  packet: SemanticPacket,
  newDomainClass: string | null,
  authorizedBy: string
): SemanticPacket & { mutationAuthorizedBy: string; mutationTimestamp: string } {
  return {
    ...packet,
    domainClass: newDomainClass,
    mutationAuthorizedBy: authorizedBy,
    mutationTimestamp: new Date().toISOString(),
  };
}
