/**
 * Pure construction of a canonical WorkflowActionEventV1 for a Phase 79 repair attempt.
 *
 * Deliberately has no top-level side effects (no DB connection, no env var reads) so it can be
 * imported and unit-tested without booting the rest of phase79-agentic-repair.mts, which executes
 * its agent loop immediately on import. The actual durable write (writeCanonicalWorkflowActionAtomically)
 * stays in phase79-agentic-repair.mts, which is the only place with a live DB connection.
 *
 * Identity notes (see canonical-action-write-adapter-v1.ts's prepareCanonicalActionWriteV1):
 * - event.runId and event.actionId MUST be real UUIDs (agent_runs.run_id / agent_run_actions.action_id
 *   are `uuid` columns) -- generated fresh per repair attempt, distinct from the human-readable
 *   Phase79 sessionId (kept in metadata.sessionId instead).
 * - tenantId is `uuid NOT NULL` on agent_runs but Phase 79 has no real multi-tenant concept (this is
 *   a single-tenant repo-wide tool). SYSTEM_TENANT_ID (the RFC 4122 nil UUID) is used as an explicit,
 *   documented sentinel for "system-scoped, no tenant" -- not a fabricated real tenant identity.
 * - kind='completed' requires receiptId (schema-enforced). Phase 79 has no independent governed-mutation
 *   receipt, so receiptId is populated from the already-durable analysis_pass_results row id (real,
 *   persisted evidence) when that write succeeded. If it did not (e.g. CANONICAL_PACKET_KEY_UNPROVEN),
 *   there is no honest receiptId available and construction is skipped rather than forcing one.
 * - kind='failed' requires errorCode (schema-enforced), derived from the real thrown-error message's
 *   leading token (e.g. "VERIFICATION_NOT_IMPROVED:before=...:after=..." -> "VERIFICATION_NOT_IMPROVED"),
 *   not a fabricated code.
 */
import { randomUUID } from 'node:crypto';
import { workflowActionEventSchema, type WorkflowActionEventV1 } from '@deeds/parent-atlas/core/workflow-action-event';

export const PHASE79_SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
export const PHASE79_WORKFLOW_NAME = 'phase79-agentic-repair';
export const PHASE79_DAG_NODE_ID = 'phase79.repair-attempt';

export interface Phase79RepairPacketRef {
  packetKey: string | null;
}

export interface Phase79CanonicalEventInput {
  sessionId: string;
  suggestionId: string;
  clusterId: string | null;
  sourceRef: string;
  status: 'succeeded' | 'failed';
  failureReason: string | null;
  ledgerPersisted: boolean;
  ledgerRowId: number | string | null;
  proposalChecksum: string;
  packets: Phase79RepairPacketRef[];
  producerRevision: string;
  startedAt: string;
  completedAt: string;
}

export type Phase79CanonicalEventResult =
  | { skipped: false; event: WorkflowActionEventV1; idempotencyKey: string }
  | { skipped: true; reason: string };

function deriveErrorCode(failureReason: string | null): string {
  if (!failureReason) return 'UNKNOWN_FAILURE';
  const leading = failureReason.split(':')[0]?.trim();
  return leading && leading.length > 0 ? leading.slice(0, 200) : 'UNKNOWN_FAILURE';
}

export function buildPhase79CanonicalWorkflowActionEvent(
  input: Phase79CanonicalEventInput,
): Phase79CanonicalEventResult {
  let kind: 'completed' | 'failed';
  let receiptId: string | undefined;
  let errorCode: string | undefined;

  if (input.status === 'succeeded') {
    if (!input.ledgerPersisted || input.ledgerRowId == null) {
      return { skipped: true, reason: 'NO_RECEIPT_ID_AVAILABLE_LEDGER_NOT_PERSISTED' };
    }
    kind = 'completed';
    receiptId = String(input.ledgerRowId);
  } else {
    kind = 'failed';
    errorCode = deriveErrorCode(input.failureReason);
  }

  const workflowId = `phase79-repair:${input.suggestionId}`;
  const runId = randomUUID();
  const actionId = randomUUID();

  let event: WorkflowActionEventV1;
  try {
    event = workflowActionEventSchema.parse({
      workflowId,
      workflowRevision: 0,
      sequence: 0,
      actionId,
      dagNodeId: PHASE79_DAG_NODE_ID,
      attempt: 1,
      lane: 'tool',
      kind,
      runId,
      toolId: 'phase79-agentic-repair',
      ...(receiptId ? { receiptId } : {}),
      ...(errorCode ? { errorCode } : {}),
      resourceRefs: input.packets
        .filter((packet): packet is { packetKey: string } => Boolean(packet.packetKey))
        .map((packet) => ({
          resource_type: 'packet',
          resource_id: packet.packetKey,
          role: 'evidence',
          identity_status: 'canonical' as const,
        })),
      evidenceRefs: [input.suggestionId],
      producerRevision: input.producerRevision,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      metadata: {
        sessionId: input.sessionId,
        sourceRef: input.sourceRef,
        proposalChecksum: input.proposalChecksum,
        clusterId: input.clusterId,
      },
    });
  } catch (error) {
    return {
      skipped: true,
      reason: `CANONICAL_EVENT_SCHEMA_REJECTED:${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    skipped: false,
    event,
    idempotencyKey: `phase79:${input.suggestionId}:${input.proposalChecksum}`,
  };
}
