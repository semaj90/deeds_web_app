import { db } from '$lib/server/db/client.js';
import {
    agentRuns,
    agentRunActions,
    workflowEvents,
    outboxEvents,
    type NewAgentRun,
    type NewAgentRunAction,
} from '$lib/server/db/schema-postgres.js';
import { desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

export interface ActionRequest {
    workflowName: string;
    workflowVersion: string;
    tenantId: string;
    initiatedBy: string;
    inputPacket: Record<string, unknown>;
    actionType: string;
    permissionScope: string[];
    riskLevel?: number;
    causationId?: string;
    idempotencyKey: string;
}

export interface ActionWriteResult {
    runId: string;
    actionId: string;
    duplicate: boolean;
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export async function writeActionAtomically(req: ActionRequest): Promise<ActionWriteResult> {
    const runId = randomUUID();
    const actionId = randomUUID();
    const now = new Date();
    const inputHash = sha256(JSON.stringify(req.inputPacket));

    return db.transaction(async (tx) => {
        const existing = await tx
            .select({ actionId: agentRunActions.actionId, runId: agentRunActions.runId })
            .from(agentRunActions)
            .where(eq(agentRunActions.idempotencyKey, req.idempotencyKey))
            .limit(1);

        if (existing.length > 0) {
            return { runId: existing[0]!.runId, actionId: existing[0]!.actionId, duplicate: true };
        }

        await tx.insert(agentRuns).values({
            runId,
            workflowName: req.workflowName,
            workflowVersion: req.workflowVersion,
            status: 'PROPOSED',
            tenantId: req.tenantId as unknown as string,
            initiatedBy: req.initiatedBy,
            state: {},
            startedAt: now,
        } satisfies NewAgentRun);

        await tx.insert(agentRunActions).values({
            actionId,
            runId,
            sequenceNo: 1,
            actionType: req.actionType,
            inputPacket: req.inputPacket,
            inputHash,
            permissionScope: req.permissionScope,
            riskLevel: req.riskLevel ?? 0,
            status: 'PROPOSED',
            idempotencyKey: req.idempotencyKey,
            causationId: req.causationId as string | undefined,
        } satisfies NewAgentRunAction);

        await tx.insert(workflowEvents).values({
            runId,
            actionId,
            eventType: 'action.proposed',
            sequenceNo: 1,
            payload: { actionType: req.actionType, inputHash, permissionScope: req.permissionScope, riskLevel: req.riskLevel ?? 0 },
            occurredAt: now,
            recordedAt: now,
        });

        await tx.insert(outboxEvents).values({
            aggregateType: 'agent_run_action',
            aggregateId: actionId as unknown as string,
            eventType: `${req.actionType}.proposed`,
            payload: { runId, actionId, actionType: req.actionType, inputHash, idempotencyKey: req.idempotencyKey, tenantId: req.tenantId },
        });

        return { runId, actionId, duplicate: false };
    });
}

export type ActionStatus =
    | 'VALIDATED' | 'AUTHORIZED' | 'READY' | 'RUNNING'
    | 'SUCCEEDED' | 'RETRY_PENDING' | 'DENIED' | 'WAITING_APPROVAL' | 'FAILED';

/**
 * Advance an action and append a monotonically increasing workflow event.
 * Sequence ownership belongs to workflow_events, not agent_run_actions.
 */
export async function advanceActionStatus(
    runId: string,
    actionId: string,
    nextStatus: ActionStatus,
    eventPayload: Record<string, unknown> = {},
): Promise<void> {
    const now = new Date();

    await db.transaction(async (tx) => {
        await tx.update(agentRunActions).set({
            status: nextStatus,
            startedAt: nextStatus === 'RUNNING' ? now : undefined,
            finishedAt: ['SUCCEEDED', 'FAILED', 'DENIED'].includes(nextStatus) ? now : undefined,
        }).where(eq(agentRunActions.actionId, actionId));

        if (['SUCCEEDED', 'FAILED', 'DENIED'].includes(nextStatus)) {
            await tx.update(agentRuns)
                .set({ status: nextStatus, completedAt: now })
                .where(eq(agentRuns.runId, runId));
        }

        const [latestEvent] = await tx
            .select({ sequenceNo: workflowEvents.sequenceNo })
            .from(workflowEvents)
            .where(eq(workflowEvents.runId, runId))
            .orderBy(desc(workflowEvents.sequenceNo))
            .limit(1);
        const nextSequenceNo = Number(latestEvent?.sequenceNo ?? 0) + 1;

        await tx.insert(workflowEvents).values({
            runId,
            actionId,
            eventType: `action.${nextStatus.toLowerCase()}`,
            sequenceNo: nextSequenceNo,
            payload: { nextStatus, ...eventPayload },
            occurredAt: now,
            recordedAt: now,
        });

        await tx.insert(outboxEvents).values({
            aggregateType: 'agent_run_action',
            aggregateId: actionId as unknown as string,
            eventType: `action.${nextStatus.toLowerCase()}`,
            payload: { runId, actionId, nextStatus, sequenceNo: nextSequenceNo, ...eventPayload },
        });
    });
}
