import { z } from 'zod';
import {
  workspaceSourceBindingV1Schema,
  type WorkspaceSourceBindingV1,
} from '../atlas/identity/workspace-source-binding-v1.js';

const workspaceRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/**
 * Tournament admission establishes a workspace revision, but deliberately
 * does not authorize Graphify or projection writes. Keep that control-plane
 * receipt explicit so it cannot be mistaken for execution authority.
 */
export const workspaceRevisionTournamentAdmissionReceiptV1Schema = z.object({
  schema: z.literal('atlas.workspace-revision-tournament-admission.v1'),
  status: z.literal('WORKSPACE_REVISION_TOURNAMENT_ADMITTED'),
  authority: z.literal(true),
  workspaceRevision: workspaceRevisionSchema,
  graphifyExecutionAuthorized: z.literal(false),
  projectionWritesAuthorized: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export const semanticPacketExecutionAuthorityReceiptV1Schema = z.object({
  schema: z.string().min(1),
  status: z.literal('GRAPHIFY_SNAPSHOT_BINDING_PROVEN'),
  authority: z.literal(true),
  executionId: z.string().min(1),
  workspaceRevision: workspaceRevisionSchema,
  sourceMembershipChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  writesPerformed: z.literal(false),
}).strict();

export type WorkspaceRevisionTournamentAdmissionReceiptV1 = z.infer<typeof workspaceRevisionTournamentAdmissionReceiptV1Schema>;
export type SemanticPacketExecutionAuthorityReceiptV1 = z.infer<typeof semanticPacketExecutionAuthorityReceiptV1Schema>;

export const semanticPacketWriteAdmissionV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: workspaceRevisionSchema,
  workspaceRevision: workspaceRevisionSchema,
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  executionId: z.string().min(1),
  bindingChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  authorityScope: z.literal('ADMITTED_EXECUTION_SOURCE_BINDING'),
  writesPerformed: z.literal(false),
}).strict();

export type SemanticPacketWriteAdmissionV1 = z.infer<typeof semanticPacketWriteAdmissionV1Schema>;

/**
 * Validates the two distinct control-plane gates needed before a semantic
 * packet can be admitted. The tournament receipt alone is intentionally
 * insufficient; an independently produced terminal execution receipt must
 * bind the same workspace revision and membership checksum.
 */
export function validateSemanticPacketExecutionAuthorityV1(input: {
  tournamentAdmission: WorkspaceRevisionTournamentAdmissionReceiptV1;
  executionReceipt: SemanticPacketExecutionAuthorityReceiptV1;
}): SemanticPacketExecutionAuthorityReceiptV1 {
  const tournament = workspaceRevisionTournamentAdmissionReceiptV1Schema.parse(input.tournamentAdmission);
  const execution = semanticPacketExecutionAuthorityReceiptV1Schema.parse(input.executionReceipt);

  if (execution.workspaceRevision !== tournament.workspaceRevision) {
    throw new Error('SEMANTIC_PACKET_EXECUTION_WORKSPACE_REVISION_MISMATCH');
  }

  return execution;
}

/**
 * Converts one validated observation binding into the minimum lineage input
 * needed by the semantic writer. This function does not derive packet keys,
 * read the database, or perform a write. The caller must supply the already
 * resolved packet key and the explicitly admitted execution revision.
 */
export function buildSemanticPacketWriteAdmissionV1(input: {
  packetKey: string;
  binding: WorkspaceSourceBindingV1;
  admittedWorkspaceRevision: string;
  executionId: string;
}): SemanticPacketWriteAdmissionV1 {
  const binding = workspaceSourceBindingV1Schema.parse(input.binding);
  const admittedWorkspaceRevision = workspaceRevisionSchema.parse(input.admittedWorkspaceRevision);

  if (binding.workspaceRevision !== admittedWorkspaceRevision) {
    throw new Error('SEMANTIC_PACKET_WORKSPACE_REVISION_MISMATCH');
  }

  return semanticPacketWriteAdmissionV1Schema.parse({
    packetKey: input.packetKey.trim(),
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    workspaceRevision: binding.workspaceRevision,
    contentDigest: binding.contentDigest,
    executionId: input.executionId.trim(),
    bindingChecksum: binding.checksum,
    authorityScope: 'ADMITTED_EXECUTION_SOURCE_BINDING',
    writesPerformed: false,
  });
}
