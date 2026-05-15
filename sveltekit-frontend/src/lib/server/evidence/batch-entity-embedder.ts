/**
 * RTX Batch Entity Embedding Pipeline
 *
 * High-performance batch embedding for extracted entities using:
 * 1. Batch embedding via Ollama/gRPC GPU acceleration
 * 2. Qdrant upsert for vector storage (evidence_items collection)
 *
 * Entity text/metadata is stored separately via batchStoreEntities (Drizzle INSERT).
 * This module adds vector representations to Qdrant for semantic entity search.
 */

import { embedTexts } from '$lib/server/batch-embedder.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import type { Entity } from '$lib/server/analysis/entity-extraction.js';

// ── Types ──────────────────────────────────────────────────────────

export interface BatchEmbedResult {
	inserted: number;
	cached: number;
	failed: number;
	durationMs: number;
}

// ── Batch Embedding + Qdrant Upsert ───────────────────────────────

/**
 * Batch embed entities and upsert to Qdrant evidence_items collection.
 *
 * Entity metadata (text, label, offsets) is stored in PostgreSQL by
 * batchStoreEntities. This function adds 768-dim vector representations
 * for semantic similarity search via Qdrant.
 *
 * @param entities   - Extracted entities from LangExtract/LLM
 * @param evidenceId - Evidence UUID
 * @param caseId     - Optional case UUID for Qdrant payload filtering
 * @returns Batch upsert stats
 */
export async function batchEmbedAndStoreEntities(
	entities: Entity[],
	evidenceId: string,
	caseId?: string | null,
): Promise<BatchEmbedResult> {
	const start = Date.now();

	if (entities.length === 0) {
		return { inserted: 0, cached: 0, failed: 0, durationMs: 0 };
	}

	// 1. Generate embeddings in batch (GPU-accelerated via gRPC/Ollama)
	// Prefix with label so the vector captures entity type context
	const texts = entities.map((e) => `${e.label}: ${e.text}`);
	let embeddings: Float32Array[];
	try {
		embeddings = await embedTexts(texts);
	} catch (err) {
		console.error('[BatchEntityEmbed] Embedding generation failed:', err);
		return { inserted: 0, cached: 0, failed: entities.length, durationMs: Date.now() - start };
	}

	// 2. Build Qdrant points with deterministic IDs for idempotent upserts
	const points = entities.map((entity, i) => ({
		id: deterministicPointId(`entity:${evidenceId}:${i}`),
		vector: Array.from(embeddings[i]),
		payload: {
			type: 'entity',
			evidenceId,
			caseId: caseId ?? null,
			entityType: entity.label,
			entityValue: entity.text,
			confidence: entity.score ?? 0,
			startOffset: entity.start ?? 0,
			endOffset: entity.end ?? 0,
			source: entity.source ?? 'llm',
			createdAt: new Date().toISOString(),
		},
	}));

	// 3. Upsert to Qdrant evidence_items collection
	try {
		const result = await qdrant.batchUpsert({
			collection: 'evidence_items',
			points,
			batchSize: 50,
		});
		return {
			inserted: result.totalUpserted,
			cached: 0,
			failed: points.length - result.totalUpserted,
			durationMs: Date.now() - start,
		};
	} catch (err) {
		console.error('[BatchEntityEmbed] Qdrant upsert failed:', err);
		return { inserted: 0, cached: 0, failed: entities.length, durationMs: Date.now() - start };
	}
}
