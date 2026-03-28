/**
 * GET /api/evidence/[id]/audit
 * Returns audit trail for an evidence item (chain of custody compliance).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { evidenceAuditLog, evidence, users } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';

const querySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { id } = params;
	if (!isUuid(id)) throw error(400, 'Invalid evidence ID format');

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const limit = parsed.success ? parsed.data.limit : 50;

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