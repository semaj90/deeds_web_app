/**
 * CHR-ROM97 Cartridge Tensor Search API
 *
 * POST { query, caseId, topK?, minScore? }
 * → Loads/builds cartridge for caseId
 * → Embeds query via Ollama/gRPC
 * → CPU cosine similarity on dequantized FP16 tensors
 * → Returns ranked results
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ENV } from '$lib/server/env.server.js';
import { searchCartridgeTensors, type TensorSearchResponse } from '$lib/server/cache/cartridge-tensor-bridge.js';
import type { RuneData } from '$lib/server/cartridge/chr97-builder.js';
import { z } from 'zod';

const searchSchema = z.object({
	query: z.string().min(1).max(2000),
	caseId: z.string().min(1).max(500),
	topK: z.number().int().min(1).max(100).optional(),
	minScore: z.number().min(0).max(1).optional(),
	collection: z.string().max(200).optional(),
});

export const POST: RequestHandler = async ({ request }) => {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = searchSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, caseId, topK, minScore, collection } = parsed.data;
	const collectionName = collection ?? 'evidence_items';

	// Build fetchRunes function that scrolls Qdrant
	const fetchRunes = async (): Promise<RuneData[]> => {
		const qdrant = new QdrantClient({ url: ENV.QDRANT_URL });
		const allPoints: Array<{ id: string | number; vector: number[]; payload: Record<string, unknown> }> = [];

		let nextOffset: string | number | undefined = undefined;
		for (let page = 0; page < 100; page++) {
			const result = await qdrant.scroll(collectionName, {
				filter: { must: [{ key: 'case_id', match: { value: caseId } }] },
				limit: 100,
				offset: nextOffset,
				with_vector: true,
				with_payload: true,
			});

			if (!result.points?.length) break;

			for (const point of result.points) {
				let vector: number[];
				if (Array.isArray(point.vector)) {
					vector = point.vector as number[];
				} else if (point.vector && typeof point.vector === 'object' && 'content' in point.vector) {
					vector = (point.vector as Record<string, number[]>).content;
				} else {
					continue;
				}
				allPoints.push({ id: point.id, vector, payload: (point.payload ?? {}) as Record<string, unknown> });
			}

			nextOffset = (result.next_page_offset as string | number | undefined) ?? undefined;
			if (!nextOffset) break;
		}

		return allPoints.map((point, i) => ({
			id: i,
			clusterId: typeof point.payload.chunk_index === 'number' ? Math.floor((point.payload.chunk_index as number) / 5) : 0,
			embedding: point.vector,
			text: String(point.payload.text ?? point.payload.content ?? ''),
			sourceId: String(point.payload.evidence_id ?? point.id),
			sourceName: String(point.payload.source_name ?? point.payload.filename ?? 'unknown'),
			entities: Array.isArray(point.payload.entities) ? point.payload.entities.map(String) : [],
		}));
	};

	try {
		const response: TensorSearchResponse = await searchCartridgeTensors(
			query,
			caseId,
			fetchRunes,
			{ topK, minScore, hasActiveCase: true }
		);

		return json(response);
	} catch (err) {
		console.error('[cartridge-search] Error:', err);
		return json({ error: 'Tensor search failed' }, { status: 500 });
	}
};
