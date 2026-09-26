import { db } from '$lib/server/db/client.js';
import {
    agentRuns,
    agentRunActions,
    workflowEvents,
    outboxEvents,
    type NewAgentRun,
    type NewAgentRunAction,
    type AgentRun,
    type AgentRunAction,
} from '$lib/server/db/schema-postgres.js';
import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { WorkflowActionEventV1 } from '@deeds/parent-atlas/core/workflow-action-event';
import {
    prepareCanonicalActionWriteV1,
    validateCanonicalActionReadbackV1,
    classifyCanonicalIdentityV1,
} from './canonical-action-write-adapter-v1.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionRequest {
    /** Mastra / LangGraph workflow name */
    workflowName: string;
    workflowVersion: string;
    tenantId: string;
    initiatedBy: string;
    /** atlas.action.v1 packet — already Zod-validated by caller */
    inputPacket: Record<string, unknown>;
    actionType: string;
    permissionScope: string[];
    riskLevel?: number;
    causationId?: string;
    /** Stable key for exactly-once execution. Derived by caller from operation + sourceRef + contentHash. */
    idempotencyKey: string;
    /** Optional canonical event. When supplied, UUID identities and event receipt are preserved. */
    canonicalEvent?: WorkflowActionEventV1;
}

export interface ActionWriteResult {
    runId: string;
    actionId: string;
    /** True when the idempotency key already existed — caller should skip execution. */
    duplicate: boolean;
}

/**
 * Canonical workflow-event entrypoint. This is intentionally a thin boundary
 * over the single durable writer: the caller owns the validated event identity
 * and the legacy writer remains the only transaction owner.
 */
