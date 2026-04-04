/**
 * GET /api/evidence/[id]/audit
 * Returns audit trail for an evidence item (chain of custody compliance).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { evidenceAuditLog, evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq, desc } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';

const querySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { id } = params;
	if (!isUuid(id)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

	try {
		const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
		const limit = parsed.success ? parsed.data.limit : 50;

		// Verify evidence exists and belongs to user
		const ev = await db
			.select({ id: evidence.id })
			.from(evidence)
			.where(and(eq(evidence.id, id), eq(evidence.userId, locals.user.id)))
			.limit(1);
		if (!ev[0]) {
			return json({ error: 'Evidence not found' }, { status: 404 });
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
	} catch (err) {
		console.error('[evidence/audit] GET error:', err);
		return json({ evidenceId: id, auditTrail: [], count: 0 });
	}
};
