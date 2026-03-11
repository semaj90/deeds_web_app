/**
 * DAG (Data Augmented Generation) SDK
 *
 * Provides TypeScript interfaces and utilities for:
 * - Structured data retrieval (SQL)
 * - Data transformation and aggregation
 * - Statistical analysis
 * - Time-series data integration
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// ============================================================================
// TYPES
// ============================================================================

export interface DAGQuery {
	table: string;
	columns?: string[];
	filters?: Record<string, unknown>;
	orderBy?: string;
	limit?: number;
	aggregate?: {
	function: 'count' | 'sum' | 'avg' | 'min' | 'max';
		column: string;
	};
}

export interface DAGResult {
	data: Record<string, unknown>[];
	totalRows: number;
	query: DAGQuery;
	processingTime: number;
}

export interface DAGConfig {
	schema: Record<string, unknown>;
	maxQueryTime?: number;
}

// ============================================================================
// DAG CLIENT
// ============================================================================

export class DAGClient {
	private config: DAGConfig;
	private db: PostgresJsDatabase | null = null;

	constructor(config: DAGConfig) {
		this.config = config;
	}

	/**
	 * Initialize database connection
	 */
	async initialize(db: PostgresJsDatabase): Promise<void> {
		this.db = db;
	}

	/**
	 * Query structured data from database
	 */
	async query(query: DAGQuery): Promise<DAGResult> {
		if (!this.db) throw new Error('DAG client not initialized');

		const startTime = Date.now();

		try {
			// Build Drizzle query dynamically
			const table = (this.config.schema as any)[query.table];
			if (!table) {
				throw new Error(`Table ${query.table} not found in schema`);
			}

			const { eq, desc, asc, sql } = await import('drizzle-orm');
			let dbQuery = this.db.select().from(table);

			// Apply filters
			if (query.filters) {
				for (const [key, value] of Object.entries(query.filters)) {
					const col = table[key];
					if (col && value !== undefined) {
						dbQuery = dbQuery.where(eq(col, value)) as typeof dbQuery;
					}
				}
			}

			// Apply ordering
			if (query.orderBy) {
				const descending = query.orderBy.startsWith('-');
				const colName = descending ? query.orderBy.slice(1) : query.orderBy;
				const col = table[colName];
				if (col) {
					dbQuery = dbQuery.orderBy(descending ? desc(col) : asc(col)) as typeof dbQuery;
				}
			}

			// Apply limit
			if (query.limit) {
				dbQuery = dbQuery.limit(query.limit);
			}

			const data = await dbQuery;

			return {
				data: data as Record<string, unknown>[],
				totalRows: data.length,
				query,
				processingTime: Date.now() - startTime
			};
		} catch (error) {
			console.error('DAG query failed:', error);
			throw error;
		}
	}

	/**
	 * Augment prompt with structured data
	 */
	augmentPrompt(userPrompt: string, data: DAGResult): string {
		const context = this.formatData(data);

		return `Structured Data Context:\n${context}\n\nUser Question: ${userPrompt}\n\nAnswer:`;
	}

	/**
	 * Format data as table
	 * @private
	 */
	private formatData(result: DAGResult): string {
		if (result.data.length === 0) {
			return 'No data found.';
		}

		const lines: string[] = [];
		const columns = Object.keys(result.data[0]);

		// Header
		lines.push(columns.join(' | '));
		lines.push(columns.map(() => '---').join(' | '));

		// Rows
		for (const row of result.data.slice(0, 10)) {
			// Limit to 10 rows for context
			lines.push(columns.map(col => String(row[col] ?? '')).join(' | '));
		}

		if (result.data.length > 10) {
			lines.push(`... and ${result.data.length - 10} more rows`);
		}

		return lines.join('\n');
	}

	/**
	 * Aggregate data for statistical insights
	 */
	async aggregate(query: DAGQuery): Promise<number> {
		if (!this.db) throw new Error('DAG client not initialized');
		if (!query.aggregate) throw new Error('Aggregate function not specified');

		const table = (this.config.schema as any)[query.table];
		if (!table) throw new Error(`Table ${query.table} not found in schema`);

		const col = table[query.aggregate.column];
		if (!col) throw new Error(`Column ${query.aggregate.column} not found in table ${query.table}`);

		const { sql } = await import('drizzle-orm');
		const fnMap: Record<string, string> = {
			count: 'count',
			sum: 'sum',
			avg: 'avg',
			min: 'min',
			max: 'max',
		};
		const fn = fnMap[query.aggregate.function];
		if (!fn) throw new Error(`Unknown aggregate function: ${query.aggregate.function}`);

		const result = await this.db
			.select({ value: sql<number>`${sql.raw(fn)}(${col})::float` })
			.from(table);

		return result[0]?.value ?? 0;
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<boolean> {
		if (!this.db) return false;

		try {
			// Simple query to verify connection
			await this.db.execute('SELECT 1' as any);
			return true;
		} catch {
			return false;
		}
	}
}

// ============================================================================
// EXPORTS
// ============================================================================

export default DAGClient;