export interface CanonicalActionRequestV1 {
    event: WorkflowActionEventV1;
    workflowName: string;
    workflowVersion: string;
    tenantId: string;
    initiatedBy: string;
    inputPacket: Record<string, unknown>;
    actionType: string;
    permissionScope: string[];
    riskLevel?: number;
    idempotencyKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

// ---------------------------------------------------------------------------
// Core writer
//
// Single db.transaction() that atomically:
//   1. Inserts agent_runs row (status PROPOSED)
//   2. Inserts agent_run_actions row (sequence_no 1, idempotency guard)
//   3. Inserts workflow_events row (event: action.proposed)
//   4. Inserts outbox_events row (fanout trigger for Redis/Qdrant/mmap workers)
//
// If idempotency_key already exists, returns { duplicate: true } without writing.
// ---------------------------------------------------------------------------

export async function writeActionAtomically(
    req: ActionRequest,
): Promise<ActionWriteResult> {
    const canonicalWrite = req.canonicalEvent ? prepareCanonicalActionWriteV1(req.canonicalEvent) : null;
    const runId    = canonicalWrite?.runId ?? randomUUID();
    const actionId = canonicalWrite?.actionId ?? randomUUID();
    const now      = new Date();
    const inputHash = sha256(JSON.stringify(req.inputPacket));

    return db.transaction(async (tx) => {
        if (canonicalWrite) {
            const [existingCanonical] = await tx
                .select({ payload: workflowEvents.payload })
                .from(workflowEvents)
                .where(and(
                    eq(workflowEvents.runId, runId),
                    eq(workflowEvents.actionId, actionId),
                    eq(workflowEvents.sequenceNo, canonicalWrite.sequenceNo),
                ))
                .limit(1);
            if (existingCanonical) {
                const payload = existingCanonical.payload as Record<string, unknown>;
                const decision = classifyCanonicalIdentityV1({
                    event: canonicalWrite.event,
                    existingEvent: payload.canonicalEvent,
                    existingReceipt: payload.eventReceipt,
                });
                if (decision.kind === 'CANONICAL_EVENT_IDENTITY_COLLISION') throw new Error(decision.kind);
                return { runId, actionId, duplicate: true };
            }
        }
        // --- Idempotency guard (read inside transaction for serializable isolation) ---
        const existing = await tx
            .select({ actionId: agentRunActions.actionId, runId: agentRunActions.runId })
            .from(agentRunActions)
            .where(eq(agentRunActions.idempotencyKey, req.idempotencyKey))
            .limit(1);

        if (existing.length > 0) {
            // AGENTIC-DURABLE-WRITER-CANONICAL-EVENT-01: a matching idempotencyKey alone is not
            // proof the incoming write is a true retry -- if the caller supplies a canonical
            // event, compare it against whatever canonical event/receipt is actually stored
            // under this idempotencyKey. A same-identity write with a DIFFERENT checksum (e.g. a
            // key reused across two logically different attempts) must be rejected, not silently
            // treated as a duplicate and handed back stale run/action IDs.
            if (canonicalWrite) {
                const [existingWorkflowEvent] = await tx
                    .select({ payload: workflowEvents.payload })
                    .from(workflowEvents)
                    .where(and(
                        eq(workflowEvents.runId, existing[0]!.runId),
                        eq(workflowEvents.actionId, existing[0]!.actionId),
                    ))
                    .orderBy(desc(workflowEvents.sequenceNo))
                    .limit(1);
                const existingPayload = existingWorkflowEvent?.payload as Record<string, unknown> | undefined;
                const decision = classifyCanonicalIdentityV1({
                    event: canonicalWrite.event,
                    existingEvent: existingPayload?.canonicalEvent,
                    existingReceipt: existingPayload?.eventReceipt,
                });
                if (decision.kind === 'CANONICAL_EVENT_IDENTITY_COLLISION') {
                    throw new Error(
                        `CANONICAL_WORKFLOW_EVENT_IDENTITY_COLLISION: idempotencyKey ${req.idempotencyKey} is already bound to a different canonical event (existing checksum ${decision.existingEventChecksum}, incoming checksum ${decision.incomingEventChecksum})`,
                    );
                }
            }
            return {
                runId:     existing[0]!.runId,
                actionId:  existing[0]!.actionId,
                duplicate: true,
            };
        }

        // 1. agent_runs
        await tx.insert(agentRuns).values({
            runId,
            workflowName:    req.workflowName,
            workflowVersion: req.workflowVersion,
            status:          'PROPOSED',
            tenantId:        req.tenantId as unknown as string,
            initiatedBy:     req.initiatedBy,
            state:           {},
            startedAt:       now,
        } satisfies NewAgentRun);

        // 2. agent_run_actions
        await tx.insert(agentRunActions).values({
            actionId,
            runId,
            sequenceNo:      canonicalWrite?.sequenceNo ?? 1,
            actionType:      req.actionType,
            inputPacket:     req.inputPacket,
            inputHash,
            permissionScope: req.permissionScope,
            riskLevel:       req.riskLevel ?? 0,
            status:          'PROPOSED',
            idempotencyKey:  req.idempotencyKey,
            causationId:     (canonicalWrite?.causationId ?? req.causationId) as string | undefined,
        } satisfies NewAgentRunAction);

        // 3. workflow_events — append-only audit
        await tx.insert(workflowEvents).values({
            runId,
            actionId,
            eventType:  canonicalWrite?.eventType ?? 'action.proposed',
            sequenceNo: canonicalWrite?.sequenceNo ?? 1,
            payload: {
                actionType:      req.actionType,
                inputHash,
                permissionScope: req.permissionScope,
                riskLevel:       req.riskLevel ?? 0,
                ...(canonicalWrite?.payload ?? {}),
            },
            occurredAt: now,
            recordedAt: now,
        });

        // 4. outbox_events — worker fanout (Redis/Qdrant/mmap)
        await tx.insert(outboxEvents).values({
            aggregateType: 'agent_run_action',
            aggregateId:   actionId as unknown as string,
            eventType:     canonicalWrite?.eventType ?? `${req.actionType}.proposed`,
            payload: {
                runId,
                actionId,
                actionType:     req.actionType,
                inputHash,
                idempotencyKey: req.idempotencyKey,
                tenantId:       req.tenantId,
                ...(canonicalWrite?.payload ?? {}),
            },
        });

        if (canonicalWrite) {
            const [storedEvent] = await tx
                .select({ payload: workflowEvents.payload })
                .from(workflowEvents)
                .where(and(
                    eq(workflowEvents.runId, runId),
                    eq(workflowEvents.actionId, actionId),
                    eq(workflowEvents.sequenceNo, canonicalWrite.sequenceNo),
                ))
                .limit(1);
            const [storedOutbox] = await tx
                .select({ payload: outboxEvents.payload })
                .from(outboxEvents)
                .where(and(
                    eq(outboxEvents.aggregateId, actionId),
                    eq(outboxEvents.eventType, canonicalWrite.eventType),
                ))
                .limit(1);
            if (!storedEvent || !storedOutbox) throw new Error('CANONICAL_WORKFLOW_EVENT_READBACK_MISSING');
            validateCanonicalActionReadbackV1({
                event: canonicalWrite.event,
                workflowPayload: storedEvent.payload,
                outboxPayload: storedOutbox.payload,
            });
        }

        return { runId, actionId, duplicate: false };
    });
}

/**
 * Writes a caller-owned canonical WorkflowActionEventV1 through the existing
 * Postgres/outbox transaction. No IDs or sequence values are generated here.
 * Durable event/readback and identity-collision proofs remain separate gates.
 */
export async function writeCanonicalWorkflowActionAtomically(
    req: CanonicalActionRequestV1,
): Promise<ActionWriteResult> {
    prepareCanonicalActionWriteV1(req.event);
    return writeActionAtomically({
        workflowName: req.workflowName,
        workflowVersion: req.workflowVersion,
        tenantId: req.tenantId,
        initiatedBy: req.initiatedBy,
        inputPacket: req.inputPacket,
        actionType: req.actionType,
        permissionScope: req.permissionScope,
        riskLevel: req.riskLevel,
        idempotencyKey: req.idempotencyKey,
        canonicalEvent: req.event,
    });
}

// ---------------------------------------------------------------------------
// Advance action status
//
// Writes the next status + a workflow_events row atomically.
// Does NOT write to Redis/Qdrant — that is the outbox worker's job.
// ---------------------------------------------------------------------------

export type ActionStatus =
    | 'VALIDATED' | 'AUTHORIZED' | 'READY' | 'RUNNING'
    | 'SUCCEEDED' | 'RETRY_PENDING' | 'DENIED' | 'WAITING_APPROVAL' | 'FAILED';

export async function advanceActionStatus(
    runId: string,
    actionId: string,
    nextStatus: ActionStatus,
    eventPayload: Record<string, unknown> = {},
): Promise<void> {
    const now = new Date();

    await db.transaction(async (tx) => {
        // Advance action status
        await tx
            .update(agentRunActions)
            .set({
                status:     nextStatus,
                startedAt:  nextStatus === 'RUNNING'   ? now : undefined,
                finishedAt: ['SUCCEEDED', 'FAILED', 'DENIED'].includes(nextStatus) ? now : undefined,
            })
            .where(eq(agentRunActions.actionId, actionId));

        // Mirror run status for terminal states
        if (['SUCCEEDED', 'FAILED', 'DENIED'].includes(nextStatus)) {
            await tx
                .update(agentRuns)
                .set({ status: nextStatus, completedAt: now })
                .where(eq(agentRuns.runId, runId));
        }

        // Append event — get the current max sequence_no for THIS RUN from workflow_events
        // itself (the append-only per-run event log workflow_events_run_seq's unique
        // constraint is actually keyed on). Querying agent_run_actions.sequenceNo here was a
        // real bug: that column is a static per-action value set once at action creation and
        // never advances, so every call after the first for the same run recomputed the exact
        // same (wrong) next sequence number and violated workflow_events_run_seq on insert.
        const [seq] = await tx
            .select({ sequenceNo: workflowEvents.sequenceNo })
            .from(workflowEvents)
            .where(eq(workflowEvents.runId, runId))
            .orderBy(desc(workflowEvents.sequenceNo))
            .limit(1);

        await tx.insert(workflowEvents).values({
            runId,
            actionId,
            eventType:  `action.${nextStatus.toLowerCase()}`,
            sequenceNo: ((seq?.sequenceNo ?? 0) as number) + 1,
            payload:    { nextStatus, ...eventPayload },
            occurredAt: now,
            recordedAt: now,
        });

        // Outbox fanout for downstream workers
        await tx.insert(outboxEvents).values({
            aggregateType: 'agent_run_action',
            aggregateId:   actionId as unknown as string,
            eventType:     `action.${nextStatus.toLowerCase()}`,
            payload:       { runId, actionId, nextStatus, ...eventPayload },
        });
    });
}
