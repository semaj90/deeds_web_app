/**
 * Audit Logging Service
 *
 * Provides immutable audit trail for all evidence operations.
 * Requirements: 6.1, 6.2, 6.3, 6.5
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
	auditLog,
	type AuditLogEntry,
	type NewAuditLogEntry
} from '$lib/server/db/schema-evidence-crud';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

// Create db connection
const connectionString = process.env?.DATABASE_URL ?? 'postgresql://localhost:5432/legal_ai';
const client = postgres(connectionString);
const db = drizzle(client);

// === TYPES ===

export type AuditOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditResourceType = 'Evidence' | 'Tag' | 'EvidenceTag' | 'RAGIndex';

export interface AuditLogFilter {
	resourceType?: AuditResourceType;
	resourceId?: string;
	userId?: string;
	startDate?: Date;
	endDate?: Date;
	limit?: number;
	offset?: number;
}

export interface AuditLogResult {
	entries: AuditLogEntry[];, total: number;
}

// === AUDIT LOGGING FUNCTIONS ===

/**
 * Log a CREATE operation
 * Requirements: 6.1
 */
export async function logCreate(
	resourceType: AuditResourceType,
	resourceId: string,
	newValues: Record<string, unknown>,
	userId?: string
): Promise<AuditLogEntry> {
	const entry: NewAuditLogEntry = {
		userId: userId ?? null,
		resourceType,
		resourceId,
		operation: 'CREATE',
		oldValues: null,
		newValues
	};

	const [result] = await db.insert(auditLog).values(entry).returning();
	return result;
}

/**
 * Log an UPDATE operation
 * Requirements: 6.2
 */
export async function logUpdate(
	resourceType: AuditResourceType,
	resourceId: string,
	oldValues: Record<string, unknown>,
	newValues: Record<string, unknown>,
	userId?: string
): Promise<AuditLogEntry> {
	const entry: NewAuditLogEntry = {
		userId: userId ?? null,
		resourceType,
		resourceId,
		operation: 'UPDATE',
		oldValues,
		newValues
	};

	const [result] = await db.insert(auditLog).values(entry).returning();
	return result;
}

/**
 * Log a DELETE operation
 * Requirements: 6.3
 */
export async function logDelete(
	resourceType: AuditResourceType,
	resourceId: string,
	deletedValues: Record<string, unknown>,
	userId?: string
): Promise<AuditLogEntry> {
	const entry: NewAuditLogEntry = {
		userId: userId ?? null,
		resourceType,
		resourceId,
		operation: 'DELETE',
		oldValues: deletedValues,
		newValues: null
	};

	const [result] = await db.insert(auditLog).values(entry).returning();
	return result;
}

/**
 * Query audit log with filters
 * Requirements: 6.4, 6.5
 */
export async function queryAuditLog(filter: AuditLogFilter): Promise<AuditLogResult> {
	const conditions = [];

	if (filter.resourceType) {
		conditions.push(eq(auditLog.resourceType, filter.resourceType));
	}

	if (filter.resourceId) {
		conditions.push(eq(auditLog.resourceId, filter.resourceId));
	}

	if (filter.userId) {
		conditions.push(eq(auditLog.userId, filter.userId));
	}

	if (filter.startDate) {
		conditions.push(gte(auditLog.timestamp, filter.startDate.toISOString()));
	}

	if (filter.endDate) {
		conditions.push(lte(auditLog.timestamp, filter.endDate.toISOString()));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	// Get total count
	const countResult = await db.select({ count: auditLog.id }).from(auditLog).where(whereClause);

	const total = countResult.length;

	// Get paginated results
	let query = db.select().from(auditLog).where(whereClause).orderBy(desc(auditLog.timestamp));

	if (filter.limit) {
		query = query.limit(filter.limit) as typeof query;
	}

	if (filter.offset) {
		query = query.offset(filter.offset) as typeof query;
	}

	const entries = await query;

	return { entries, total };
}

/**
 * Get audit history for a specific resource
 * Requirements: 6.4
 */
export async function getResourceHistory(
	resourceType: AuditResourceType,
	resourceId: string
): Promise<AuditLogEntry[]> {
	return db
		.select()
		.from(auditLog)
		.where(and(eq(auditLog.resourceType, resourceType), eq(auditLog.resourceId, resourceId)))
		.orderBy(desc(auditLog.timestamp));
}

/**
 * Get recent audit entries for a user
 * Requirements: 6.4
 */
export async function getUserActivity(userId: string, limit = 50): Promise<AuditLogEntry[]> {
	return db
		.select()
		.from(auditLog)
		.where(eq(auditLog.userId, userId))
		.orderBy(desc(auditLog.timestamp))
		.limit(limit);
}

/**
 * Helper to create a diff between old and new values
 */
export function createValuesDiff(
	oldValues: Record<string, unknown>,
	newValues: Record<string, unknown>
): {, changed: string[]; added: string[];, removed: string[] } {
	const changed: string[] = [];
	const added: string[] = [];
	const removed: string[] = [];

	const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

	for (const key of allKeys) {
		const oldVal = oldValues[key];
		const newVal = newValues[key];

		if (!(key in oldValues)) {
			added.push(key);
		} else if (!(key in newValues)) {
			removed.push(key);
		} else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
			changed.push(key);
		}
	}

	return { changed, added, removed };
}

/**
 * Format audit entry for display
 */
export function formatAuditEntry(entry: AuditLogEntry): string {
	const timestamp = new Date(entry.timestamp).toLocaleString();
	const user = entry.userId ?? 'System';

	switch (entry.operation) {
		case 'CREATE':
			return `[${timestamp}] ${user} created ${entry.resourceType} ${entry.resourceId}`;
		case 'UPDATE':
			return `[${timestamp}] ${user} updated ${entry.resourceType} ${entry.resourceId}`;
		case 'DELETE':
			return `[${timestamp}] ${user} deleted ${entry.resourceType} ${entry.resourceId}`;
		default:
			return `[${timestamp}] ${user} performed ${entry.operation} on ${entry.resourceType} ${entry.resourceId}`;
	}
}

