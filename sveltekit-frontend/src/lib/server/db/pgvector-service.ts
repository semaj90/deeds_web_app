/**
 * PostgreSQL + pgvector Service
 * Vector similarity search and document embedding storage
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

const DATABASE_URL = ENV.DATABASE_URL;

export class PgVectorService {
	private client: ReturnType<typeof postgres>;
	private db: ReturnType<typeof drizzle>;
	private isConnected: boolean = false;

	constructor() {
		this.client = postgres(DATABASE_URL, { max: 10 });
		this.db = drizzle(this.client);
		this.isConnected = true;
	}

	/**
	 * Test database connection
	 */
	async testConnection(): Promise<{
	success: boolean; details?: any }> {
		try {
			const result = await this.client`SELECT NOW() as current_time, version() as pg_version`;
			return {
				success: true,
				details: {
	currentTime: result[0]?.current_time,
					version: result[0]?.pg_version
				}
			};
		} catch (error) {
			return {
				success: false,
				details: {
	error: (error as Error).message }
			};
		}
	}

	/**
	 * Insert document with vector embedding
	 */
	async insertDocumentWithEmbedding(
		documentId: string,
		content: string,
		embedding: number[],
		metadata: Record<string, any> = {}
	): Promise<{
	success: boolean; id?: string; error?: string }> {
		try {
			// Validate embedding dimensions
			if (!Array.isArray(embedding) || (embedding.length !== 768 && embedding.length !== 1536)) {
				return {
					success: false,
					error: `Invalid embedding dimension: ${embedding?.length || 0}. Expected 768 or 1536.`
				};
			}

			const embeddingStr = `[${embedding.join(',')}]`;
			const title = metadata.title || 'Untitled';
			const docType = metadata.type || 'document';

			const result = await this.client`
				INSERT INTO legal_documents (
					document_id, title, content, document_type, metadata, embedding, created_at
				) VALUES (
					${documentId},
	${title},
	${content},
	${docType},
	${JSON.stringify(metadata)}::jsonb,
					${embeddingStr}::vector,
					NOW()
				)
				ON CONFLICT (document_id) DO UPDATE SET
					title = EXCLUDED.title,
					content = EXCLUDED.content,
					metadata = EXCLUDED.metadata,
					embedding = EXCLUDED.embedding,
					updated_at = NOW()
				RETURNING id
			`;

			return {
				success: true,
				id: result[0]?.id
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message
			};
		}
	}

	/**
	 * Vector similarity search
	 */
	async vectorSimilaritySearch(
		queryEmbedding: number[],
		options: {
			limit?: number;
			distanceMetric?: 'cosine' | 'euclidean' | 'inner_product';
			threshold?: number;
			documentType?: string;
			includeContent?: boolean;
		} = {}
	): Promise<{
	success: boolean; results?: any[]; metadata?: any; error?: string }> {
		try {
			const {
				limit = 10,
				distanceMetric = 'cosine',
				threshold,
				documentType,
				includeContent = false
			} = options;

			// Validate embedding
			if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
				return { success: false, error: 'Invalid query embedding' };
			}

			const embeddingStr = `[${queryEmbedding.join(',')}]`;

			// Distance operator based on metric
			const distanceOp = distanceMetric === 'euclidean' ? '<->'
				: distanceMetric === 'inner_product' ? '<#>'
				: '<=>'; // cosine

			const startTime = Date.now();

			// Build dynamic query
			let results: any[];

			if (documentType && threshold !== undefined) {
				results = await this.client`
					SELECT
						id, document_id, title, document_type, metadata, created_at,
						${includeContent ? sql`content,` : sql``}
						embedding ${sql.unsafe(distanceOp)} ${embeddingStr}::vector AS distance
					FROM legal_documents
					WHERE embedding IS NOT NULL
						AND document_type = ${documentType}
						AND (embedding ${sql.unsafe(distanceOp)} ${embeddingStr}::vector) < ${threshold}
					ORDER BY distance ASC
					LIMIT ${limit}
				`;
			} else if (documentType) {
				results = await this.client`
					SELECT
						id, document_id, title, document_type, metadata, created_at,
						embedding ${sql.unsafe(distanceOp)} ${embeddingStr}::vector AS distance
					FROM legal_documents
					WHERE embedding IS NOT NULL AND document_type = ${documentType}
					ORDER BY distance ASC
					LIMIT ${limit}
				`;
			} else {
				results = await this.client`
					SELECT
						id, document_id, title, document_type, metadata, created_at,
						embedding ${sql.unsafe(distanceOp)} ${embeddingStr}::vector AS distance
					FROM legal_documents
					WHERE embedding IS NOT NULL
					ORDER BY distance ASC
					LIMIT ${limit}
				`;
			}

			const searchTime = Date.now() - startTime;

			return {
				success: true,
				results,
				metadata: {
	searchTimeMs: searchTime,
					totalResults: results.length,
					distanceMetric,
					limit
				}
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message
			};
		}
	}

	/**
	 * Batch insert documents with embeddings
	 */
	async batchInsertDocuments(
		documents: Array<{
	documentId: string;
			content: string;
	embedding: number[];
			metadata?: Record<string, any>;
		}>
	): Promise<{
	success: boolean, inserted: number; errors?: string[] }> {
		const errors: string[] = [];
		let inserted = 0;

		for (const doc of documents) {
			try {
				if (!Array.isArray(doc.embedding)) {
					errors.push(`${doc.documentId}: Missing embedding`);
					continue;
				}

				const result = await this.insertDocumentWithEmbedding(
					doc.documentId,
					doc.content,
					doc.embedding,
					doc.metadata || {}
				);

				if (result.success) {
					inserted++;
				} else {
					errors.push(`${doc.documentId}: ${result.error}`);
				}
			} catch (e) {
				errors.push(`${doc.documentId}: ${(e as Error).message}`);
			}
		}

		return {
			success: errors.length === 0,
			inserted,
			errors: errors.length > 0 ? errors : undefined
		};
	}

	/**
	 * Create IVFFlat index for vector similarity optimization
	 */
	async createVectorIndex(
		options: {
			lists?: number;
			metric?: 'cosine' | 'euclidean' | 'inner_product';
			tableName?: string;
			columnName?: string;
		} = {}
	): Promise<{
	success: boolean; indexName?: string; error?: string }> {
		try {
			const {
				lists = 100,
				metric = 'cosine',
				tableName = 'legal_documents',
				columnName = 'embedding'
			} = options;

			const opClass = metric === 'euclidean' ? 'vector_l2_ops'
				: metric === 'inner_product' ? 'vector_ip_ops'
				: 'vector_cosine_ops';

			const indexName = `idx_${tableName}_${columnName}_${metric}`;

			// Drop existing index if exists
			await this.client`DROP INDEX IF EXISTS ${sql.unsafe(indexName)}`;

			// Create IVFFlat index
			await this.client.unsafe(`
				CREATE INDEX ${indexName}
				ON ${tableName}
				USING ivfflat (${columnName} ${opClass})
				WITH (lists = ${lists})
			`);

			// Analyze table for optimizer
			await this.client.unsafe(`ANALYZE ${tableName}`);

			return {
				success: true,
				indexName
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message
			};
		}
	}

	/**
	 * Get database statistics
	 */
	async getDatabaseStats(): Promise<{
	success: boolean; stats?: any; error?: string }> {
		try {
			const vectorStats = await this.client`
				SELECT
					COUNT(*) FILTER (WHERE embedding IS NOT NULL) as total_embeddings,
					COUNT(*) as total_documents,
					MIN(created_at) as earliest_document,
					MAX(created_at) as latest_document
				FROM legal_documents
			`;

			const docTypeStats = await this.client`
				SELECT document_type COUNT(*) as count
				FROM legal_documents
				WHERE document_type IS NOT NULL
				GROUP BY document_type
				ORDER BY count DESC
			`;

			const sizeStats = await this.client`
				SELECT
					pg_size_pretty(pg_database_size(current_database())) as database_size,
					pg_size_pretty(pg_total_relation_size('legal_documents')) as documents_table_size
			`;

			return {
				success: true,
				stats: {
	vectors: vectorStats[0],
					documentTypes: docTypeStats,
					sizes: sizeStats[0]
				}
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message
			};
		}
	}

	/**
	 * Close database connection
	 */
	async close(): Promise<void> {
		try {
			await this.client.end();
			this.isConnected = false;
			console.log('📡 PostgreSQL connection closed');
		} catch (error) {
			console.error('Error closing PostgreSQL connection:', (error as Error).message);
		}
	}
}

// Export singleton instance
export const pgVectorService = new PgVectorService();

