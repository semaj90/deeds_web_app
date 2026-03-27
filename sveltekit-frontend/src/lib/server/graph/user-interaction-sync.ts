/**
 * User Interaction → Neo4j Sync + Qdrant Search Embedding
 *
 * Called from RabbitMQ analytics.track consumer (fire-and-forget).
 * Routes analytics events to Neo4j graph relationships and embeds
 * search queries into Qdrant `user_searches` collection.
 *
 * Neo4j relationships created:
 *   (User)-[:VIEWED {timestamp}]->(Case)
 *   (User)-[:SEARCHED {query, timestamp}]->(SearchQuery)
 *   (User)-[:CREATED {timestamp}]->(Case)
 *
 * Qdrant collection: user_searches (768-dim, cosine)
 *   Payload: { userId, query, eventType, timestamp }
 */

import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

// Regex to extract caseId from event payload paths
const CASE_ID_RE = /\/cases\/([a-f0-9-]{36})/i;

interface AnalyticsEvent {
	eventType: string;
	userId?: string | null;
	sessionId?: string | null;
	payload?: Record<string, unknown>;
	timestamp?: number;
}

/**
 * Sync a user interaction event to Neo4j graph.
 * Non-blocking, non-fatal — silently returns on any error.
 */
export async function syncUserInteractionToGraph(event: AnalyticsEvent): Promise<void> {
	const { eventType, userId, payload } = event;
	if (!userId) return;

	const ts = event.timestamp ?? Date.now();

	// Extract caseId from payload path or explicit field
	const caseId =
		(payload?.caseId as string) ??
		(typeof payload?.path === 'string' ? payload.path.match(CASE_ID_RE)?.[1] : null);

	let driver;
	try {
		driver = getNeo4jDriver();
	} catch {
		return; // Neo4j not configured
	}

	const session = driver.session({ database: 'neo4j' });
	try {
		if (eventType === 'page_view' && caseId) {
			await session.run(
				`MERGE (u:User {id: $userId})
				 MERGE (c:Case {id: $caseId})
				 MERGE (u)-[r:VIEWED]->(c)
				 SET r.lastViewed = datetime({epochMillis: $ts}),
				     r.viewCount = coalesce(r.viewCount, 0) + 1`,
				{ userId, caseId, ts }
			);
		} else if (eventType === 'case_create' && caseId) {
			const title = (payload?.title as string) ?? '';
			await session.run(
				`MERGE (u:User {id: $userId})
				 MERGE (c:Case {id: $caseId})
				 ON CREATE SET c.title = $title
				 MERGE (u)-[r:CREATED]->(c)
				 SET r.createdAt = datetime({epochMillis: $ts})`,
				{ userId, caseId, title, ts }
			);
		} else if (
			['chat_query', 'codebase_search', 'rag_search', 'global_search'].includes(eventType)
		) {
			const query = (payload?.query as string) ?? (payload?.message as string) ?? '';
			if (query.length < 2) return;

			await session.run(
				`MERGE (u:User {id: $userId})
				 MERGE (sq:SearchQuery {hash: $hash})
				 ON CREATE SET sq.query = $query, sq.createdAt = datetime({epochMillis: $ts})
				 MERGE (u)-[r:SEARCHED]->(sq)
				 SET r.lastSearched = datetime({epochMillis: $ts}),
				     r.searchCount = coalesce(r.searchCount, 0) + 1`,
				{
					userId,
					hash: simpleHash(query),
					query: query.slice(0, 500),
					ts,
				}
			);

			// Also embed the query into Qdrant (fire-and-forget)
			embedSearchQuery(userId, query, eventType, ts).catch(() => {});
		}
	} catch {
		// Neo4j unavailable — silent failure (this is fire-and-forget)
	} finally {
		await session.close();
	}
}

/**
 * Embed a search query into Qdrant `user_searches` collection.
 * Uses embeddinggemma via the existing embedding client.
 */
async function embedSearchQuery(
	userId: string,
	query: string,
	eventType: string,
	timestamp: number
): Promise<void> {
	try {
		const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
		const vector = await generateSingleEmbedding(query);
		if (!vector?.length) return;

		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

		// Ensure collection exists (idempotent)
		try {
			await qdrant.client.getCollection('user_searches');
		} catch {
			await qdrant.client.createCollection('user_searches', {
				vectors: { size: 768, distance: 'Cosine' },
				quantization_config: { scalar: { type: 'int8', always_ram: true } },
			});
		}

		const { deterministicPointId } = await import('$lib/server/vector/qdrant-manager.js');
		const pointId = deterministicPointId(`${userId}:${simpleHash(query)}`);

		await qdrant.client.upsert('user_searches', {
			wait: false,
			points: [
				{
					id: pointId,
					vector,
					payload: {
						userId,
						query: query.slice(0, 1000),
						eventType,
						timestamp,
					},
				},
			],
		});
	} catch {
		// Embedding or Qdrant unavailable — non-fatal
	}
}

/**
 * Search past user queries similar to the current query.
 * Used by ACE context enrichment.
 */
export async function searchSimilarUserQueries(
	userId: string,
	queryVector: number[],
	limit = 5
): Promise<Array<{ query: string; eventType: string; score: number; timestamp: number }>> {
	try {
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

		const results = await qdrant.client.search('user_searches', {
			vector: queryVector,
			limit,
			score_threshold: 0.4,
			filter: {
				must: [{ key: 'userId', match: { value: userId } }],
			},
			with_payload: true,
		});

		return results.map((r) => ({
			query: String((r.payload as Record<string, unknown>)?.query ?? ''),
			eventType: String((r.payload as Record<string, unknown>)?.eventType ?? ''),
			score: r.score,
			timestamp: Number((r.payload as Record<string, unknown>)?.timestamp ?? 0),
		}));
	} catch {
		return [];
	}
}

/** Simple FNV-1a-style hash for deduplication */
function simpleHash(str: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = (hash * 0x01000193) >>> 0;
	}
	return hash.toString(36);
}
