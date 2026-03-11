/**
 * Evidence Audit Logger
 * Records all evidence operations for chain of custody compliance.
 * Non-fatal — logs warnings on failure but never blocks the caller.
 */
import db from '$lib/server/db';
import { evidenceAuditLog } from '$lib/server/db/schema-postgres.js';

export type EvidenceAction = 'uploaded' | 'viewed' | 'updated' | 'deleted' | 'exported' | 'tagged' | 'analyzed' | 'gpu_analyzed';

export async function logEvidenceAction(
	evidenceId: string,
	action: EvidenceAction,
	options?: {
		userId?: string;
		changes?: Record<string, unknown>;
		ipAddress?: string;
		userAgent?: string;
	}
): Promise<void> {
	try {
		await db.insert(evidenceAuditLog).values({
			evidenceId,
			action,
			userId: options?.userId ?? null,
			changes: options?.changes ?? null,
			ipAddress: options?.ipAddress ?? null,
			userAgent: options?.userAgent ?? null,
		});
	} catch (err) {
		console.warn(`[Evidence Audit] Failed to log ${action} for ${evidenceId}:`, err);
	}
}
