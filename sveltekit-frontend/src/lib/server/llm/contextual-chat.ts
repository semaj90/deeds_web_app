// src/lib/server/llm/contextual-chat.ts
import { db } from '$lib/server/db/client';
import { ragMessages } from '$lib/server/db/schema-postgres.js';
import { callOllamaChat } from '$lib/server/ollama.js';
import { extractKeywords } from '$lib/server/keyword-extractor.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { eq } from 'drizzle-orm';

export type ContextChatRequest = {
	message: string;
	caseId?: string | null;
	sessionId?: string | null;
	userId?: string | null;
	tags?: string[] | null;
	jurisdiction?: string | null;
};

export type Suggestion = {
	query: string;
	reason: string;
	score: number;
};

export type ContextChatResponse = {
	turnId: string;
	answer: string;
	keywords: string[];
	keyPhrases: string[];
	suggestions: Suggestion[];
	latencyMs: number;
	citations?: Array<{
		id: string; source: string;
		score: number
	}>;
};

/**
 * Retrieve RAG context from Qdrant vector search.
 * Embeds the query, searches legal_documents + evidence_items,
 * and returns the top-scoring document snippets as context text.
 */
async function getContextFromRag(params: {
	query: string;
	caseId?: string | null;
	tags?: string[] | null;
	jurisdiction?: string | null;
}): Promise<{ contextText: string; citations: Array<{ id: string; source: string; score: number }> }> {
	try {
		const embResult = await generateEmbeddings([params.query]);
		const queryEmbedding = embResult.vectors[0];
		if (!queryEmbedding?.length) {
			return { contextText: '', citations: [] };
		}

		// Build filters from case context
		const filters: Record<string, unknown> = {};
		if (params.caseId) filters.case_id = params.caseId;
		if (params.jurisdiction) filters.jurisdiction = params.jurisdiction;

		// Search both legal_documents and evidence_items in parallel
		const [docResults, evidenceResults] = await Promise.all([
			qdrant.hybridSearch({
				query: params.query,
				queryEmbedding,
				collection: 'documents',
				filters: Object.keys(filters).length > 0 ? filters : undefined,
				limit: 5,
				scoreThreshold: 0.5,
			}).catch(() => ({ results: [], metadata: {} })),
			qdrant.hybridSearch({
				query: params.query,
				queryEmbedding,
				collection: 'evidence',
				filters: params.caseId ? { case_id: params.caseId } : undefined,
				limit: 3,
				scoreThreshold: 0.5,
			}).catch(() => ({ results: [], metadata: {} })),
		]);

		const allResults = [
			...docResults.results.map((r: any) => ({ ...r, source: 'legal_documents' })),
			...evidenceResults.results.map((r: any) => ({ ...r, source: 'evidence_items' })),
		].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

		if (allResults.length === 0) {
			return { contextText: '', citations: [] };
		}

		// Build context text from top results
		const contextParts = allResults.slice(0, 6).map((r: any, i: number) => {
			const title = r.payload?.title || r.payload?.filename || `Source ${i + 1}`;
			const content = r.payload?.content_preview || r.payload?.content || r.payload?.text || '';
			return `[${i + 1}] ${title} (score: ${(r.score * 100).toFixed(0)}%)\n${content}`;
		});

		const citations = allResults.slice(0, 6).map((r: any) => ({
			id: String(r.id),
			source: r.payload?.title || r.payload?.filename || r.source,
			score: Math.round((r.score ?? 0) * 100) / 100,
		}));

		return {
			contextText: contextParts.join('\n\n'),
			citations,
		};
	} catch (err) {
		console.warn('[contextual-chat] RAG context retrieval failed:', err);
		return { contextText: '', citations: [] };
	}
}

export async function contextualChat(params: ContextChatRequest): Promise<ContextChatResponse> {
	const {
		message,
		caseId = null,
		sessionId = null,
		userId = null,
		tags = null,
		jurisdiction = null,
	} = params;

	const startedAt = performance.now();
	const turnId = crypto.randomUUID();

	// 1) Get RAG context from Qdrant
	const rag = await getContextFromRag({ query: message, caseId, tags, jurisdiction });

	const systemPrompt = [
		'You are a legal AI assistant helping analyze a case.',
		'Use the provided context when relevant, but do not hallucinate facts.',
		'Cite sources by number when referencing context (e.g. [1], [2]).',
		rag.contextText
			? `\nRelevant context:\n${rag.contextText}`
			: '\nNo additional context was retrieved for this query.',
	].join('\n');

	// 2) Call Ollama (real implementation with circuit breaker + retry)
	const answer = await callOllamaChat(systemPrompt, message);

	// 3) Extract keywords / key phrases using real Ollama-backed extractor
	const extractionResult = await extractKeywords(`${message}\n\n${answer}`, 'chat');

	const keywords = extractionResult.keywords;
	const keyPhrases = extractionResult.keyPhrases;

	const suggestions: Suggestion[] = extractionResult.keyPhrases.slice(0, 3).map((phrase, i) => ({
		query: `Explore: ${phrase}`,
		reason: extractionResult.topics?.[i] || 'Key phrase from analysis',
		score: 0.8 - i * 0.1,
	}));

	const latencyMs = Math.round(performance.now() - startedAt);

	// 4) Persist chat turn to ragMessages table
	if (sessionId) {
		try {
			await db.insert(ragMessages).values({
				sessionId,
				role: 'user',
				content: message,
			});
			await db.insert(ragMessages).values({
				sessionId,
				role: 'assistant',
				content: answer,
			});
		} catch (err) {
			console.warn('[contextual-chat] Failed to save chat turn:', err);
		}
	}

	return {
		turnId,
		answer,
		keywords,
		keyPhrases,
		suggestions,
		latencyMs,
		citations: rag.citations,
	};
}
