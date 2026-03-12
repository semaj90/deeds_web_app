/**
 * Evidence Audit Logger + Version Tracker
 * Records all evidence operations for chain of custody compliance.
 * Creates version snapshots when evidence metadata changes.
 * Non-fatal — logs warnings on failure but never blocks the caller.
 */
import db from '$lib/server/db';
import { evidenceAuditLog, evidenceVersions, evidence } from '$lib/server/db/schema-postgres.js';
import { eq, desc, sql } from 'drizzle-orm';

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

/**
 * Create a version snapshot for an evidence item.
 * Captures current title, description, and metadata before an update.
 * Non-fatal — never blocks the caller.
 */
export async function createEvidenceVersion(
	evidenceId: string,
	options?: {
		changedBy?: string;
		changeReason?: string;
	}
): Promise<void> {
	try {
		// Get current evidence state + next version number
		const [current] = await db
			.select({
				title: evidence.title,
				description: evidence.description,
				metadata: evidence.metadata,
			})
			.from(evidence)
			.where(eq(evidence.id, evidenceId))
			.limit(1);

		if (!current) return;

		// Get max version for this evidence
		const [maxRow] = await db
			.select({ maxVersion: sql<number>`coalesce(max(${evidenceVersions.version}), 0)` })
			.from(evidenceVersions)
			.where(eq(evidenceVersions.evidenceId, evidenceId));

		const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

		await db.insert(evidenceVersions).values({
			evidenceId,
			version: nextVersion,
			title: current.title ?? null,
			description: current.description ?? null,
			metadata: current.metadata ?? null,
			changedBy: options?.changedBy ?? null,
			changeReason: options?.changeReason ?? null,
		});
	} catch (err) {
		console.warn(`[Evidence Version] Failed to create version for ${evidenceId}:`, err);
	}
}
