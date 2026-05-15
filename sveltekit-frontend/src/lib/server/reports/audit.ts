/**
 * Report Audit Logging + Version Tracking
 * Legal compliance requirement - track all report CRUD operations
 * and create version snapshots before destructive changes.
 * Non-fatal — logs warnings on failure but never blocks the caller.
 */

import { db } from '$lib/server/db/client';
import { reportAuditLog, reportVersions, reports } from '$lib/server/db/schema-postgres';
import { eq, desc, sql } from 'drizzle-orm';

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
		console.warn('[Audit] Failed to log report action:', err);
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

/**
 * Create a version snapshot of a report before an update.
 * Captures current title, content, and metadata.
 * Non-fatal — never blocks the caller.
 */
export async function createReportVersion(
	reportId: string,
	options?: {
		changedBy?: string;
		changeReason?: string;
	}
): Promise<void> {
	try {
		const [current] = await db
			.select({
				title: reports.title,
				content: reports.content,
				metadata: reports.metadata,
			})
			.from(reports)
			.where(eq(reports.id, reportId))
			.limit(1);

		if (!current) return;

		const [maxRow] = await db
			.select({ maxVersion: sql<number>`coalesce(max(${reportVersions.version}), 0)` })
			.from(reportVersions)
			.where(eq(reportVersions.reportId, reportId));

		const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

		await db.insert(reportVersions).values({
			reportId,
			version: nextVersion,
			title: current.title ?? null,
			content: current.content ?? null,
			metadata: current.metadata ?? null,
			changedBy: options?.changedBy ?? null,
			changeReason: options?.changeReason ?? null,
		});
	} catch (err) {
		console.warn(`[Report Version] Failed to create version for ${reportId}:`, err);
	}
}

/**
 * Get version history for a report (newest first)
 */
export async function getReportVersions(reportId: string, limit: number = 20) {
	return await db
		.select()
		.from(reportVersions)
		.where(eq(reportVersions.reportId, reportId))
		.orderBy(desc(reportVersions.createdAt))
		.limit(limit);
}
