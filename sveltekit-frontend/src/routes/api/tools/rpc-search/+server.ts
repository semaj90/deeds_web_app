import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { ENV } from '$lib/server/env.server.js';

/**
 * POST /api/tools/rpc-search
 *
 * Lane 12.2 Task: Wire RPC-search endpoint for Gemma4 tool narrowing.
 *
 * Purpose:
 * Gemma4 receives a narrowed tool list (15–25 tools) instead of flat 300+.
 * Queries Qdrant for gRPC service/method packets matching the user query + feature context,
 * applies domain_class=mcp_agents filter, and returns metadata suitable for tool selection.
 *
 * Request:
 * {
 *   "query": string (search text, optional for filter-only mode),
 *   "feature_id": string (optional, narrows scope to a feature context),
 *   "limit": number (default 20, max 50)
 * }
 *
 * Response contract (never 500 error per degraded response rule):
 * {
 *   "tools": [
 *     {
 *       "packet_key": "grpc:LuciaService.ValidateSession",
 *       "summary": "Validate Lucia session token",
 *       "tags": ["grpc", "auth", "session"],
 *       "confidence": 0.87
 *     }
 *   ],
 *   "total": 3,
 *   "latency_ms": 142
 * }
 *
 * Auth: session cookie (locals.user required)
 * Gates:
 *   - Latency <500ms
 *   - Returns top-15 tools for typical query
 *   - Tools carry correct schema (no missing fields)
 */

const rpcSearchSchema = z.object({
	query: z.string().trim().max(1000).default(''),
	feature_id: z.string().trim().optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

interface RpcTool {
	packet_key: string;
	summary: string;
	tags: string[];
	confidence: number;
}

interface RpcSearchResponse {
	tools: RpcTool[];
	total: number;
	latency_ms: number;
}

export const POST: RequestHandler = async ({ request, locals }): Promise<any> => {
	const t0 = Date.now();

	// Auth guard — per spec, check locals.user
	if (!locals.user) {
		return json({
			tools: [],
			total: 0,
			latency_ms: Date.now() - t0,
		} as RpcSearchResponse);
	}

	// Parse input
	let parsed: z.SafeParseReturnType<unknown, z.infer<typeof rpcSearchSchema>>;
	try {
		const raw = await request.json();
		parsed = rpcSearchSchema.safeParse(raw);
	} catch {
		// Invalid JSON — degraded response
		return json({
			tools: [],
			total: 0,
			latency_ms: Date.now() - t0,
		} as RpcSearchResponse);
	}

	if (!parsed.success) {
		// Zod validation failed — degraded response
		return json({
			tools: [],
			total: 0,
			latency_ms: Date.now() - t0,
		} as RpcSearchResponse);
	}

	const { query, feature_id: featureId, limit } = parsed.data;

	try {
		// Build Qdrant filter: domain_class = "mcp_agents" is mandatory
		const mustFilter: Record<string, unknown>[] = [
			{ key: 'domain_class', match: { value: 'mcp_agents' } },
		];

		// Optional: narrow by feature_id if provided
		if (featureId) {
			mustFilter.push({ key: 'feature_id', match: { value: featureId } });
		}

		const filter = { must: mustFilter };

		// Prepare search request
		// Strategy: if query is empty, use filter-only mode (no embedding).
		// Otherwise, embed the query and search with semantic + filter.

		let qdrantResult: any[] = [];

		if (query.length === 0) {
			// Filter-only: fetch top N tools by domain_class + feature_id
			// Use a dummy vector to satisfy Qdrant search API
			qdrantResult = (await qdrant.client.search('codebase_chunks_768', {
				vector: new Array(768).fill(0.001),
				limit,
				filter,
				with_payload: true,
			} as any)) as any[];
		} else {
			// Text search: embed the query and search with semantic + filter
			let queryVector: number[] | null = null;

			try {
				// Try embedding via Ollama
				const embedRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: 'embeddinggemma:latest',
						prompt: query.slice(0, 512),
					}),
					signal: AbortSignal.timeout(10_000),
				});

				if (embedRes.ok) {
					const { embedding } = (await embedRes.json()) as { embedding: number[] };
					queryVector = embedding;
				}
			} catch (embedErr) {
				console.warn('[tools/rpc-search] Embedding failed, using filter-only:', (embedErr as Error).message);
				// Fall through to filter-only search below
			}

			if (queryVector) {
				// Search with embedding + filter
				qdrantResult = (await qdrant.client.search('codebase_chunks_768', {
					vector: queryVector,
					limit,
					score_threshold: 0.3,
					filter,
					with_payload: true,
				} as any)) as any[];
			} else {
				// Embedding failed, fall back to filter-only
				qdrantResult = (await qdrant.client.search('codebase_chunks_768', {
					vector: new Array(768).fill(0.001),
					limit,
					filter,
					with_payload: true,
				} as any)) as any[];
			}
		}

		// Extract and normalize results
		const tools: RpcTool[] = qdrantResult.map((hit: any) => ({
			packet_key: String(hit.payload?.packet_key ?? hit.id ?? ''),
			summary: String(hit.payload?.summary ?? ''),
			tags: Array.isArray(hit.payload?.qdrant_tags)
				? (hit.payload.qdrant_tags as string[])
				: [],
			confidence: typeof hit.score === 'number' ? hit.score : 0.5,
		}));

		return json({
			tools,
			total: tools.length,
			latency_ms: Date.now() - t0,
		} as RpcSearchResponse);
	} catch (err) {
		// Degraded response: catch all Qdrant errors (timeouts, connection failures)
		console.warn('[tools/rpc-search] Qdrant search error:', (err as Error).message);

		return json({
			tools: [],
			total: 0,
			latency_ms: Date.now() - t0,
		} as RpcSearchResponse);
	}
};
