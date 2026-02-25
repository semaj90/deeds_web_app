/**
 * ACE Context Assembler — Central Orchestration Module
 *
 * Assembles a complete ACEContext from all data sources in parallel:
 *   1. User profile (analytics + DB)
 *   2. Case context (PostgreSQL)
 *   3. RAG chunks (Qdrant vector search)
 *   4. KAG graph neighbors (Neo4j → PostgreSQL fallback)
 *   5. Chat history (PostgreSQL/Redis)
 *   6. Entity extraction (regex + optional LLM)
 *   7. Practice area template selection
 *
 * Token budget allocation per source is defined in types.ts.
 */
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { ACEContext, ACEPrompt, ACEUserProfile } from './types.js';
import { TOKEN_BUDGET } from './types.js';
import { selectPracticeTemplate } from './practice-templates.js';
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { getTopQueryPatterns, getWeeklySummary } from '$lib/server/analytics/event-logger.js';

/**
 * Assemble a complete ACE context from all data sources.
 * All fetches run in parallel with graceful fallbacks.
 */
export async function assembleACEContext(opts: {
	query: string;
	userId?: string;
	caseId?: string;
	conversationId?: string;
	maxTokens?: number;
}): Promise<ACEContext> {
	const { query, userId, caseId, conversationId } = opts;

	// Extract entities immediately (regex, no async)
	const legalTags = extractLegalTags(query);
	const entities = {
		statutes: legalTags.statutes,
		cases: legalTags.cases,
		persons: [] as string[],
		organizations: [] as string[],
		dates: [] as string[]
	};

	// Run all data fetches in parallel
	const [userProfile, caseContext, ragChunks, kagNeighbors, chatHistory] = await Promise.all([
		userId ? fetchUserProfile(userId) : Promise.resolve(null),
		caseId ? fetchCaseContext(caseId) : Promise.resolve(null),
		fetchRAGChunks(query),
		caseId ? fetchKAGNeighbors(caseId) : Promise.resolve([]),
		conversationId ? fetchChatHistory(conversationId) : Promise.resolve([])
	]);

	// Determine practice area from case or user profile
	const practiceArea = extractPracticeArea(caseContext, userProfile);
	const practiceTemplate = selectPracticeTemplate(practiceArea);

	// Generate query tags from entities + practice area
	const queryTags: string[] = [
		...legalTags.statutes.slice(0, 3),
		...legalTags.cases.slice(0, 3),
		...(practiceArea ? [practiceArea] : [])
	];

	return {
		userProfile,
		caseContext,
		ragChunks,
		kagNeighbors,
		chatHistory,
		entities,
		practiceTemplate,
		queryTags
	};
}

/**
 * Build the final ACE prompt from assembled context.
 */
