/**
 * POST /api/hyperrag/packet-rpc
 *
 * HyperRAG Packet RPC endpoint exposing:
 * - Fusion retrieval (Qdrant dense + PostgreSQL FTS + Neo4j expansion)
 * - Compact packet responses with immutable provenance tuples
 * - No re-summarization needed (pre-computed summaries from cache)
 * - Designed for Gemma4/OpenCode agents consuming canonical ACE packets
 *
 * Request body:
 * {
 *   "query": string,
 *   "limit": number? (1-25, default 10),
 *   "includeGraph": boolean? (default true),
 *   "useFts": boolean? (default true),
 *   "recordTelemetry": boolean? (default true),
 *   "awaitTelemetry": boolean? (default false),
 *   "useExactMatchCache": boolean? (default true)
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "query": string,
 *   "strategy": "fusion",
 *   "packets": [
 *     {
 *       "packet_key": string,
 *       "source_ref": string,
 *       "feature_id": string,
 *       "feature_label": string,
 *       "directory_path": string,
 *       "qdrant_tags": string[],
 *       "neo4j_neighbors": string[],
 *       "retrieval_lanes": { dense, fts, trigram, jsonb },
 *       "gemma4_summary": string,
 *       "rank": number
 *     }
 *   ],
 *   "provenance": [
 *     {
 *       "packet_key": string,
 *       "feature_id": string,
 *       "source_ref": string,
 *       "retrieved_at": ISO8601,
 *       "retrieved_from": "redis" | "qdrant" | "postgres" | "hyperrag",
 *       "retrieval_confidence": 0-1,
 *       "retrieval_latency_ms": number
 *     }
 *   ],
 *   "trace": {
 *     "qdrant_hits": number,
 *     "postgres_hits": number,
 *     "neo4j_expansions": number,
 *     "cache_hits": number,
 *     "latency_ms": number
 *   }
 * }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	hyperragPacketRpc,
	closeHyperRagPacketRpcPool,
	type HyperRagPacketRpcInput,
	type HyperRagPacketRpcResult,
	type HyperRagPacketRpcPacket,
} from '$lib/server/retrieval/hyperrag-packet-rpc.js';
import {
	getExactMatchCacheWithProvenance,
	setExactMatchCacheWithProvenance,
	type CacheProvenanceTuple,
} from '$lib/server/cache/redis-exact-match.js';
import { generateCacheKey } from '$lib/server/cache-keys.js';
import { HyperRagReplayTrace } from '$lib/server/hyperrag/replay-trace.js';
import { getRedis } from '$lib/server/redis.js';
import crypto from 'crypto';

function hashQuery(query: string): string {
	return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const startTime = Date.now();
	const trace = new HyperRagReplayTrace('hyperrag-packet-rpc');

	try {
		const body = await request.json() as {
			query?: string;
			limit?: number;
			includeGraph?: boolean;
			useFts?: boolean;
			recordTelemetry?: boolean;
			awaitTelemetry?: boolean;
			useExactMatchCache?: boolean;
		};

		const query = body.query?.trim();
		if (!query) {
			return error(400, 'query is required');
		}

		const limit = Math.max(1, Math.min(body.limit ?? 10, 25));
		const useCache = body.useExactMatchCache !== false;

		// Set session context for replay trace
		if (locals.user) {
			trace.setSessionContext(request.headers.get('session-id') || '', String(locals.user.id));
		}

		// Try exact-match cache first
		const cacheKey = generateCacheKey(query, { model: 'hyperrag', limit });
		let cacheHits = 0;
		let cachedResponse: HyperRagPacketRpcResult | null = null;
		const provenances: CacheProvenanceTuple[] = [];

		const rpcInput: HyperRagPacketRpcInput = {
			query,
			limit,
			includeGraph: body.includeGraph !== false,
			useFts: body.useFts !== false,
			recordTelemetry: body.recordTelemetry !== false,
			awaitTelemetry: body.awaitTelemetry === true,
		};

		trace.recordRequest(rpcInput);

		if (useCache) {
			const cached = await getExactMatchCacheWithProvenance(cacheKey);
			if (cached) {
				console.log(`[hyperrag-packet-rpc] Cache hit for query: ${query.slice(0, 50)}`);
				cacheHits = 1;
				trace.setCacheHit(true);

				// Extract provenance for response
				if (cached.provenance) {
					provenances.push(cached.provenance);
				}

				// Parse response (it's stored as serialized HyperRagPacketRpcResult)
				try {
					const parsed = JSON.parse((cached as { content?: string }).content ?? '{}') as HyperRagPacketRpcResult;
					if (parsed && Array.isArray(parsed.packets)) {
						cachedResponse = {
							...parsed,
							trace: {
								...parsed.trace,
								retrieval_strategy: parsed.trace?.retrieval_strategy ?? 'fusion',
								latency_ms: Date.now() - startTime,
							},
						};
					}
				} catch (err) {
					console.warn('[hyperrag-packet-rpc] Cache parse failed, falling back to live retrieval');
					cachedResponse = null;
				}
			}
		}

		// Live retrieval if cache miss
		let result: HyperRagPacketRpcResult;
		if (cachedResponse) {
			result = cachedResponse;
		} else {
			result = await hyperragPacketRpc(rpcInput);

			// Build provenance tuples for each packet
			for (const packet of result.packets) {
				provenances.push({
					packet_key: packet.packet_key,
					feature_id: packet.feature_id ?? 'unknown',
					source_ref: packet.source_ref,
					retrieved_at: new Date().toISOString(),
					retrieved_from: 'hyperrag',
					retrieval_confidence:
						packet.retrieval_lanes.fts > 0.8 ? 0.85 :
						packet.retrieval_lanes.dense > 0.7 ? 0.75 :
						0.65,
					retrieval_latency_ms: result.trace.latency_ms,
					community_id: undefined,
					som_cluster: undefined,
					graph_neighbors: packet.neo4j_neighbors.length > 0 ? packet.neo4j_neighbors : undefined,
					ace_confidence: packet.retrieval_lanes.jsonb > 0 ? 0.9 : 0.5,
					kag_aligned: packet.qdrant_tags.length > 0,
					dag_reachable: true,
				});
			}

			// Cache the result for future hits
			if (useCache && result.packets.length > 0) {
				try {
					await setExactMatchCacheWithProvenance(
						cacheKey,
						{
							content: JSON.stringify(result),
							model: 'hyperrag',
							backend: 'hyperrag-fusion',
							promptTokens: 0,
							completionTokens: 0,
						},
						provenances[0]!, // Primary packet provenance
						3600 // 1 hour TTL
					);
				} catch (err) {
					console.warn('[hyperrag-packet-rpc] Cache store failed (non-fatal):', err instanceof Error ? err.message : String(err));
				}
			}
		}

		const latencyMs = Date.now() - startTime;

		// Record response for replay trace (fire-and-forget)
		trace.recordResponse(result);
		const redis = getRedis();
		trace.save(redis, 86400).catch(() => {}); // 24h TTL, non-fatal

		return json({
			ok: true,
			query: result.query,
			strategy: result.strategy,
			packets: result.packets,
			provenance: provenances,
			trace: {
				retrieval_strategy: result.trace.retrieval_strategy ?? 'fusion',
				qdrant_hits: result.trace.qdrant_hits,
				postgres_hits: result.trace.postgres_hits,
				rrf_hits: result.trace.rrf_hits,
				neo4j_expansions: result.trace.neo4j_expansions,
				cache_hits: cacheHits,
				latency_ms: latencyMs,
				cache_latency_ms: cacheHits > 0 ? latencyMs : undefined,
			},
		});
	} catch (err) {
		console.error('[hyperrag-packet-rpc] Error:', err instanceof Error ? err.message : String(err));
		return json(
			{
				ok: false,
				error: err instanceof Error ? err.message : 'Unknown error',
				trace: {
					latency_ms: Date.now() - startTime,
				},
			},
			{ status: 500 }
		);
	}
};

// Clean up DB pool on graceful shutdown
if (typeof global !== 'undefined' && !global.hyperragPoolCleaned) {
	global.hyperragPoolCleaned = true;
	process.on('exit', () => {
		void closeHyperRagPacketRpcPool();
	});
}

declare global {
	var hyperragPoolCleaned: boolean | undefined;
}
