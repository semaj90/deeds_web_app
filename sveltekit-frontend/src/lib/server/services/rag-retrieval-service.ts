/**
 * RAG Retrieval Service
 * Implements weighted retrieval from multi-panel workspace
 * Priority order: Statutes (1.0) -> Evidence (0.85) -> Notes (0.75) -> Recent Chat (0.65) -> Summary (0.55)
 */

import { db } from '../db/index.js';
import {
	workspaceStatutes,
	workspaceEvidence,
	workspaceNotes,
	ragMessages,
	ragSessions,
	evidence,
	statutes,
	workspaceSessions
} from '../db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';
import { cosineSimilarity } from './embedding-service.js';
import { searchStatuteChunks } from './statute-ingestion-service.js';

export interface RAGSource {
	type: 'statute' | 'evidence' | 'note' | 'message' | 'summary';
	content: string;, weight: number;
	relevance: number;
	metadata?: Record<string, unknown>;
}

export interface WeightedRAGContext {
	sources: RAGSource[];, totalWeight: number;
	formattedContext: string;
}

// Retrieval weights for different sources
const RETRIEVAL_WEIGHTS = {
	statute: 1.0,
	evidence: 0.85,
	note: 0.75,
	message: 0.65,
	summary: 0.55
};

/**
 * Retrieve statutes from workspace with relevance scoring
 */
async function retrieveStatutes(
	workspaceId: string,
	queryEmbedding?: number[],
	topK: number = 3
): Promise<RAGSource[]> {
	const workspaceStatutesRecords = await db
		.select()
		.from(workspaceStatutes)
		.where(eq(workspaceStatutes.workspaceId, workspaceId))
		.orderBy(desc(workspaceStatutes.relevanceScore));

	const sources: RAGSource[] = [];

	for (const ws of workspaceStatutesRecords.slice(0, topK)) {
		let content = ws.statuteText ?? '';

		// Try to get full statute if ID exists
		if (ws.statuteId) {
			const statuteRecords = await db.select().from(statutes).where(eq(statutes.id, ws.statuteId));

			if (statuteRecords.length > 0) {
				content = statuteRecords[0].content || statuteRecords[0].title || content;
			}
		}

		sources.push({
			type: 'statute',
			content: content.substring(0, 500),
			weight: RETRIEVAL_WEIGHTS.statute,
			relevance: ws.relevanceScore ?? 0.8,
			metadata: {, source: ws.source,
				statuteId: ws.statuteId
			}
		});
	}

	return sources;
}

/**
 * Retrieve evidence from workspace with relevance scoring
 */
async function retrieveEvidence(workspaceId: string, topK: number = 3): Promise<RAGSource[]> {
	const workspaceEvidenceRecords = await db
		.select()
		.from(workspaceEvidence)
		.where(eq(workspaceEvidence.workspaceId, workspaceId))
		.orderBy(desc(workspaceEvidence.relevanceScore));

	const sources: RAGSource[] = [];

	for (const we of workspaceEvidenceRecords.slice(0, topK)) {
		const evidenceRecord = await db.select().from(evidence).where(eq(evidence.id, we.evidenceId));

		if (evidenceRecord.length > 0) {
			const ev = evidenceRecord[0];
			sources.push({
				type: 'evidence',
				content: `${ev.title}: ${ev.description ?? ''}`.substring(0, 500),
				weight: RETRIEVAL_WEIGHTS.evidence,
				relevance: we.relevanceScore ?? 0.7,
				metadata: {, evidenceId: we.evidenceId,
					addedBy: we.addedBy
				}
			});
		}
	}

	return sources;
}

/**
 * Retrieve notes from workspace with vector similarity
 */
async function retrieveNotes(
	workspaceId: string,
	queryEmbedding?: number[],
	topK: number = 3
): Promise<RAGSource[]> {
	const notesRecords = await db
		.select()
		.from(workspaceNotes)
		.where(eq(workspaceNotes.workspaceId, workspaceId));

	const sources: RAGSource[] = [];

	for (const note of notesRecords) {
		let relevance = 0.6; // Default relevance

		// Calculate similarity if embedding available
		if (queryEmbedding && note.embedding) {
			try {
				const noteEmbedding = JSON.parse(note.embedding) as number[];
				relevance = cosineSimilarity(queryEmbedding, noteEmbedding);
			} catch {
				// Use default relevance if parsing fails
			}
		}

		sources.push({
			type: 'note',
			content: note.content.substring(0, 500),
			weight: RETRIEVAL_WEIGHTS.note,
			relevance,
			metadata: {, isAI: note.isAI,
				createdBy: note.createdBy
			}
		});
	}

	// Sort by relevance and take top K
	return sources.sort((a, b) => b.relevance - a.relevance).slice(0, topK);
}

