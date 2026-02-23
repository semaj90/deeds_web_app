import { db } from '$lib/server/db/client';
import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

/**
 * GET /api/dashboard/stats
 * Aggregate counts for the dashboard overview
 */
export const GET: RequestHandler = async () => {
	const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> =>
		p.catch(() => fallback);

	const exec = async (query: ReturnType<typeof sql>) => {
		try {
			const result = await db.execute(query);
			const rows = Array.isArray(result) ? result : [];
			return (rows[0] as Record<string, unknown>) ?? {};
		} catch {
			return {};
		}
	};

	const [cases, evidence, persons, citations] = await Promise.all([
		exec(sql`SELECT
			COUNT(*) FILTER (WHERE status IN ('open', 'active', 'investigating')) as active,
			COUNT(*) as total
			FROM cases`),
		exec(sql`SELECT
			COUNT(*) FILTER (WHERE status = 'pending') as pending,
			COUNT(*) FILTER (WHERE status = 'approved') as approved
			FROM evidence`),
		exec(sql`SELECT COUNT(*) as total FROM persons_of_interest`),
		exec(sql`SELECT COUNT(*) as total FROM saved_citations`)
	]);

	return json({
		activeCases: Number(cases.active ?? 0),
		pendingEvidence: Number(evidence.pending ?? 0),
		approvedEvidence: Number(evidence.approved ?? 0),
		personsOfInterest: Number(persons.total ?? 0),
		totalCitations: Number(citations.total ?? 0),
		recentActivity: Number(cases.total ?? 0)
	});
};
