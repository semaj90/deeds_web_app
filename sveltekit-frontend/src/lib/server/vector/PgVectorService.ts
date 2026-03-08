/**
 * PgVectorService — Full pgvector search + storage service
 * Uses shared Drizzle db pool (not a separate pg.Pool)
 * Provides cosine similarity search, upsert, batch ops, and health checks
 */

import { db, pool } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PgVectorSearchResult {
	id: string;
	score: number;
	source: string;
	content: string;
	metadata: Record<string, unknown>;
	provider: 'pgvector';
}

export interface PgVectorUpsertParams {
	id: string;
	embedding: number[];
	content: string;
	source?: string;
	metadata?: Record<string, unknown>;
}

export interface PgVectorHealthStatus {
	healthy: boolean;
	extensionVersion: string | null;
	tableExists: boolean;
	rowCount: number;
	error?: string;
}

// Allowed filter columns (whitelist to prevent injection)
const ALLOWED_FILTERS = new Set(['source', 'case_id', 'document_type', 'status']);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PgVectorService {
	private readonly tableName = 'embeddings';
	private readonly vectorDimension = 768;

	/**
	 * Cosine similarity search against pgvector
	 * Uses 1 - (vector <=> query) for cosine distance → similarity
	 */
	async search(
		embedding: number[],
		topK = 10,
		filters?: Record<string, string>
	): Promise<PgVectorSearchResult[]> {
		if (embedding.length !== this.vectorDimension) {
			throw new Error(`Expected ${this.vectorDimension}-dim embedding, got ${embedding.length}`);
		}

		const vectorStr = `[${embedding.join(',')}]`;
		let filterClause = '';
		const params: unknown[] = [vectorStr, topK];

		// Build filter clause from whitelisted columns only
		if (filters) {
			const conditions: string[] = [];
			for (const [key, value] of Object.entries(filters)) {
				if (ALLOWED_FILTERS.has(key) && typeof value === 'string') {
					params.push(value);
					conditions.push(`(doc->>'${key}') = $${params.length}`);
				}
			}
			if (conditions.length > 0) {
				filterClause = `WHERE ${conditions.join(' AND ')}`;
			}
		}

		const query = `
			SELECT id, doc, 1.0 - (vector <=> $1::vector) as score
			FROM ${this.tableName}
			${filterClause}
			ORDER BY vector <=> $1::vector
			LIMIT $2
		`;

		const result = await pool.query(query, params);

		return (result.rows as Array<{ id: string; doc: Record<string, unknown> | null; score: number }>).map(
			(row) => ({
				id: row.id,
				score: row.score,
				source: (row.doc?.source as string) ?? 'unknown',
				content: (row.doc?.content as string) ?? '',
				metadata: (row.doc?.meta as Record<string, unknown>) ?? {},
				provider: 'pgvector' as const
			})
		);
	}

	/**
	 * Upsert a single document with embedding
	 */
	async upsert(params: PgVectorUpsertParams): Promise<{ ok: boolean; error?: string }> {
		try {
			const doc = {
				source: params.source ?? null,
				content: params.content,
				meta: params.metadata ?? null
			};

			const vectorStr = `[${params.embedding.join(',')}]`;

			await pool.query(
				`INSERT INTO ${this.tableName} (id, doc, vector)
				 VALUES ($1, $2, $3::vector)
				 ON CONFLICT (id) DO UPDATE SET
					doc = EXCLUDED.doc,
					vector = EXCLUDED.vector`,
				[params.id, JSON.stringify(doc), vectorStr]
			);

			return { ok: true };
		} catch (error) {
			return { ok: false, error: (error as Error).message };
		}
	}

	/**
	 * Batch upsert with size cap to avoid giant SQL payloads
	 */
	async batchUpsert(
		items: PgVectorUpsertParams[],
		batchSize = 50
	): Promise<{ ok: boolean; succeeded: number; failed: number; errors: string[] }> {
		let succeeded = 0;
		let failed = 0;
		const errors: string[] = [];

		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, i + batchSize);
			const results = await Promise.allSettled(batch.map((item) => this.upsert(item)));

			for (const result of results) {
				if (result.status === 'fulfilled' && result.value.ok) {
					succeeded++;
				} else {
					failed++;
					const errMsg =
						result.status === 'rejected'
							? (result.reason as Error).message
							: result.value.error ?? 'Unknown error';
					if (errors.length < 10) errors.push(errMsg);
				}
			}
		}

		return { ok: failed === 0, succeeded, failed, errors };
	}

	/**
	 * Delete a document by ID
	 */
	async delete(id: string): Promise<{ ok: boolean; error?: string }> {
		try {
			await pool.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
			return { ok: true };
		} catch (error) {
			return { ok: false, error: (error as Error).message };
		}
	}

	/**
	 * Health check — verifies pgvector extension and table exist
	 */
	async healthCheck(): Promise<PgVectorHealthStatus> {
		try {
			// Check pgvector extension
			const extResult = await pool.query(
				`SELECT extversion FROM pg_extension WHERE extname = 'vector'`
			);
			const extensionVersion = (extResult.rows[0]?.extversion as string) ?? null;

			// Check table exists and row count
			const tableResult = await pool.query(
				`SELECT COUNT(*)::int as count FROM ${this.tableName}`
			);
			const rowCount = (tableResult.rows[0]?.count as number) ?? 0;

			return {
				healthy: extensionVersion !== null,
				extensionVersion,
				tableExists: true,
				rowCount
			};
		} catch (error) {
			const msg = (error as Error).message;
			return {
				healthy: false,
				extensionVersion: null,
				tableExists: !msg.includes('does not exist'),
				rowCount: 0,
				error: msg
			};
		}
	}

	/**
	 * Count documents matching an optional source filter
	 */
	async count(source?: string): Promise<number> {
		const query = source
			? `SELECT COUNT(*)::int as count FROM ${this.tableName} WHERE (doc->>'source') = $1`
			: `SELECT COUNT(*)::int as count FROM ${this.tableName}`;
		const params = source ? [source] : [];
		const result = await pool.query(query, params);
		return (result.rows[0]?.count as number) ?? 0;
	}
}

// Singleton instance
export const pgVectorService = new PgVectorService();