export function buildACEPrompt(context: ACEContext, query: string): ACEPrompt {
	const lines: string[] = [];
	const confidenceFactors: Record<string, number> = {};

	// 1. System instructions
	lines.push('You are YorHA, a legal AI assistant. Provide accurate, well-cited legal analysis.');

	// 2. Practice template
	if (context.practiceTemplate) {
		lines.push(`\n## Practice Area Guidelines\n${context.practiceTemplate}`);
		confidenceFactors.practiceTemplate = 0.9;
	}

	// 3. User profile personalization
	if (context.userProfile) {
		const p = context.userProfile;
		const profileLines: string[] = [];
		if (p.jurisdiction) profileLines.push(`Jurisdiction: ${p.jurisdiction}`);
		if (p.practiceAreas.length) profileLines.push(`Practice areas: ${p.practiceAreas.join(', ')}`);
		if (p.preferredTone !== 'formal') profileLines.push(`Tone: ${p.preferredTone}`);
		if (p.experienceLevel) profileLines.push(`Experience: ${p.experienceLevel}`);
		if (profileLines.length) {
			lines.push(`\n## User Profile\n${profileLines.join('. ')}.`);
			confidenceFactors.userProfile = 0.7;
		}
	}

	// 4. Case context
	if (context.caseContext) {
		lines.push(`\n## Active Case Context\n${truncate(context.caseContext, TOKEN_BUDGET.caseContext * 4)}`);
		confidenceFactors.caseContext = 0.95;
	}

	// 5. RAG chunks (highest priority retrieval)
	if (context.ragChunks.length > 0) {
		const chunksText = context.ragChunks
			.slice(0, 5)
			.map((c, i) => `[Source ${i + 1} (score: ${c.score.toFixed(2)})] ${truncate(c.content, 300)}`)
			.join('\n');
		lines.push(`\n## Retrieved Context\n${chunksText}`);
		confidenceFactors.ragChunks = Math.max(...context.ragChunks.map((c) => c.score));
	}

	// 6. KAG graph neighbors
	if (context.kagNeighbors.length > 0) {
		const neighborsText = context.kagNeighbors
			.slice(0, 5)
			.map((n) => `- ${n.title} (${n.relationship})`)
			.join('\n');
		lines.push(`\n## Related Entities\n${neighborsText}`);
		confidenceFactors.kagNeighbors = 0.8;
	}

	// 7. Chat history (last N turns)
	if (context.chatHistory.length > 0) {
		const historyText = context.chatHistory
			.slice(-6) // last 3 exchanges
			.map((m) => `${m.role}: ${truncate(m.content, 200)}`)
			.join('\n');
		lines.push(`\n## Conversation History\n${historyText}`);
		confidenceFactors.chatHistory = 0.6;
	}

	// 8. Entity context
	const allEntities = [
		...context.entities.statutes.map((s) => `Statute: ${s}`),
		...context.entities.cases.map((c) => `Case: ${c}`),
		...context.entities.persons.map((p) => `Person: ${p}`)
	];
	if (allEntities.length > 0) {
		lines.push(`\n## Detected Entities\n${allEntities.slice(0, 10).join(', ')}`);
		confidenceFactors.entities = 0.85;
	}

	// 9. Self-prompting instructions
	const selfPrompt =
		'After answering, briefly assess: Did you cite specific statutes/precedents? ' +
		'Is the answer jurisdiction-appropriate? Flag any uncertainty.';

	return {
		systemPrompt: lines.join('\n'),
		contextWindow: lines.slice(1).join('\n'), // everything after system instruction
		maxTokenBudget: TOKEN_BUDGET.total,
		confidenceFactors,
		selfPromptInstructions: selfPrompt,
		preferredBackend: 'auto'
	};
}

// ── Data Fetchers (all graceful) ────────────────────────────────────────

async function fetchUserProfile(userId: string): Promise<ACEUserProfile | null> {
	try {
		const [patterns, summary] = await Promise.all([
			getTopQueryPatterns(userId, 5),
			getWeeklySummary(userId)
		]);

		return {
			userId,
			topIntents: summary.topIntents,
			preferredTone: 'formal',
			avgLatencyMs: summary.avgLatencyMs,
			cacheHitRate: summary.cacheHitRate,
			recentQueries: patterns.map((p) => ({
				hash: p.query_hash,
				preview: '' // privacy: hash only
			})),
			practiceAreas: [],
			jurisdiction: null,
			experienceLevel: null
		};
	} catch {
		return null;
	}
}

async function fetchCaseContext(caseId: string): Promise<string | null> {
	try {
		const db = (await import('$lib/server/db')).default;
		const rows = await db.execute(
			sql`SELECT title, description, jurisdiction, court, status, practice_area
				FROM cases WHERE id = ${caseId} LIMIT 1`
		);
		const c = [...rows][0] as Record<string, unknown> | undefined;
		if (!c) return null;

		const parts: string[] = [];
		if (c.title) parts.push(`Title: ${c.title}`);
		if (c.jurisdiction) parts.push(`Jurisdiction: ${c.jurisdiction}`);
		if (c.court) parts.push(`Court: ${c.court}`);
		if (c.status) parts.push(`Status: ${c.status}`);
		if (c.description) parts.push(`Description: ${String(c.description).slice(0, 500)}`);
		return parts.join('\n');
	} catch {
		return null;
	}
}

