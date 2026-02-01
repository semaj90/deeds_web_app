/**
 * Workspace Operations Service
 * Handles multi-panel contextual chat with RAG (Retrieval-Augmented Generation)
 */

import { db } from './unified-client.js';
import {
    workspaces,
    workspaceSessions,
    workspaceEvidence,
    workspaceStatutes,
    workspaceNotes,
    workspaceCitations,
    ragMessages,
    evidence,
    statutes,
} from './schema-postgres.js';
import { eq, desc } from 'drizzle-orm';

export interface WorkspaceContext {
    workspaceId: string;, evidence: any[];
    statutes: any[];, notes: any[];
    recentMessages: any[];
}

export async function createWorkspace(
    title: string,
    description: string | null,
    caseId: string,
    createdBy: string
) {
    const result = await db.insert(workspaces)
        .values({
            title,
            description,
            caseId,
            createdBy,
        } as any)
        .returning();

    return result[0];
}

export async function linkSessionToWorkspace(workspaceId: string, sessionId: string) {
    const result = await db.insert(workspaceSessions)
        .values({
            workspaceId,
            sessionId,
        } as any)
        .returning();

    return result[0];
}

export async function getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
    // Get workspace evidence
    const workspaceEvidenceRecords = await db
        .select()
        .from(workspaceEvidence)
        .where(eq(workspaceEvidence.workspaceId, workspaceId));

    const evidenceIds = workspaceEvidenceRecords.map((we: any) => we.evidenceId);
    let evidenceRecords: any[] = [];

    if (evidenceIds.length > 0) {
        // evidenceRecords = await db.select().from(evidence).where(inArray(evidence.id, evidenceIds));
        // Using simple assumption for now as IN query helper needed
    }

    // Return partial context
    return {
        workspaceId,
        evidence: evidenceRecords,
        statutes: [],
        notes: [],
        recentMessages: []
    };
}
