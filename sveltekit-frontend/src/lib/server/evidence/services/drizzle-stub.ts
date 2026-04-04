import { db } from '$lib/server/db/client';
import { evidenceVectors } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Upsert an embedding vector for a given evidence item into the evidence_vectors table.
 * If a vector already exists for this evidence + model combination, it is replaced.
 *
 * @param evidenceId - UUID of the evidence item
 * @param vector - 768-dim embedding vector (number[])
 * @param meta - Additional metadata (must include `model` string)
 */
export async function upsertEmbedding(
	evidenceId: string,
	vector: number[],
	meta: Record<string, any>
): Promise<void> {
	const model = (meta.model as string) || 'embeddinggemma';

	try {
		// Check if a vector for this evidence+model already exists
		const existing = await db
			.select({ id: evidenceVectors.id })
			.from(evidenceVectors)
			.where(and(eq(evidenceVectors.evidenceId, evidenceId), eq(evidenceVectors.model, model)))
			.limit(1);

		if ((existing as any).rows?.length > 0 || (Array.isArray(existing) && existing.length > 0)) {
			const rows = (existing as any).rows ?? existing;
			// Update existing vector
			await db
				.update(evidenceVectors)
				.set({ vector })
				.where(eq(evidenceVectors.id, rows[0].id));
		} else {
			// Insert new vector
			await db.insert(evidenceVectors).values({
				evidenceId,
				vector,
				model,
			});
		}
	} catch (err) {
		console.error('[drizzle-stub] Failed to upsert embedding for', evidenceId, err);
		throw err;
	}
}

/**
 * Retrieve the embedding vector for an evidence item.
 *
 * @param evidenceId - UUID of the evidence item
 * @param model - Model name (default: 'embeddinggemma')
 * @returns The vector as number[] or null if not found
 */
export async function getEmbedding(
	evidenceId: string,
	model = 'embeddinggemma'
): Promise<number[] | null> {
	try {
		const result = await db
			.select({ vector: evidenceVectors.vector })
			.from(evidenceVectors)
			.where(and(eq(evidenceVectors.evidenceId, evidenceId), eq(evidenceVectors.model, model)))
			.limit(1);

		const rows = (result as any).rows ?? result;
		return rows.length > 0 ? rows[0].vector : null;
	} catch (err) {
		console.error('[drizzle-stub] Failed to get embedding for', evidenceId, err);
		return null;
	}
}

/**
 * Find evidence items similar to a query vector using pgvector cosine distance.
 *
 * @param queryVector - 768-dim query embedding
 * @param limit - Max results (default: 10)
 * @param model - Model name filter (default: 'embeddinggemma')
 * @returns Array of { evidenceId, distance } sorted by similarity
 */
export async function findSimilar(
	queryVector: number[],
	limit = 10,
	model = 'embeddinggemma'
): Promise<Array<{ evidenceId: string; distance: number }>> {
	try {
		const vectorStr = `[${queryVector.join(',')}]`;
		const result = await db.execute(
			sql`SELECT evidence_id, vector <=> ${vectorStr}::vector AS distance
				FROM evidence_vectors
				WHERE model = ${model}
				ORDER BY vector <=> ${vectorStr}::vector
				LIMIT ${limit}`
		);

		const rows = (result as any).rows ?? result;
		return rows.map((r: any) => ({
			evidenceId: r.evidence_id,
			distance: parseFloat(r.distance),
		}));
	} catch (err) {
		console.error('[drizzle-stub] Similarity search failed:', err);
		return [];
	}
}

/**
 * Delete all vectors for an evidence item (cleanup on evidence deletion).
 */
export async function deleteEmbeddings(evidenceId: string): Promise<void> {
	try {
		await db.delete(evidenceVectors).where(eq(evidenceVectors.evidenceId, evidenceId));
	} catch (err) {
		console.error('[drizzle-stub] Failed to delete embeddings for', evidenceId, err);
	}
}
