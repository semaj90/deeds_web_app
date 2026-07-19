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
import { eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

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
}

export interface ActionWriteResult {
    runId: string;
    actionId: string;
    /** True when the idempotency key already existed — caller should skip execution. */
    duplicate: boolean;
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
    const runId    = randomUUID();
    const actionId = randomUUID();
    const now      = new Date();
    const inputHash = sha256(JSON.stringify(req.inputPacket));

    return db.transaction(async (tx) => {
        // --- Idempotency guard (read inside transaction for serializable isolation) ---
        const existing = await tx
            .select({ actionId: agentRunActions.actionId, runId: agentRunActions.runId })
            .from(agentRunActions)
            .where(eq(agentRunActions.idempotencyKey, req.idempotencyKey))
            .limit(1);

        if (existing.length > 0) {
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
            sequenceNo:      1,
            actionType:      req.actionType,
            inputPacket:     req.inputPacket,
            inputHash,
            permissionScope: req.permissionScope,
            riskLevel:       req.riskLevel ?? 0,
            status:          'PROPOSED',
            idempotencyKey:  req.idempotencyKey,
            causationId:     req.causationId as string | undefined,
        } satisfies NewAgentRunAction);

        // 3. workflow_events — append-only audit
        await tx.insert(workflowEvents).values({
            runId,
            actionId,
            eventType:  'action.proposed',
            sequenceNo: 1,
            payload: {
                actionType:      req.actionType,
                inputHash,
                permissionScope: req.permissionScope,
                riskLevel:       req.riskLevel ?? 0,
            },
            occurredAt: now,
            recordedAt: now,
        });

        // 4. outbox_events — worker fanout (Redis/Qdrant/mmap)
        await tx.insert(outboxEvents).values({
            aggregateType: 'agent_run_action',
            aggregateId:   actionId as unknown as string,
            eventType:     `${req.actionType}.proposed`,
            payload: {
                runId,
                actionId,
                actionType:     req.actionType,
                inputHash,
                idempotencyKey: req.idempotencyKey,
                tenantId:       req.tenantId,
            },
        });

        return { runId, actionId, duplicate: false };
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

        // Append event — get current max sequence_no first
        const [seq] = await tx
            .select({ max: agentRunActions.sequenceNo })
            .from(agentRunActions)
            .where(eq(agentRunActions.runId, runId))
            .limit(1);

        await tx.insert(workflowEvents).values({
            runId,
            actionId,
            eventType:  `action.${nextStatus.toLowerCase()}`,
            sequenceNo: ((seq?.max ?? 1) as number) + 1,
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
