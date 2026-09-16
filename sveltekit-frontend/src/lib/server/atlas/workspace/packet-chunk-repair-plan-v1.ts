import { z } from 'zod';
import type { WorkspaceInvalidationV1 } from './workspace-event-sourcing-v1.js';

const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const PacketChunkRepairStatusV1Schema = z.enum(['READY_FOR_BOUNDED_REPAIR', 'MISSING_PACKET', 'PACKET_DIGEST_MISMATCH', 'MISSING_CHUNK_LINEAGE', 'REVISION_MISMATCH', 'AMBIGUOUS_LINEAGE']);
export type PacketChunkRepairStatusV1 = z.infer<typeof PacketChunkRepairStatusV1Schema>;

export const PacketChunkLineageEvidenceV1Schema = z.object({
  sourceRef: z.string().min(1), sourceRevision: revision, workspaceRevision: revision,
  packetKey: z.string().min(1).nullable(), packetContentDigest: checksum.nullable(),
  chunkIds: z.array(z.string().min(1)), chunkRevision: revision.nullable(), lineageChecksum: checksum.nullable(), candidateCount: z.number().int().nonnegative().default(1),
}).strict();
export type PacketChunkLineageEvidenceV1 = z.infer<typeof PacketChunkLineageEvidenceV1Schema>;

export const PacketChunkRepairPlanV1Schema = z.object({
  schema: z.literal('atlas.packet-chunk-repair-plan.v1'), sourceRef: z.string().min(1), status: PacketChunkRepairStatusV1Schema,
  invalidation: z.object({ canonicalId: z.string().min(1), artifactKind: z.enum(['PACKET', 'CHUNK']), requiredRevision: revision.nullable() }).strict(),
  evidence: PacketChunkLineageEvidenceV1Schema.nullable(), repairScope: z.array(z.string().min(1)), reason: z.string().min(1),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type PacketChunkRepairPlanV1 = z.infer<typeof PacketChunkRepairPlanV1Schema>;

export const PacketChunkRepairBatchV1Schema = z.object({
  schema: z.literal('atlas.packet-chunk-repair-batch.v1'), plans: z.array(PacketChunkRepairPlanV1Schema),
  counts: z.record(PacketChunkRepairStatusV1Schema, z.number().int().nonnegative()), bounded: z.literal(true),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type PacketChunkRepairBatchV1 = z.infer<typeof PacketChunkRepairBatchV1Schema>;

export function planPacketChunkRepairV1(input: { invalidation: WorkspaceInvalidationV1; sourceRef: string; expectedSourceRevision: string; expectedWorkspaceRevision: string; expectedContentDigest: string; evidence: PacketChunkLineageEvidenceV1 | null }): PacketChunkRepairPlanV1 {
  const evidence = input.evidence ? PacketChunkLineageEvidenceV1Schema.parse(input.evidence) : null;
  const invalidation = { canonicalId: input.invalidation.canonicalId, artifactKind: input.invalidation.artifactKind === 'CHUNK' ? 'CHUNK' as const : 'PACKET' as const, requiredRevision: input.invalidation.requiredRevision };
  let status: PacketChunkRepairStatusV1 = 'READY_FOR_BOUNDED_REPAIR';
  let reason = 'EXACT_LINEAGE_EVIDENCE_AVAILABLE';
  let repairScope: string[] = [];
  if (!evidence) { status = 'MISSING_PACKET'; reason = 'LINEAGE_EVIDENCE_UNAVAILABLE'; }
  else if (evidence.candidateCount !== 1) { status = 'AMBIGUOUS_LINEAGE'; reason = 'LINEAGE_CANDIDATE_COUNT_NOT_ONE'; }
  else if (evidence.sourceRef !== input.sourceRef || evidence.sourceRevision !== input.expectedSourceRevision || evidence.workspaceRevision !== input.expectedWorkspaceRevision) { status = 'REVISION_MISMATCH'; reason = 'SOURCE_OR_WORKSPACE_REVISION_MISMATCH'; }
  else if (!evidence.packetKey) { status = 'MISSING_PACKET'; reason = 'PACKET_IDENTITY_MISSING'; }
  else if (evidence.packetContentDigest !== input.expectedContentDigest) { status = 'PACKET_DIGEST_MISMATCH'; reason = 'WHOLE_SOURCE_PACKET_DIGEST_MISMATCH'; }
  else if (evidence.chunkIds.length === 0 || !evidence.chunkRevision || !evidence.lineageChecksum) { status = 'MISSING_CHUNK_LINEAGE'; reason = 'CHUNK_LINEAGE_NOT_PROVEN'; }
  else repairScope = [evidence.packetKey, ...evidence.chunkIds];
  return PacketChunkRepairPlanV1Schema.parse({ schema: 'atlas.packet-chunk-repair-plan.v1', sourceRef: input.sourceRef, status, invalidation, evidence, repairScope, reason, canonicalAuthority: false, writesPerformed: false });
}

export function planPacketChunkRepairBatchV1(inputs: readonly Parameters<typeof planPacketChunkRepairV1>[0][]): PacketChunkRepairBatchV1 {
  const plans = inputs.map(planPacketChunkRepairV1);
  const counts = Object.fromEntries(PacketChunkRepairStatusV1Schema.options.map((status) => [status, plans.filter((plan) => plan.status === status).length])) as Record<PacketChunkRepairStatusV1, number>;
  return PacketChunkRepairBatchV1Schema.parse({ schema: 'atlas.packet-chunk-repair-batch.v1', plans, counts, bounded: true, canonicalAuthority: false, writesPerformed: false });
}