async function fetchRAGChunks(
	query: string
): Promise<Array<{ content: string; score: number; source: string }>> {
	try {
		const ollamaUrl = ENV.OLLAMA_BASE_URL;
		// Generate embedding for the query
		const embedRes = await fetch(`${ollamaUrl}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
			signal: AbortSignal.timeout(5000)
		});
		if (!embedRes.ok) return [];

		const embedData = await embedRes.json();
		const embedding = embedData.embedding as number[];
		if (!embedding?.length) return [];

		// Search Qdrant evidence_items collection
		const { QdrantClient } = await import('@qdrant/js-client-rest');
		const qdrant = new QdrantClient({ url: ENV.QDRANT_URL });

		const results = await qdrant.search('evidence_items', {
			vector: { name: 'content', vector: embedding },
			limit: 5,
			score_threshold: 0.5,
			with_payload: true
		});

		return results.map((r) => ({
			content: String((r.payload as Record<string, unknown>)?.content ?? ''),
			score: r.score,
			source: String((r.payload as Record<string, unknown>)?.source ?? 'evidence')
		}));
	} catch {
		return [];
	}
}

async function fetchKAGNeighbors(
	caseId: string
): Promise<Array<{ nodeId: string; title: string; relationship: string; score?: number }>> {
	// Try Neo4j first, fallback to PostgreSQL
	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });
		try {
			const result = await session.run(
				`MATCH (c:Case {id: $caseId})-[r]-(n)
				 RETURN n.id AS nodeId, n.title AS title, type(r) AS relationship
				 LIMIT 10`,
				{ caseId }
			);
			return result.records.map((rec) => ({
				nodeId: String(rec.get('nodeId') ?? ''),
				title: String(rec.get('title') ?? ''),
				relationship: String(rec.get('relationship') ?? '')
			}));
		} finally {
			await session.close();
		}
	} catch {
		// Neo4j unavailable — try PostgreSQL graph tables
		try {
			const db = (await import('$lib/server/db')).default;
			const rows = await db.execute(
				sql`SELECT target_id AS node_id, label AS title, relationship_type AS relationship
					FROM yorha_evidence_connections
					WHERE source_id = ${caseId}
					LIMIT 10`
			);
			return [...rows].map((r: any) => ({
				nodeId: String(r.node_id ?? ''),
				title: String(r.title ?? ''),
				relationship: String(r.relationship ?? '')
			}));
		} catch {
			return [];
		}
	}
}

async function fetchChatHistory(
	conversationId: string
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
	try {
		const db = (await import('$lib/server/db')).default;
		const rows = await db.execute(
			sql`SELECT role, content FROM chat_messages
				WHERE chat_id = ${conversationId}
				ORDER BY created_at DESC
				LIMIT 10`
		);
		return [...rows]
			.reverse()
			.map((r: any) => ({
				role: r.role as 'user' | 'assistant' | 'system',
				content: String(r.content ?? '')
			}));
	} catch {
		return [];
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────

function truncate(text: string, maxChars: number): string {
	return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
}

function extractPracticeArea(
	caseContext: string | null,
	userProfile: ACEUserProfile | null
): string | null {
	// Try case context first (look for practice_area field)
	if (caseContext) {
		const match = caseContext.match(/practice_area[:\s]+(\w[\w-]*)/i);
		if (match) return match[1].toLowerCase();
	}
	// Fall back to user profile
	if (userProfile?.practiceAreas.length) {
		return userProfile.practiceAreas[0];
	}
	return null;
}
