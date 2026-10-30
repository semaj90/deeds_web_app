import { db } from '$lib/server/db/client';
import { evidenceVectors } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql } from 'drizzle-orm';
import { pgRows } from '$lib/server/db/client';
import { validateEvidenceEmbeddingV1 } from '$lib/server/evidence-indexing-receipt-v1.js';
import {
  assertEvidenceEmbeddingAdmitted,
  type EvidenceEmbeddingProvenance,
} from '$lib/server/evidence/evidence-embedding-contract.js';

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
  if (validateEvidenceEmbeddingV1(vector) !== 'valid') {
    throw new Error('evidence_vectors accepts only finite 768-dimensional embeddings');
  }
  const content = typeof meta.content === 'string' ? meta.content : '';
  const sourceRevision = typeof meta.sourceRevision === 'string' ? meta.sourceRevision : '';
  const chunkIndex = Number.isInteger(meta.chunkIndex) ? Number(meta.chunkIndex) : -1;
  const provenance = (meta.provenance ?? null) as EvidenceEmbeddingProvenance | null;
  const admission = assertEvidenceEmbeddingAdmitted({
    evidenceId,
    sourceRevision,
    chunkIndex,
    content,
    vector,
    provenance,
  });
  const model = (meta.model as string) || 'embeddinggemma';

  try {
    // Check if a vector for this evidence+model already exists
    const existing = await db
      .select({ id: evidenceVectors.id })
      .from(evidenceVectors)
      .where(and(
        eq(evidenceVectors.evidenceId, evidenceId),
        eq(evidenceVectors.chunkIndex, chunkIndex),
        eq(evidenceVectors.sourceRevision, sourceRevision),
        eq(evidenceVectors.model, model),
      ))
      .limit(1);

    if (existing.length > 0) {
      // Update existing vector
      await db
        .update(evidenceVectors)
        .set({
          embedding: vector,
          content,
          chunkIndex,
          sourceRevision,
          embeddingType: admission.embeddingType,
          sourceField: admission.sourceField,
        })
        .where(eq(evidenceVectors.id, existing[0].id));
    } else {
      // Insert new vector
      await db.insert(evidenceVectors).values({
        evidenceId,
        chunkIndex,
        content,
        embedding: vector,
        sourceRevision,
        embeddingType: admission.embeddingType,
        sourceField: admission.sourceField,
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
      .select({ vector: evidenceVectors.embedding })
      .from(evidenceVectors)
      .where(and(eq(evidenceVectors.evidenceId, evidenceId), eq(evidenceVectors.model, model)))
      .limit(1);

    return result.length > 0 ? result[0].vector : null;
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
  if (validateEvidenceEmbeddingV1(queryVector) !== 'valid') {
    throw new Error('evidence vector search requires a finite 768-dimensional query');
  }
  try {
    const vectorStr = `[${queryVector.join(',')}]`;
    const result = await db.execute(
      sql`SELECT evidence_id, embedding <=> ${vectorStr}::vector AS distance
				FROM evidence_vectors
				WHERE model = ${model} AND embedding IS NOT NULL
				ORDER BY embedding <=> ${vectorStr}::vector
				LIMIT ${limit}`
    );

    return pgRows(result).map((r: any) => ({
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
