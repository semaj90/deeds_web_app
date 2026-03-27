/**
 * User Analytics Context for ACE Chat Enrichment
 *
 * Fetches user behavior context from 3 sources in parallel:
 *   1. Recent search patterns (PostgreSQL via event-logger)
 *   2. Graph neighbors for current case (Neo4j via graph-centrality)
 *   3. Similar past queries (Qdrant user_searches collection)
 *
 * Returns a formatted string (max 400 chars) for injection into ACE system prompt.
 */

import { getTopQueryPatterns } from '$lib/server/analytics/event-logger.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';

/**
 * Fetch user analytics context for ACE prompt enrichment.
 * All sources are optional — returns null if nothing useful found.
 */
export async function fetchUserAnalyticsContext(
	userId: string,
	query: string,
	caseId?: string
): Promise<string | null> {
	const [patterns, connectedCases, similarQueries] = await Promise.all([
		getTopQueryPatterns(userId, 5).catch(() => []),
		caseId ? fetchConnectedCasesSafe(caseId) : Promise.resolve([]),
		fetchSimilarPastQueries(userId, query).catch(() => []),
	]);

	const lines: string[] = [];

	// Recent search patterns
	if (patterns.length > 0) {
		const topPatterns = patterns
			.slice(0, 3)
			.map((p) => `${p.query_hash} (×${p.count})`)
			.join(', ');
		lines.push(`Recent search topics: ${topPatterns}`);
	}

	// Connected cases from graph
	if (connectedCases.length > 0) {
		const caseLinks = connectedCases
			.slice(0, 3)
			.map((c) => `${c.title || c.caseId} (${c.sharedTypes.join(',')})`)
			.join('; ');
		lines.push(`Related cases: ${caseLinks}`);
	}

	// Similar past queries
	if (similarQueries.length > 0) {
		const pastQueries = similarQueries
			.slice(0, 3)
			.map((q) => `"${q.query.slice(0, 50)}"`)
			.join(', ');
		lines.push(`Similar past queries: ${pastQueries}`);
	}

	if (lines.length === 0) return null;

	const result = `## User Analytics Context\n${lines.join('\n')}`;
	// Enforce 400-char budget
	return result.length > 400 ? result.slice(0, 397) + '...' : result;
}

async function fetchConnectedCasesSafe(
	caseId: string
): Promise<Array<{ caseId: string; title: string; strength: number; sharedTypes: string[] }>> {
	try {
		const { findConnectedCases } = await import('$lib/server/graph/graph-centrality.js');
		return await findConnectedCases(caseId, 5);
	} catch {
		return [];
	}
}

async function fetchSimilarPastQueries(
	userId: string,
	query: string
): Promise<Array<{ query: string; eventType: string; score: number; timestamp: number }>> {
	try {
		const vector = await generateSingleEmbedding(query);
		if (!vector?.length) return [];

		const { searchSimilarUserQueries } = await import(
			'$lib/server/graph/user-interaction-sync.js'
		);
		return await searchSimilarUserQueries(userId, vector, 5);
	} catch {
		return [];
	}
}
