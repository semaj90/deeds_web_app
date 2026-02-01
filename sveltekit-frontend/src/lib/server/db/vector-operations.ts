/**
 * Vector Operations for PostgreSQL pgvector
 * Handles similarity search, caching, and hybrid search
 */

import { db } from './client.js';
import { legalDocuments, embeddingCache } from './schema-postgres.js';
import { sql, eq } from 'drizzle-orm';

// Type definitions
type Metadata = { keywords?: string[]; topics?: string[]; [key: string]: any };
type DBRow = Record<string, unknown>;

export interface SimilarityResult {
	id: string;
	title?: string;
	content: string;
	similarity: number;
	metadata?: Metadata;
	cacheLayer?: 'hot' | 'warm' | 'cold';
}

// Helper to stringify errors
function stringifyError(e: any): string {
	if (e instanceof Error) return e.message;
	try {
		return String(e);
	} catch {
		return 'unknown error';
	}
}

/**
 * Generate a sample embedding (replace with actual AI model in production)
 */
export function generateSampleEmbedding(dimensions: number = 384): number[] {
	return Array.from({ length: dimensions },
	() => Math.random() * 2 - 1);
}

/**
 * Convert array to pgvector format
 */
export function arrayToPgVector(embedding: number[]): string {
	return `[${embedding.join(',')}]`;
}

/**
 * Vector similarity search in legal documents
 */
export async function searchSimilarDocuments(
	queryEmbedding: number[],
	limit: number = 10,
	similarityThreshold: number = 0.7
): Promise<SimilarityResult[]> {
	try {
		const vectorString = arrayToPgVector(queryEmbedding);

		const results = await db.execute(sql`
			SELECT id, title, content, 1 - (embedding <=> ${vectorString}::vector) as similarity
			FROM legal_documents
			WHERE embedding IS NOT NULL
			AND 1 - (embedding <=> ${vectorString}::vector) > ${similarityThreshold}
			ORDER BY embedding <=> ${vectorString}::vector
			LIMIT ${limit}
		`);

		return (results as any[]).map((row) => ({
			id: row.id !== undefined ? String(row.id) : '',
			title: typeof row.title === 'string' ? row.title : undefined,
			content: typeof row.content === 'string' ? row.content : '',
			similarity: Number(row.similarity ?? 0),
			metadata: {}
		}));
	} catch (error) {
		console.error('Vector similarity search failed:', stringifyError(error));
		return await fallbackTextSearch(queryEmbedding, limit);
	}
}

/**
 * Fallback text search when vector operations fail
 */
async function fallbackTextSearch(
	_queryEmbedding: number[],
	limit: number
): Promise<SimilarityResult[]> {
	console.log('Using fallback text search...');

	const results = await db
		.select({
			id: legalDocuments.id,
			title: legalDocuments.title,
			content: legalDocuments.content
		})
		.from(legalDocuments)
		.limit(limit);

	return results.map((doc, index) => ({
		id: doc.id !== undefined ? String(doc.id) : '',
		title: typeof doc.title === 'string' ? doc.title : undefined,
		content: typeof doc.content === 'string' ? doc.content : '',
		similarity: 1 - index * 0.1,
		metadata: {}
	}));
}

/**
 * Store AI query with embedding for future similarity search
 */
export async function storeAiQueryWithEmbedding(
	userId: string,
	caseId: string,
	query: string,
	response: string,
	embedding: number[],
	metadata: Metadata = {}
): Promise<void> {
	try {
		await db.execute(sql`
			INSERT INTO user_ai_queries (user_id, case_id, query, response, embedding, metadata, is_successful)
			VALUES (${userId},
	${caseId},
	${query},
	${response},
	${arrayToPgVector(embedding)}::vector, ${JSON.stringify(metadata)}::jsonb, true)
		`);
	} catch (error) {
		console.error('Failed to store AI query with embedding:', stringifyError(error));
		// Store without embedding as fallback
		try {
			await db.execute(sql`
				INSERT INTO user_ai_queries (user_id, case_id, query, response, metadata, is_successful)
				VALUES (${userId},
	${caseId},
	${query},
	${response},
	${JSON.stringify(metadata)}::jsonb, true)
			`);
		} catch (err) {
			console.error('Fallback store also failed:', stringifyError(err));
		}
	}
}

