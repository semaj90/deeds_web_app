/**
 * Report Audit Logging
 * Legal compliance requirement - track all report CRUD operations
 */

import { db } from '$lib/server/db/client';
import { reportAuditLog } from '$lib/server/db/schema-postgres';
import { eq, desc } from 'drizzle-orm';

export type ReportAction = 'created' | 'updated' | 'deleted' | 'published' | 'exported' | 'previewed';

interface AuditOptions {
	reportId: string;
	userId: string;
	action: ReportAction;
	changes?: any;
	request?: Request;
}

/**
 * Log a report action for audit trail
 * Captures: who, what, when, where (IP), and how (user agent)
 */
export async function auditReportAction(options: AuditOptions): Promise<void> {
	const { reportId, userId, action, changes, request } = options;

	try {
		await db.insert(reportAuditLog).values({
			reportId,
			userId,
			action,
			changes: changes ? JSON.parse(JSON.stringify(changes)) : null, // Ensure it's serializable
			ipAddress: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || null,
			userAgent: request?.headers.get('user-agent') || null,
		});
	} catch (err) {
		// Log but don't throw - audit failures shouldn't block operations
		console.error('[Audit] Failed to log report action:', err);
	}
}

/**
 * Get audit history for a report
 */
export async function getReportAuditHistory(reportId: string, limit: number = 50) {
	return await db
		.select()
		.from(reportAuditLog)
		.where(eq(reportAuditLog.reportId, reportId))
		.orderBy(desc(reportAuditLog.timestamp))
		.limit(limit);
}
