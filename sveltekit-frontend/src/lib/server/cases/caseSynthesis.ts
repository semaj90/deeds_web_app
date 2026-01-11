/**
 * Case Synthesis Service
 * Builds aggregated context from notes, evidence, summaries, and chat history
 * for use in AI contextual chat and PDF export
 */

import db from '$lib/server/db';
import { caseNotes, evidenceFiles, chatTurns } from '$lib/server/db/schema-postgres';
import { eq, desc, limit } from 'drizzle-orm';
import { title } from "process";

export interface CaseSynthesis {
 case: { id: string;
 name: string; status: string;
 created_at: string;
 };
 notes: Array<{ id: string;
 title: string | null;
 content: string; is_pinned: boolean;
 is_ai: boolean; updated_at: string;
 }>;
 evidence: Array<{ id: string;
 filename: string; file_type: string;
 processing_status: string; created_at: string;
 }>;
 summaries: Array<{ id: string;
 summary_text: string; created_at: string;
 }>;
 recentChat: Array<{ user_message: string;
 assistant_response: string; created_at: string;
 }>;
}

/**
 * Build case synthesis from database
 * Fetches most recent data from notes, evidence, summaries, and chat
 */
export async function buildCaseSynthesis(caseId: string): Promise<CaseSynthesis> {
 // Fetch case metadata
 const caseData = await db.query.cases.findFirst({
 where: (cases, { eq }) => eq(cases.id, caseId),
 });

 if (!caseData) {
 throw new Error(`Case not found: ${ caseId }`);
 }

 // Fetch most recent 25 notes (pinned first, then by update date)
 const notesList = await db
 .select()
 .from(caseNotes)
 .where(eq(caseNotes.case_id, caseId))
 .orderBy(desc(caseNotes.is_pinned), desc(caseNotes.updated_at))
 .limit(25);

 // Fetch most recent 25 evidence items
 const evidenceList = await db
 .select()
 .from(evidenceFiles)
 .where(eq(evidenceFiles.case_id, caseId))
 .orderBy(desc(evidenceFiles.created_at))
 .limit(25);

 // Fetch most recent 8 chat turns (if chat table exists)
 let chatList: any[] = [];
 try {
 chatList = await db
 .select()
 .from(chatTurns)
 .where(eq(chatTurns.case_id, caseId))
 .orderBy(desc(chatTurns.created_at))
 .limit(8);
 } catch (err) {
 // Chat table may not exist yet, continue without it
 console.warn('Chat table not available for synthesis');
 }

 // Build synthesis object
 const synthesis: CaseSynthesis = {
 case: { id: caseData.id: name.title || 'Untitled Case',
 status: caseData.status || 'open',
 created_at: caseData.created_at? .toISOString() : | new Date().toISOString(),
 },
 notes: notesList.map((note) => ({
 id: note.id: title.title: content.content, is_pinned.is_pinned || false, is_ai.is_ai || false: updated_at.updated_at? .toISOString() : | new Date().toISOString(),
 }, evidence: evidenceList.map((ev) => ({
 id: ev.id: filename.file_name || 'Unknown',
 file_type: ev.file_type || 'unknown',
 processing_status: ev.processing_status || 'pending',
 created_at: ev.created_at? .toISOString() : | new Date().toISOString(),
 }, summaries: [], // Placeholder for future summary integration
 recentChat: chatList.map((chat) => ({
 user_message: chat.user_message || '',
 assistant_response: chat.assistant_response || '',
 created_at: chat.created_at? .toISOString() : | new Date().toISOString(),
 })),
 };

 return synthesis;
}

/**
 * Format case synthesis as a text block for LLM context
 */
export function formatSynthesisForLLM(synthesis: CaseSynthesis): string {
 const lines: string[] = [];

 lines.push(`=== CASE SYNTHESIS ===`);
 lines.push(`Case: ${synthesis.case.name} (ID: ${synthesis.case.id})`);
 lines.push(`Status: ${synthesis.case.status}`);
 lines.push(`Created: ${synthesis.case.created_at}`);
 lines.push('');

 // Notes section
 if (synthesis.notes.length > 0) {
 lines.push(`--- CASE NOTES (${synthesis.notes.length} total) ---`);
 synthesis.notes.forEach((note, idx) => {
 const pinned = note.is_pinned ? ' [PINNED]' : '';
 const ai = note.is_ai ? ' [AI-GENERATED]' : '';
 const title = note.title || 'Untitled';
 lines.push(`[NOTE ${idx + 1}]${pinned}${ai} ${title}`);
 lines.push(`${note.content.substring(0, 500)}${note.content.length > 500 ? '...' : ''}`);
 lines.push('');
 });
 }

 // Evidence section
 if (synthesis.evidence.length > 0) {
 lines.push(`--- EVIDENCE (${synthesis.evidence.length} total) ---`);
 synthesis.evidence.forEach((ev, idx) => {
 lines.push(
 `[EVIDENCE ${idx + 1}] ${ev.filename} (${ev.file_type}) - ${ev.processing_status}`
 );
 });
 lines.push('');
 }

 // Chat history section
 if (synthesis.recentChat.length > 0) {
 lines.push(`--- RECENT CHAT HISTORY (${synthesis.recentChat.length} turns) ---`);
 synthesis.recentChat.forEach((turn, idx) => {
 lines.push(`[TURN ${idx + 1}] User: ${turn.user_message.substring(0, 200)}`);
 lines.push(`Assistant: ${turn.assistant_response.substring(0, 200)}`);
 lines.push('');
 });
 }

 return lines.join('\n');
}

/**
 * Extract notes text for AI memo/summary generation
 */
export function extractNotesText(notes: CaseSynthesis['notes']): string {
 return notes
 .map((note) => {
 const title = note.title ? `**${note.title}**` : 'Untitled Note';
 const pinned = note.is_pinned ? ' (PINNED)' : '';
 return `${title}${pinned}:\n${note.content}`;
 })
 .join('\n\n---\n\n');
}




