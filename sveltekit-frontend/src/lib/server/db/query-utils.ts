// Production database query utilities with type safety
import { and, asc, count, desc, eq, like, or, type AnyColumn, type SQL } from 'drizzle-orm'; // Corrected import path for Drizzle functions and added AnyColumn, SQL
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface QueryFilters {
 search?: string;
 status?: string;
 priority?: string;
 caseId?: string;
 evidenceType?: string;
 activityType?: string;
 assignedTo?: string;
 threatLevel?: string;
 userId?: string;
 limit?: number;
 offset?: number;
 sortBy?: string;
 sortOrder?: 'asc' | 'desc';
 page?: number | string; // added to support page-based pagination
}

export interface PaginationParams {
 page: number; limit: number;
	offset: number;
}

// Minimal typed aliases to: avoid | any/SQL usage and satisfy lint rules
type Condition = SQL<unknown>; // Drizzle conditions are SQL expressions

// Refined TableLike to better represent a Drizzle table with columns
// This type will allow accessing columns with proper Drizzle types
interface TableLike {
 [key: string]: AnyColumn | SQL<unknown> | unknown; // Allow AnyColumn for Drizzle columns
 id?: AnyColumn;
 title?: AnyColumn;
 description?: AnyColumn;
 name?: AnyColumn;
 firstName?: AnyColumn;
 lastName?: AnyColumn;
 socialSecurityNumber?: AnyColumn;
 driversLicense?: AnyColumn;
 status?: AnyColumn;
 priority?: AnyColumn;
 caseId?: AnyColumn;
 evidenceType?: AnyColumn;
 activityType?: AnyColumn;
 assignedTo?: AnyColumn;
 threatLevel?: AnyColumn;
 userId?: AnyColumn;
 updatedAt?: AnyColumn;
 createdAt?: AnyColumn;
}

type QueryLike = {
 where?: (clause: Condition) => QueryLike;
 orderBy?: (clause: SQL<unknown> | undefined) => QueryLike;
 limit?: (n: number) => QueryLike;
 offset?: (n: number) => QueryLike;
 select: (s: Record<string, AnyColumn | SQL<unknown>>) => QueryLike; // Made select mandatory and more specific
 execute: () => Promise<unknown>;
};

export class QueryBuilder {
	static buildFilters(table: TableLike, filters: QueryFilters): Condition[] {
		const conditions: Condition[] = [];
		// Search filters
		if (filters.search) {
			const searchConditions: Condition[] = [];
			const t = table;
			if (t.title) searchConditions.push(like(t.title as AnyColumn, `%${filters.search}%`));
			if (t.description) searchConditions.push(like(t.description as AnyColumn, `%${filters.search}%`));
			if (t.name) searchConditions.push(like(t.name as AnyColumn, `%${filters.search}%`));
			if (t.firstName) searchConditions.push(like(t.firstName as AnyColumn, `%${filters.search}%`));
			if (t.lastName) searchConditions.push(like(t.lastName as AnyColumn, `%${filters.search}%`));
			if (t.socialSecurityNumber)
				searchConditions.push(like(t.socialSecurityNumber as AnyColumn, `%${filters.search}%`));
			if (t.driversLicense) searchConditions.push(like(t.driversLicense as AnyColumn, `%${filters.search}%`));
			if (searchConditions.length > 0) {
				const orClause = or(...searchConditions) as Condition;
				conditions.push(orClause);
			}
		}

		// Filters mapping
		const filterMappings: Array<[keyof QueryFilters, keyof TableLike]> = [
			['status', 'status'],
			['priority', 'priority'],
			['caseId', 'caseId'],
			['evidenceType', 'evidenceType'],
			['activityType', 'activityType'],
			['assignedTo', 'assignedTo'],
			['threatLevel', 'threatLevel'],
			['userId', 'userId']
		];

		for (const [filterKey, tableKey] of filterMappings) {
			const value = filters[filterKey];
			const column = table[tableKey as string];
			if (value && column) {
				conditions.push(eq(column as AnyColumn, value));
			}
		}

		return conditions;
	}

	static applyFilters(conditions: Condition[]): Condition | undefined {
		if (conditions.length === 0) return undefined;
		return and(...conditions);
	}

	static applySorting(
		table: TableLike,
		sortBy: string = 'updatedAt',
		order: 'asc' | 'desc' = 'desc'
	): SQL<unknown> | undefined {
		let column = table[sortBy];
		if (!column) {
			column = table['updatedAt'] || table['createdAt'];
		}

		if (column) {
			return order === 'asc' ? asc(column as AnyColumn) : desc(column as AnyColumn);
		}
		return undefined;
	}

	static getPaginationParams(
		page?: number | string | null,
		limit?: number | string | null
	): PaginationParams {
		const pageNum = Math.max(1, parseInt(String(page ?? '1')));
		const limitNum = Math.min(100, Math.max(1, parseInt(String(limit ?? '20'))));
		const offset = (pageNum - 1) * limitNum;
		return { page: pageNum, limit: limitNum, offset };
	}

	static async executeQuery<T>(
		baseQuery: QueryLike,
		filters: QueryFilters,
		table: TableLike
	): Promise<{
	data: T; total: number;
	pagination: PaginationParams }> {
		const conditions = this.buildFilters(table, filters);
		const whereClause = this.applyFilters(conditions);
		const pagination = this.getPaginationParams(filters.page, filters.limit);

		let query = baseQuery;
		if (whereClause && query.where) {
			query = query.where(whereClause);
		}

		const sortBy = filters.sortBy || 'updatedAt';
		const sortOrder = filters.sortOrder || 'desc';
		const sortClause = this.applySorting(table, sortBy, sortOrder);

		if (sortClause && query.orderBy) {
			query = query.orderBy(sortClause);
		}

		if (query.limit) query = query.limit(pagination.limit);
		if (query.offset) query = query.offset(pagination.offset);

		const data = (await query.execute()) as T;

		// Count query
		const countQuery = baseQuery.select({ count: count() });
		let q: QueryLike = countQuery;
		if (whereClause && q.where) {
			q = q.where(whereClause);
		}

		const countResult = (await q.execute()) as Array<Record<string, unknown>>;
		const total = Number(countResult?.[0]?.['count'] ?? 0);

		return { data, total, pagination };
	}
}

// Export helper functions
export const { buildFilters: applyFilters, applySorting, getPaginationParams, executeQuery } =
 QueryBuilder;
export default QueryBuilder;





