import { sql, type SQL } from 'drizzle-orm';
import { db, pgRows } from '$lib/server/db/client.js';

export async function isEvidenceVectorOutboxAvailableV1(
	executor: { execute(query: SQL): Promise<unknown> } = db,
): Promise<boolean> {
	try {
		const rows = pgRows<{ available: boolean }>(
			await executor.execute(sql`SELECT to_regclass('public.evidence_vector_projection_outbox') IS NOT NULL AS available`),
		);
		return rows[0]?.available === true;
	} catch {
		return false;
	}
}
