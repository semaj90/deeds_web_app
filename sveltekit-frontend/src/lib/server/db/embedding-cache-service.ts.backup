// High-level service for embedding_cache persistence with packed embedding support.
import { embeddingCache } from './schema-postgres.js';
import { packEmbedding } from './embedding-cache-utils.js';
import { eq } from 'drizzle-orm';
import { db } from './client.js'; // Assuming db client export

// DB stores the packed as a string (base64 or similar), the 'embedding' is null.
export interface EmbeddingCacheDbRow {
	id?: number | string;
	textHash: string;
	embedding?: string | null; // packed string in DB
	model?: string | null;
	embeddingScale?: number | null;
	createdAt?: string | null;
}

// Service-level row exposing raw embedding as number[] and packed string
export interface EmbeddingCacheRow {
	id?: number | string;
	textHash: string;
	embedding?: number[] | null; // raw float embedding (service-level)
	packedEmbedding?: string | null; // packed string from DB
	model?: string | null;
	embeddingScale?: number | null;
	createdAt?: string | null;
}

export interface UpsertEmbeddingOptions {
	model: string;
	textHash: string;
	embedding: number[]; // raw float embedding
	packMethod?: 'uint8-linear' | 'int8-symmetric';
}

export async function upsertEmbedding(
	opts: UpsertEmbeddingOptions
): Promise<{ created?: boolean; updated?: boolean; method: string; scale?: number | null }> {
	const { model, textHash, embedding, packMethod = 'int8-symmetric' } = opts;

	// packEmbedding returns { b64, scale, method }
	let packResult: { b64?: string; scale?: number; method?: string } | undefined;
	try {
		// support sync or async packEmbedding implementations
		packResult = await Promise.resolve(packEmbedding(embedding, packMethod));
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`packEmbedding failed for textHash=${textHash}, ${message}`);
	}

	const { b64, scale, method } = packResult || {};
	const normalizedScale = typeof scale === 'number' ? scale : null;
    const packedString = b64 ?? '';

	try {
        // @ts-ignore
		const rows = await db
			.select()
			.from(embeddingCache)
			.where(eq(embeddingCache.textHash, textHash))
			.limit(1);

		const existing = rows.length > 0 ? rows[0] : null;

		if (existing) {
			const updatePayload: Partial<EmbeddingCacheDbRow> = {};
            if (b64 !== undefined && b64 !== null) updatePayload.embedding = b64;
            if (model !== undefined && model !== null) updatePayload.model = model;
            if (normalizedScale !== null) updatePayload.embeddingScale = normalizedScale;

            // @ts-ignore
			await db.update(embeddingCache).set(updatePayload).where(eq(embeddingCache.textHash, textHash));
			return { updated: true, method: method ?? 'unknown', scale: normalizedScale };
		} else {
			const insertPayload = {
				textHash,
				embedding: packedString,
                model,
                embeddingScale: normalizedScale
			};

            // @ts-ignore
			await db.insert(embeddingCache).values(insertPayload);
			return { created: true, method: method ?? 'unknown', scale: normalizedScale };
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`upsertEmbedding failed for textHash=${textHash}, ${message}`);
	}
}

export async function getEmbedding(textHash: string): Promise<EmbeddingCacheRow | null> {
	// @ts-ignore
	const rows = await db
		.select()
		.from(embeddingCache)
		.where(eq(embeddingCache.textHash, textHash));

	const dbRow = rows[0] as unknown as EmbeddingCacheDbRow;
	if (!dbRow) return null;

	const serviceRow: EmbeddingCacheRow = {
		id: dbRow.id,
		textHash: dbRow.textHash,
		packedEmbedding: dbRow.embedding ?? null,
		embedding: null, // callers that need raw floats should call an unpack
		model: dbRow.model ?? null,
		embeddingScale: dbRow.embeddingScale ?? null,
		createdAt: dbRow.createdAt ?? null
	};
	return serviceRow;
}

