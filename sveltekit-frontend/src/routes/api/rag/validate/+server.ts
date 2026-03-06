import { json } from '@sveltejs/kit';
import { getQdrantUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';
import type {
	ValidateSourcesRequest,
	ApprovedContext,
	RetrievedChunk
} from '$lib/types/rag-source-validation';
import { getRedis } from '$lib/server/redis.js';

const QDRANT_URL = getQdrantUrl();

/**
 * POST /api/rag/validate
 * Step 2: Validate and approve sources (human-in-the-loop)
 * Accepts chunk validations and returns the approved context for answer generation.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: ValidateSourcesRequest = await request.json();
		const { query_id, case_id, validations, user_id, notes } = body;

		if (!query_id || !case_id || !validations?.length) {
			return json(
				{ error: 'query_id, case_id, and validations are required' },
				{ status: 400 }
			);
		}

		const approvedChunkIds = validations
			.filter((v) => v.status === 'approved')
			.map((v) => v.chunk_id);

		const rejectedChunkIds = validations
			.filter((v) => v.status === 'rejected')
			.map((v) => v.chunk_id);

		// Fetch approved chunk content from Qdrant
		const approvedChunks: RetrievedChunk[] = [];

		for (const chunkId of approvedChunkIds) {
			// chunk_id format: "collection:pointId"
			const [collection, pointId] = chunkId.split(':');
			if (!collection || !pointId) continue;

			try {
				const resp = await fetch(
					`${QDRANT_URL}/collections/${collection}/points/${pointId}`,
					{ signal: AbortSignal.timeout(3000) }
				);

				if (!resp.ok) continue;

				const data = await resp.json();
				const payload = data?.result?.payload ?? {};

				approvedChunks.push({
					chunk_id: chunkId,
					text: payload.content ?? payload.text ?? '',
					snippet: (payload.content ?? payload.text ?? '').slice(0, 300),
					score: 1.0,
					confidence: 'high',
					source_type: payload.source_type ?? 'document',
					source_id: String(pointId),
					source_title: payload.title ?? payload.file_path ?? 'Unknown',
					source_url: payload.url,
					has_image: !!payload.has_image,
					has_table: !!payload.has_table,
					related_entities: payload.entities ?? [],
					graph_neighbors: []
				});
			} catch {
				// Skip unavailable chunks
			}
		}

		// Build combined context from approved chunks
		const combinedContext = approvedChunks
			.map((c, i) => `[Source ${i + 1}: ${c.source_title}]\n${c.text}`)
			.join('\n\n---\n\n');

		// Rough token estimate (4 chars per token)
		const totalTokens = Math.ceil(combinedContext.length / 4);

		const response: ApprovedContext = {
			context_id: crypto.randomUUID(),
			query_id,
			case_id,
			approved_chunks: approvedChunks,
			rejected_chunk_ids: rejectedChunkIds,
			combined_context: combinedContext,
			total_tokens: totalTokens,
			validated_by: user_id,
			validated_at: new Date().toISOString()
		};

		// Store approved context in Redis (10min TTL) so /api/rag/answer can retrieve it
		try {
			const redis = getRedis();
			await redis.set(
				`rag:context:${response.context_id}`,
				JSON.stringify({ query: body.query_id, combined_context: combinedContext, chunks: approvedChunks }),
				'EX', 600
			);
		} catch {
			// Non-blocking — answer endpoint can fall back to client-provided context
		}

		return json(response);
	} catch (err) {
		console.error('[rag/validate] Error:', err);
		return json({ error: 'Validation failed' }, { status: 500 });
	}
};