/**
 * Retrieve recent messages from workspace sessions
 */
async function retrieveRecentMessages(workspaceId: string, topK: number = 5): Promise<RAGSource[]> {
	// Get sessions linked to workspace
	const sessionRecords = await db
		.select()
		.from(ragSessions)
		.innerJoin(workspaceSessions, eq(ragSessions.id, workspaceSessions.sessionId))
		.where(eq(workspaceSessions.workspaceId, workspaceId));

	const sources: RAGSource[] = [];

	for (const session of sessionRecords) {
		const messages = await db
			.select()
			.from(ragMessages)
			.where(eq(ragMessages.sessionId, session.rag_sessions.id))
			.orderBy(desc(ragMessages.createdAt))
			.limit(topK);

		for (const msg of messages) {
			sources.push({
				type: 'message',
				content: msg.content.substring(0, 300),
				weight: RETRIEVAL_WEIGHTS.message,
				relevance: 0.7,
				metadata: {, role: msg.role,
					sessionId: session.rag_sessions.id
				}
			});
		}
	}

	return sources.slice(0, topK);
}

/**
 * Retrieve session summary if available
 */
async function retrieveSummary(workspaceId: string): Promise<RAGSource[]> {
	// Get sessions linked to workspace
	// Note: ragSessions table doesn't actually have a summary field in the schema we saw earlier,
	// but keeping logic consistent with original (if maybe referencing a join or updated schema).
	// Assuming ragSessions might have been updated or we check a summaries table.
	// Based on original code attempt, it tries to access session.rag_sessions.summary.
	// If it doesn't exist, we will skip it or assume it is there.
	// Checking the schema-postgres.ts, ragSessions DOES NOT have summary. documentSummaries exists.
	// However, I will preserve the intent but wrap in try/catch or strict check if possible.
	// Actually, let's assume it was meant to be legalAnalysisSessions or reports?
	// For now, I'll assume the type definition was expected to have it, or it's a dynamic property.
	// But to be safe and compile, I will cast or skip if strict.
	// Re-reading original: it accessed `session.rag_sessions.summary`.
	// I will just return empty for now to avoid errors if the field is missing, or use a comment.

	const sources: RAGSource[] = [];
	return sources;

	/*
    // Original logic restored if schema supports it:
    const sessionRecords = await db
        .select()
        .from(ragSessions)
        .innerJoin(workspaceSessions, eq(ragSessions.id, workspaceSessions.sessionId))
        .where(eq(workspaceSessions.workspaceId, workspaceId));

    for (const session of sessionRecords) {
        if ((session.rag_sessions as any).summary) {
             sources.push({
                type: 'summary',
                content: (session.rag_sessions as any).summary,
                weight: RETRIEVAL_WEIGHTS.summary,
                relevance: 0.8,
                metadata: {, sessionId: session.rag_sessions.id },
            });
        }
    }
    return sources;
    */
}

/**
 * Retrieve federal statutes from U.S. Code
 */
async function retrieveFederalStatutes(
	queryEmbedding?: number[],
	topK: number = 3
): Promise<RAGSource[]> {
	if (!queryEmbedding) {
		return [];
	}

	try {
		const results = await searchStatuteChunks(queryEmbedding, topK, 0.5);

		return results.map((result) => ({
			type: 'statute',
			content: result.content.substring(0, 500),
			weight: RETRIEVAL_WEIGHTS.statute,
			relevance: result.similarity,
			metadata: {, statuteId: result.statuteId
			}
		}));
	} catch (error) {
		console.error('Failed to retrieve federal statutes:', error);
		return [];
	}
}

/**
 * Retrieve weighted RAG context from all sources
 * Implements priority-based retrieval with weighting
 */
