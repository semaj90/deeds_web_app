import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client';
import { researchSummaries, contextTimeline, users } from '$lib/server/db/schema-postgres.js';
import { performWebSearch, scrapeUrl } from '$lib/server/ai/web-search-utils.js';
import { bifrostChat, VLM_MODELS } from '$lib/server/ollama.js';
import { eq, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

const COLLECTION = 'research_memory_768';
const QDRANT_URL = ENV.QDRANT_URL;

/** 8-char FNV-1a hash of string — used for queryHash fingerprints. */
function fnv1a8(s: string): string {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36).slice(0, 8).padStart(8, '0');
}

/** Fire-and-forget context_timeline insert. */
function emitTimeline(
	userId: string | number,
	eventType: string,
	payload: Record<string, unknown>,
	summaryId?: string | null,
): void {
	db.insert(contextTimeline).values({
		userId:     Number(userId),
		sessionId:  '',
		eventType,
		pipeline:   'external-deep',
		summaryId:  summaryId ?? null,
		payload,
	}).catch(() => {});
}

export interface ExternalResearchResult {
	query: string;
	summaries: Array<{
		id: string;
		title: string;
		url: string;
		summary: string;
		relevanceScore: number;
	}>;
	globalSynthesis: string;
}

/**
 * Orchestrate deep web research: search, scrape, summarize, index, and synthesize.
 */
export async function performExternalResearch(
	query: string,
	userId: string,
	options: { maxResults?: number; sessionId?: string } = {}
): Promise<ExternalResearchResult> {
	const maxResults = options.maxResults ?? 5;
	const queryHash = fnv1a8(query);

	emitTimeline(userId, 'research.external.started', { query, queryHash });

	// 1. Web Search
	const searchResults = await performWebSearch(query, maxResults);
	emitTimeline(userId, 'research.external.search_complete', { 
		query, 
		count: searchResults.length,
		engines: [...new Set(searchResults.map(r => r.engine))]
	});

	if (searchResults.length === 0) {
		return { query, summaries: [], globalSynthesis: 'No web results found.' };
	}

	const summaries: ExternalResearchResult['summaries'] = [];

	// 2. Process each result (Scrape → Summarize → Index)
	// We do this serially to avoid OOM on local Ollama, but could be parallelized if needed.
	for (const result of searchResults) {
		try {
			// Scrape
			const fullText = await scrapeUrl(result.url);
			const textToProcess = fullText || result.content; // Fallback to snippet

			// Summarize via Gemma4
			const summaryPrompt = `Summarize the following web content in the context of this research query: "${query}"\n\nContent:\n${textToProcess.slice(0, 5000)}`;
			const summary = await bifrostChat(
				[{ role: 'user', content: summaryPrompt }],
				VLM_MODELS.legal,
				{ cacheKey: `research-summary-${fnv1a8(result.url)}` }
			);

			// Embed for indexing
			const embeddingRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
				method: 'POST',
				body: JSON.stringify({ model: ENV.OLLAMA_EMBED_MODEL, input: summary }),
				signal: AbortSignal.timeout(10000)
			});
			let vector: number[] | null = null;
			if (embeddingRes.ok) {
				const data = await embeddingRes.json();
				vector = data.embeddings?.[0] ?? null;
			}

			// Store in Postgres (research_summaries)
			const [summaryRow] = await db.insert(researchSummaries).values({
				source: 'web',
				pipeline: 'external-deep',
				entityType: 'web',
				query,
				queryHash,
				title: result.title,
				url: result.url,
				summary,
				relevanceScore: 0.8, // Initial score
				embedding: vector,
				userId: Number(userId)
			}).returning();

			// Store in Qdrant (research_memory_768)
			if (vector) {
				await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						points: [{
							id: summaryRow.id,
							vector: { content: vector },
							payload: {
								url: result.url,
								title: result.title,
								summary,
								query_hash: queryHash,
								timestamp: new Date().toISOString()
							}
						}]
					})
				}).catch(() => {});
			}

			summaries.push({
				id: summaryRow.id,
				title: result.title,
				url: result.url,
				summary,
				relevanceScore: 0.8
			});

			emitTimeline(userId, 'research.external.result_indexed', { 
				title: result.title, 
				url: result.url 
			}, summaryRow.id);

		} catch (err) {
			console.error(`[external-research] Failed to process ${result.url}:`, err);
		}
	}

	// 3. Final Synthesis
	const synthesisPrompt = `Synthesize the following web research findings for the query: "${query}"\n\nFindings:\n${summaries.map(s => `- [${s.title}](${s.url}): ${s.summary}`).join('\n\n')}`;
	const globalSynthesis = await bifrostChat(
		[{ role: 'user', content: synthesisPrompt }],
		VLM_MODELS.legal,
		{ cacheKey: `research-synthesis-${queryHash}` }
	);

	emitTimeline(userId, 'research.external.completed', { 
		query, 
		summaryCount: summaries.length 
	});

	return { query, summaries, globalSynthesis };
}
