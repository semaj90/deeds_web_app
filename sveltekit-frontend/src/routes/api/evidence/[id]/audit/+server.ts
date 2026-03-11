/**
 * GET /api/evidence/[id]/audit
 * Returns audit trail for an evidence item (chain of custody compliance).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { evidenceAuditLog, evidence, users } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

	// Verify evidence exists
	const ev = await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, id)).limit(1);
	if (!ev[0]) {
		throw error(404, 'Evidence not found');
	}

	const logs = await db
		.select({
			id: evidenceAuditLog.id,
			action: evidenceAuditLog.action,
			changes: evidenceAuditLog.changes,
			timestamp: evidenceAuditLog.timestamp,
			ipAddress: evidenceAuditLog.ipAddress,
			userId: evidenceAuditLog.userId,
		})
		.from(evidenceAuditLog)
		.where(eq(evidenceAuditLog.evidenceId, id))
		.orderBy(desc(evidenceAuditLog.timestamp))
		.limit(limit);

	return json({
		evidenceId: id,
		auditTrail: logs,
		count: logs.length,
	});
};
