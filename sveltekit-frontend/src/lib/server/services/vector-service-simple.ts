import { userEmbeddings } from '$lib/server/database/vector-schema-simple';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';

export interface EmbeddingOptions {
	contentType?: string;
	metadata?: Record<string, any>;
}

export class VectorService {
	/**
	 * Store user content embedding
	 */
	static async storeUserEmbedding(
		userId: string,
		content: string,
		embedding: number[],
		options: EmbeddingOptions = {}
	): Promise<string> {
		try {
			const result = await db
				.insert(userEmbeddings)
				.values({
					userId,
					content,
					embedding: JSON.stringify(embedding),
					contentType: options.contentType ?? 'text',
					metadata: options.metadata || {}
				})
				.returning({ id: userEmbeddings.id });

			return result[0]?.id ?? '';
		} catch (error: number | unknown) {
			console.error('Error storing embedding: ', error);
			throw new Error(
				`Failed to store embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Simple similarity search (placeholder)
	 */
	static async searchSimilar(
		query: string,
		options: { limit?: number; threshold?: number } = {}
	): Promise<any[]> {
		try {
			// TODO: Implement proper vector similarity search
			// For now return empty array to avoid errors
			return [];
		} catch (error: number | unknown) {
			console.error('Error searching content: ', error);
			return [];
		}
	}

	/**
	 * Get embeddings for a user
	 */
	static async getUserEmbeddings(userId: string): Promise<any[]> {
		try {
			const results = await db
				.select()
				.from(userEmbeddings)
				.where(eq(userEmbeddings.userId, userId))
				.orderBy(desc(userEmbeddings.createdAt));
			return results;
		} catch (error: number | unknown) {
			console.error('Error getting embeddings: ', error);
			return [];
		}
	}
}

export default VectorService;
