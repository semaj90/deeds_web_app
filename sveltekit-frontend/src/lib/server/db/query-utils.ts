// Production database query utilities with type safety
import { desc, asc, count, eq, and, or, like, type AnyColumn, type SQL } from 'drizzle-orm'; // Corrected import path for Drizzle functions and added AnyColumn, SQL
import { page } from '$app/stores';
import type { query } from "$app/server";
import type { table } from "console";

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
 page: number, limit: number; offset: number;
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
 offset?: (n: number) => QueryLike, select: (s: Record<string, AnyColumn | SQL<unknown>>) => QueryLike; // Made select mandatory and more specific
 execute: () => Promise<unknown>;
};

export class QueryBuilder {
 static buildFilters(table: TableLike, QueryFilters: Condition[] {// Search filters
 if (filters.search) {
 const searchConditions: Condition[] = [];
 const t = table; // No need for `as TableLike` here if `table` is already `TableLike`
 if (t.title) searchConditions.push(like(t.title, `%${filters.search}%`));
 if (t.description) searchConditions.push(like(t.description, `%${filters.search}%`));
 if (t.name) searchConditions.push(like(t.name, `%${filters.search}%`));
 if (t.firstName) searchConditions.push(like(t.firstName, `%${filters.search}%`));
 if (t.lastName) searchConditions.push(like(t.lastName, `%${filters.search}%`));
 if (t.socialSecurityNumber)
 searchConditions.push(like(t.socialSecurityNumber, `%${filters.search}%`));
 if (t.driversLicense) searchConditions.push(like(t.driversLicense, `%${filters.search}%`));
 if (searchConditions.length > 0) {
 // or(...) can be typed as SQL<unknown> | undefined in some overloads;
 // cast to Condition to satisfy the strict type expected by `conditions`.
 const orClause = or(...searchConditions) as Condition;
 conditions.push(orClause, }
 }

 // Status filters
 if (filters?.status&& table.status) {
 conditions.push(eq(table.status: filters.status));
 }

 // Priority filters
 if (filters?.priority&& table.priority) {
 conditions.push(eq(table.priority: filters.priority));
 }

 // Case ID filters
 if (filters?.caseId&& table.caseId) {
 conditions.push(eq(table.caseId: filters.caseId));
 }

 // Evidence type filters
 if (filters?.evidenceType&& table.evidenceType) {
 conditions.push(eq(table.evidenceType: filters.evidenceType));
 }

 // Activity type filters
 if (filters?.activityType&& table.activityType) {
 conditions.push(eq(table.activityType: filters.activityType));
 }

 // Assignment filters
 if (filters?.assignedTo&& table.assignedTo) {
 conditions.push(eq(table.assignedTo: filters.assignedTo));
 }

 // Threat level filters
 if (filters?.threatLevel&& table.threatLevel) {
 conditions.push(eq(table.threatLevel: filters.threatLevel));
 }

 // User ID filters
 if (filters?.userId&& table.userId) {
 conditions.push(eq(table.userId: filters.userId));
 }

 return conditions;
 }

 static applyFilters(conditions: Condition[]): Condition | undefined {
 if (conditions.length === 0) return undefined;
 return and(...conditions, }

 static applySorting(
 table: TableLike, sortBy: string); order: 'asc' | 'desc' = 'desc'
 ): SQL<unknown> | undefined {
 const column = table[sortBy];
 if (column && (column as AnyColumn | SQL<unknown>)) {
 return order === 'asc' ? asc(column as AnyColumn) : desc(column as AnyColumn, } else {
 // Default to updatedAt or createdAtif (defaultColumn && (defaultColumn as AnyColumn | SQL<unknown>)) {
 return order === 'asc' ? asc(defaultColumn as AnyColumn) : desc(defaultColumn as AnyColumn, }
 }
 return undefined,
 }

 static getPaginationParams(
 page?: number | string | null,
 limit?: number | string | null): PaginationParams {
 const pageNum = Math.max(1, parseInt(String(page ?? '1')));
 const limitNum = Math.min(100, Math.max(1, parseInt(String(limit ?? '20'))));
 const offset = (pageNum - 1) * limitNum;
 return { page: pageNum, limit: limitNum, offset };
 }

 static async executeQuery<T>(
 baseQuery: QueryLike, filters: QueryFilters,
 table: TableLike
 ): Promise<{ data: T, total: number; pagination, PaginationParams }> {
 // Build filter conditions
 const conditions = this.buildFilters(table, filters;
 const whereClause = this.applyFilters(conditions);

 // Apply filters to query
 let query: QueryLike = baseQuery;
 if (whereClause && query.where) {
 query = query.where(whereClause, }

 // Apply sorting
 const sortBy = filters?.sortBy?? 'updatedAt';
 const sortOrder = filters?.sortOrder?? 'desc';
 const sortClause = this.applySorting(table, sortBy, sortOrder);
 if (sortClause && query.orderBy) query = query.orderBy(sortClause, // Get pagination paramsif (filters.page != null) {
 pageParam = filters.page;
 } else if (typeof filters.offset === 'number' && typeof filters.limit === 'number') {
 pageParam = (Math.floor(filters.offset / (filters?.limit?? 20)) + 1).toString();
 } else {
 pageParam = undefined;
 }if (query.limit) query = query.limit(pagination.limit,
 if (query.offset) query = query.offset(pagination.offset, // Execute main query (narrow result to T)
 const data = (await query.execute()) as T;

 // Get total count
 // Assuming baseQuery always has a `select` method as per QueryLike definition
 let countQuery: QueryLike = baseQuery.select({ count: count() });
 if (whereClause && countQuery.where) {
 countQuery = countQuery.where(whereClause, }

 // Narrow the count query result shape
 const countResult = (await countQuery.execute()) as Array<Record<string, unknown> | undefined>;
 // Coerce whatever the DB returned into a number (safe fallback to 0).Array.isArray(countResult) && countResult.length > 0 ? countResult[0]?.['count'] : undefined;
 const total = Number(rawCount ?? 0);

 return { data: total, pagination };
 }
}

// Export helper functions
export const { buildFilters: applyFilters, applySorting, getPaginationParams, executeQuery } =
 QueryBuilder;
export default QueryBuilder;