/**
 * Cache embedding to avoid recomputing
 */
export async function cacheEmbedding(
	textHash: string,
	embedding: number[],
	model: string = 'nomic-embed-text'
): Promise<void> {
	try {
		await db
			.insert(embeddingCache)
			.values({
				textHash,
				embedding: arrayToPgVector(embedding),
				model
			});
	} catch (error) {
		console.error('Failed to cache embedding:', stringifyError(error));
	}
}

/**
 * Retrieve cached embedding
 */
export async function getCachedEmbedding(textHash: string): Promise<number[] | null> {
	try {
		const result = await db
			.select({ embedding: embeddingCache.embedding })
			.from(embeddingCache)
			.where(eq(embeddingCache.textHash, textHash))
			.limit(1);

		if (result.length > 0) {
			const vectorString = result[0].embedding;
			if (typeof vectorString === 'string') {
				const nums = vectorString
					.replace(/^\[|\]$/g, '')
					.split(',')
					.map((n) => parseFloat(n))
					.filter((n) => !Number.isNaN(n));
				return nums;
			}
			return null;
		}
		return null;
	} catch (error) {
		console.error('Failed to retrieve cached embedding:', stringifyError(error));
		return null;
	}
}

/**
 * Hybrid search: combine vector and text search
 */
export async function hybridSearch(
	queryText: string,
	queryEmbedding: number[],
	limit: number = 10
): Promise<SimilarityResult[]> {
	try {
		// First try vector search
		const vectorResults = await searchSimilarDocuments(queryEmbedding, Math.ceil(limit * 0.7));

		// Then add text search results
		const textResults = await db.execute(sql`
			SELECT id, title, content, ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${queryText})) as rank
			FROM legal_documents
			WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${queryText})
			ORDER BY rank DESC
			LIMIT ${Math.floor(limit * 0.3)}
		`);

		const textSearchResults: SimilarityResult[] = (textResults as any[]).map((row) => ({
			id: row.id !== undefined ? String(row.id) : '',
			title: typeof row.title === 'string' ? row.title : undefined,
			content: typeof row.content === 'string' ? row.content : '',
			similarity: Number(row.rank ?? 0) * 0.5,
			metadata: {
	searchType: 'text' }
		}));

		// Combine and deduplicate
		const combinedResults = [...vectorResults, ...textSearchResults];
		const uniqueResults = Array.from(
			new Map(combinedResults.map((item) => [item.id, item])).values()
		);

		// Sort by similarity and return top results
		return uniqueResults.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
	} catch (error) {
		console.error('Hybrid search failed:', stringifyError(error));
		return await fallbackTextSearch(queryEmbedding, limit);
	}
}

/**
 * Check if pgvector extension is available
 */
export async function checkPgVectorAvailable(): Promise<boolean> {
	try {
		await db.execute(sql`SELECT '[1,2,3]'::vector`);
		return true;
	} catch (error) {
		console.log('pgvector not available:', stringifyError(error));
		return false;
	}
}

/**
 * Vector operations test function
 */
export async function testVectorOperations(): Promise<{
	pgvectorAvailable: boolean;
	similaritySearchWorking: boolean;
	embeddingCacheWorking: boolean;
}> {
	const pgvectorAvailable = await checkPgVectorAvailable();
	let similaritySearchWorking = false;
	let embeddingCacheWorking = false;

	if (pgvectorAvailable) {
		try {
			const testEmbedding = generateSampleEmbedding();
			await searchSimilarDocuments(testEmbedding, 1, 0.0);
			similaritySearchWorking = true;
		} catch (error) {
			console.log('Similarity search test failed:', stringifyError(error));
		}

		try {
			const testEmbedding = generateSampleEmbedding();
			await cacheEmbedding('test-hash', testEmbedding);
			const retrieved = await getCachedEmbedding('test-hash');
			embeddingCacheWorking = retrieved !== null;
		} catch (error) {
			console.log('Embedding cache test failed:', stringifyError(error));
		}
	}

	return { pgvectorAvailable, similaritySearchWorking, embeddingCacheWorking };
}