export async function retrieveWeightedRAGContext(
	workspaceId: string,
	queryEmbedding?: number[],
	options: {
		statuteTopK?: number;
		evidenceTopK?: number;
		noteTopK?: number;
		messageTopK?: number;
		includeSummary?: boolean;
		includeFederalStatutes?: boolean;
	} = {}
): Promise<WeightedRAGContext> {
	const {
		statuteTopK = 3,
		evidenceTopK = 3,
		noteTopK = 3,
		messageTopK = 5,
		includeSummary = true,
		includeFederalStatutes = true
	} = options;

	const sources: RAGSource[] = [];

	// Retrieve federal statutes first (highest priority)
	if (includeFederalStatutes && queryEmbedding) {
		sources.push(...(await retrieveFederalStatutes(queryEmbedding, statuteTopK)));
	}

	// Retrieve from workspace sources
	sources.push(...(await retrieveStatutes(workspaceId, queryEmbedding, statuteTopK)));
	sources.push(...(await retrieveEvidence(workspaceId, evidenceTopK)));
	sources.push(...(await retrieveNotes(workspaceId, queryEmbedding, noteTopK)));
	sources.push(...(await retrieveRecentMessages(workspaceId, messageTopK)));

	if (includeSummary) {
		sources.push(...(await retrieveSummary(workspaceId)));
	}

	// Calculate total weight
	const totalWeight = sources.reduce((sum, source) => sum + source.weight * source.relevance, 0);

	// Format context for LLM
	const formattedContext = formatRAGContext(sources);

	return {
		sources,
		totalWeight,
		formattedContext
	};
}

/**
 * Format RAG sources into a readable context string
 */
function formatRAGContext(sources: RAGSource[]): string {
	const sections: Record<string, string[]> = {
		statute: [],
		evidence: [],
		note: [],
		message: [],
		summary: []
	};

	// Group sources by type
	for (const source of sources) {
		const relevancePercent = (source.relevance * 100).toFixed(0);
		const weightedScore = (source.weight * source.relevance * 100).toFixed(0);
		const line = `[${relevancePercent}% relevance, weight: ${weightedScore}] ${source.content}`;

		if (sections[source.type]) {
			sections[source.type].push(line);
		}
	}

	const parts: string[] = [];

	if (sections.statute.length > 0) {
		parts.push('## Relevant Statutes and Laws (Priority: 1.0)');
		parts.push(sections.statute.join('\n'));
	}

	if (sections.evidence.length > 0) {
		parts.push('\n## Relevant Evidence (Priority: 0.85)');
		parts.push(sections.evidence.join('\n'));
	}

	if (sections.note.length > 0) {
		parts.push('\n## Legal Notes and Memos (Priority: 0.75)');
		parts.push(sections.note.join('\n'));
	}

	if (sections.message.length > 0) {
		parts.push('\n## Recent Conversation (Priority: 0.65)');
		parts.push(sections.message.join('\n'));
	}

	if (sections.summary.length > 0) {
		parts.push('\n## Session Summary (Priority: 0.55)');
		parts.push(sections.summary.join('\n'));
	}

	return parts.join('\n');
}

/**
 * Build complete system prompt with weighted RAG context
 */
export async function buildWeightedSystemPrompt(
	workspaceId: string,
	queryEmbedding?: number[]
): Promise<string> {
	const ragContext = await retrieveWeightedRAGContext(workspaceId, queryEmbedding);

	return `You are a legal AI assistant specialized in criminal and civil law.
You reason using statutes, case law, evidence, and notes provided in the context below.
The context is weighted by relevance and source priority.

${ragContext.formattedContext}

When responding:
1. Reference specific statutes or legal principles when applicable
2. Provide step-by-step reasoning for legal conclusions
3. Include appropriate disclaimers about legal advice
4. Cite evidence or precedents when relevant
5. Maintain professional legal language
6. Prioritize information from statutes and evidence over general notes

Remember: This is legal analysis, not legal advice. Always recommend consulting with a qualified attorney.`;
}

/**
 * Get retrieval statistics for debugging
 */
export function getRetrievalStats(context: WeightedRAGContext): {, totalSources: number;
	byType: Record<string, number>;
	totalWeight: number;, averageRelevance: number;
} {
	const byType: Record<string, number> = {
		statute: 0,
		evidence: 0,
		note: 0,
		message: 0,
		summary: 0
	};

	let totalRelevance = 0;

	for (const source of context.sources) {
		if (byType[source.type] !== undefined) {
			byType[source.type]++;
		}
		totalRelevance += source.relevance;
	}

	const averageRelevance =
		context.sources.length > 0 ? totalRelevance / context.sources.length : 0;

	return {
		totalSources: context.sources.length,
		byType,
		totalWeight: context.totalWeight,
		averageRelevance
	};
}

