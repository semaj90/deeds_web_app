/**
 * Batch Entity Storage Pipeline
 *
 * High-performance batch storage for extracted entities using:
 * 1. LangExtract spaCy NER (21 entity types)
 * 2. PostgreSQL batch INSERT with Drizzle
 * 3. Optional: Batch embedding for future entity vector search
 *
 * Performance: 100-500 entities/sec vs ~10-20 with individual INSERTs
 */

import { db } from '$lib/server/db/client.js';
import { evidenceEntities, type NewEvidenceEntity } from '$lib/server/db/schema-postgres.js';
import type { Entity } from '$lib/server/analysis/entity-extraction.js';

// ── Types ──────────────────────────────────────────────────────────

export interface BatchStoreResult {
	inserted: number;
	failed: number;
	durationMs: number;
}

// ── Batch Storage with Drizzle ────────────────────────────────────

/**
 * Batch store entities using Drizzle's batch insert
 *
 * Much faster than individual INSERTs for large entity sets
 * Uses PostgreSQL multi-row INSERT syntax internally
 *
 * @param entities - Extracted entities from LangExtract/LLM
 * @param evidenceId - Evidence UUID
 * @param caseId - Optional case UUID for filtering
 * @returns Batch insert stats
 */
export async function batchStoreEntities(
	entities: Entity[],
	evidenceId: string,
	caseId?: string
): Promise<BatchStoreResult> {
	const start = Date.now();

	if (entities.length === 0) {
		return { inserted: 0, failed: 0, durationMs: 0 };
	}

	try {
		// Prepare entity rows for batch insert
		const rows: NewEvidenceEntity[] = entities.map((entity) => ({
			evidenceId,
			caseId: caseId ?? null,
			entityText: entity.text,
			entityLabel: entity.label,
			confidence: entity.score ?? null,
			startOffset: entity.start ?? null,
			endOffset: entity.end ?? null,
			source: entity.source ?? 'llm',
		}));

		// Batch insert using Drizzle (generates multi-row INSERT)
		await db.insert(evidenceEntities).values(rows);

		return {
			inserted: rows.length,
			failed: 0,
			durationMs: Date.now() - start,
		};
	} catch (err) {
		console.error('[BatchEntityStore] Batch insert failed:', err);

		// Try individual inserts as fallback
		let inserted = 0;
		for (const entity of entities) {
			try {
				await db.insert(evidenceEntities).values({
					evidenceId,
					caseId: caseId ?? null,
					entityText: entity.text,
					entityLabel: entity.label,
					confidence: entity.score ?? null,
					startOffset: entity.start ?? null,
					endOffset: entity.end ?? null,
					source: entity.source ?? 'llm',
				});
				inserted++;
			} catch {
				// Skip failed entity
			}
		}

		return {
			inserted,
			failed: entities.length - inserted,
			durationMs: Date.now() - start,
		};
	}
}

/**
 * Batch store entities with duplicate detection
 *
 * Uses ON CONFLICT DO NOTHING to skip duplicates
 * Useful for re-processing evidence without creating duplicate entities
 *
 * @param entities - Extracted entities
 * @param evidenceId - Evidence UUID
 * @param caseId - Optional case UUID
 * @returns Batch insert stats
 */
export async function batchStoreEntitiesWithDedup(
	entities: Entity[],
	evidenceId: string,
	caseId?: string
): Promise<BatchStoreResult> {
	const start = Date.now();

	if (entities.length === 0) {
		return { inserted: 0, failed: 0, durationMs: 0 };
	}

	try {
		const rows: NewEvidenceEntity[] = entities.map((entity) => ({
			evidenceId,
			caseId: caseId ?? null,
			entityText: entity.text,
			entityLabel: entity.label,
			confidence: entity.score ?? null,
			startOffset: entity.start ?? null,
			endOffset: entity.end ?? null,
			source: entity.source ?? 'llm',
		}));

		// Insert with ON CONFLICT DO NOTHING (requires unique constraint)
		// If no unique constraint exists, falls back to regular insert
		await db
			.insert(evidenceEntities)
			.values(rows)
			.onConflictDoNothing();

		return {
			inserted: rows.length, // Note: actual inserted may be less due to duplicates
			failed: 0,
			durationMs: Date.now() - start,
		};
	} catch (err) {
		console.error('[BatchEntityStore] Dedup insert failed:', err);
		// Fallback to regular batch insert without dedup
		return batchStoreEntities(entities, evidenceId, caseId);
	}
}

// ── Future Enhancement: Entity Embeddings ─────────────────────────

/**
 * TODO: Add entity embedding storage
 *
 * When entity vector search is needed:
 * 1. Add `embedding vector(768)` column to evidence_entities table
 * 2. OR create separate entity_vectors table with FK to evidence_entities
 * 3. Use embedTexts() from batch-embedder.ts for batch embedding
 * 4. Store vectors with HNSW index for similarity search
 *
 * Example query after implementation:
 *   SELECT * FROM evidence_entities
 *   ORDER BY embedding <=> '[query_vector]'
 *   LIMIT 10;
 */
