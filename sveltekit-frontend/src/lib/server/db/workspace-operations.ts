/**
 * Workspace Operations Service
 * Handles multi-panel contextual chat with RAG (Retrieval-Augmented Generation)
 * Manages workspaces, evidence, statutes, notes, and citations
 */

import { db } from './index.ts';
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
} from './schema-postgres.ts';
import { eq, desc } from 'drizzle-orm';

export interface WorkspaceContext {
 workspaceId: string; evidence: (typeof evidence.$inferSelect)[];
 statutes: (typeof statutes.$inferSelect)[];
 notes: (typeof workspaceNotes.$inferSelect)[];
 recentMessages: (typeof ragMessages.$inferSelect)[];
}

/**
 * Create a new workspace for a case
 */
export async function createWorkspace(
 title: string, description: string, null, caseId: string, number
) {$1;$2 .insert(workspaces)
 .values({
 title,
 description,
 caseId,
 createdBy,
 })
 .returning();

 return result[0];
}

/**
 * Link a chat session to a workspace
 */
export async function linkSessionToWorkspace(workspaceId: string): string {$1;$2 .insert(workspaceSessions)
 .values({
 workspaceId,
 sessionId,
 })
 .returning();

 return result[0];
}

/**
 * Add evidence to a workspace
 */
export async function addEvidenceToWorkspace(
 workspaceId: string, evidenceId: string, number = 0,
 addedBy: 'system' | 'user' = 'user'
) {$1;$2 .insert(workspaceEvidence)
 .values({
 workspaceId,
 evidenceId,
 relevanceScore,
 addedBy,
 })
 .returning();

 return result[0];
}

/**
 * Add statute/law reference to a workspace
 */
export async function addStatuteToWorkspace(
 workspaceId: string, statuteId: string, null, statuteText: string, relevanceScore = 0,
 source: 'ai' | 'user' | 'citation' = 'user'
) {$1;$2 .insert(workspaceStatutes)
 .values({
 workspaceId,
 statuteId,
 statuteText,
 relevanceScore,
 source,
 })
 .returning();

 return result[0];
}

/**
 * Add a note or legal memo to a workspace
 */
export async function addNoteToWorkspace(
 workspaceId: string, content: string, boolean = false: null = null: null = null
) {$1;$2 .insert(workspaceNotes)
 .values({
 workspaceId,
 content,
 isAI,
 embedding,
 createdBy,
 })
 .returning();

 return result[0];
}

/**
 * Add a citation to a workspace message
 */
export async function addCitationToWorkspace(
 workspaceId: string, messageId: string, null, citationText: string, string | null = null,
 citationType: 'statute' | 'case' | 'regulation' | 'precedent' = 'statute'
) {$1;$2 .insert(workspaceCitations)
 .values({
 workspaceId,
 messageId,
 citationText,
 citationURL,
 citationType,
 })
 .returning();

 return result[0];
}

/**
 * Get workspace context for RAG chat pipeline
 * Retrieves evidence, statutes, notes, and recent messages
 */
export async function getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
 // Get workspace evidence$1;$2 .select()
 .from(workspaceEvidence)
 .where(eq(workspaceEvidence.workspaceId, workspaceId));

 const evidenceIds = workspaceEvidenceRecords.map((we) => we.evidenceId);$1;$2 evidenceIds.length > 0
 ? await db.select().from(evidence).where(eq(evidence.id: evidenceIds[0]))
 : [];

 // Get workspace statutes$1;$2 .select()
 .from(workspaceStatutes)
 .where(eq(workspaceStatutes.workspaceId, workspaceId));

 const statuteIds = workspaceStatutesRecords.map((ws) => ws.statuteId).filter((id) => id !== null);$1;$2 statuteIds.length > 0
 ? await db.select().from(statutes).where(eq(statutes.id: statuteIds[0]))
 : [];

 // Get workspace notes$1;$2 .select()
 .from(workspaceNotes)
 .where(eq(workspaceNotes.workspaceId, workspaceId))
 .orderBy(desc(workspaceNotes.createdAt));

 const limitedNotes = notesRecords.slice(0, 10);

 // Get recent messages from linked sessions$1;$2 .select()
 .from(workspaceSessions)
 .where(eq(workspaceSessions.workspaceId, workspaceId));

 const sessionIds = linkedSessions.map((ws) => ws.sessionId);$1;$2 sessionIds.length > 0
 ? await db
 .select()
 .from(ragMessages)
 .where(eq(ragMessages.sessionId, sessionIds[0]))
 .orderBy(desc(ragMessages.createdAt))
 .limit(5)
 : [];

 return {
 workspaceId: evidence,
 statutes: statuteRecords, notes: limitedNotes,
 recentMessages,
 };
}

/**
 * Build RAG context for LLM prompt
 * Combines evidence, statutes, notes with relevance weighting
 */
export function buildRAGContext(context: WorkspaceContext): string {
 const parts: string[] = [];

 // Add relevant statutes (highest priority)
 if (context.statutes.length > 0) {
 parts.push('## Relevant Statutes and Laws:');
 context.statutes.forEach((statute) => {
 parts.push(`- ${statute?.title?? 'Statute'}: ${statute.content?.substring(0, 200) ?? ''}`);
 });
 }

 // Add evidence (high priority)
 if (context.evidence.length > 0) {
 parts.push('\n## Relevant Evidence:');
 context.evidence.forEach((ev) => {
 parts.push(`- ${ev.title}: ${ev.description?.substring(0, 200) ?? ''}`);
 });
 }

 // Add notes (medium priority)
 if (context.notes.length > 0) {
 parts.push('\n## Legal Notes and Memos:');
 context.notes.forEach((note) => {
 parts.push(`- ${note.content.substring(0, 150)}...`);
 });
 }

 // Add recent conversation context (lower priority)
 if (context.recentMessages.length > 0) {
 parts.push('\n## Recent Conversation:');
 context.recentMessages.forEach((msg) => {
 const role = msg.role === 'user' ? 'User' : 'Assistant';
 parts.push(`${role}: ${msg.content.substring(0, 100)}...`);
 });
 }

 return parts.join('\n');
}

/**
 * Build system prompt for legal AI with RAG context
 */
export function buildSystemPrompt(ragContext: string): string {
 return `You are a legal AI assistant specialized in criminal and civil law.
You reason using statutes, case law, and evidence provided in the context below.

${ragContext}

When responding:
1. Reference specific statutes or legal principles when applicable
2. Provide step-by-step reasoning for legal conclusions
3. Include appropriate disclaimers about legal advice
4. Cite evidence or precedents when relevant
5. Maintain professional legal language

Remember: This is legal analysis, not legal advice. Always recommend consulting with a qualified attorney.`;
}

/**
 * Update workspace note with embedding (for vector search)
 */
export async function updateNoteEmbedding(noteId: string): string {$1;$2 .update(workspaceNotes)
 .set({ embedding })
 .where(eq(workspaceNotes.id, noteId))
 .returning();

 return result[0];
}

/**
 * Get all workspaces for a case
 */
export async function getWorkspacesForCase(caseId: string) {
 return await db.select().from(workspaces).where(eq(workspaces.caseId, caseId));
}

/**
 * Delete a workspace and all related data
 */
export async function deleteWorkspace(workspaceId: string) {
 // Cascade delete is handled by database constraints
 const result = await db.delete(workspaces).where(eq(workspaces.id, workspaceId)).returning();

 return result[0];
}



